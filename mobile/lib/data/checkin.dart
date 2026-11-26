import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:screen_brightness/screen_brightness.dart' as device;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// QR check-in — docs/STUDENT_APP_SPEC.md → "Rules → QR check-in". The phone
// makes the code by itself, so it works offline; reception's scanner asks the
// server whether it is good. The server's side is verify_checkin() in
// supabase/migrations/20261209100000_qr_checkin.sql: the two must write the
// very same code for the same moment.

/// A code is good for this long, and for one more step after it.
const qrStepSeconds = 30;

/// Which 30-second step of Unix time a moment is in.
int qrStep(DateTime now) => now.toUtc().millisecondsSinceEpoch ~/ (qrStepSeconds * 1000);

/// How far through its step a moment is, from 0 to 1.
double qrStepProgress(DateTime now) => (now.toUtc().millisecondsSinceEpoch % (qrStepSeconds * 1000)) / (qrStepSeconds * 1000);

/// `v1.<student_id>.<time_step>.<signature>`: the signature is HMAC-SHA256 of
/// everything before it, keyed with the student's secret, in hex.
String qrCode({required String secret, required String studentId, required DateTime now}) {
  final payload = 'v1.$studentId.${qrStep(now)}';
  final signature = Hmac(sha256, utf8.encode(secret)).convert(utf8.encode(payload));
  return '$payload.$signature';
}

/// What the phone needs to make codes: whose they are and the secret.
class QrIdentity {
  const QrIdentity({required this.studentId, required this.secret});

  final String studentId;
  final String secret;

  @override
  bool operator ==(Object other) => other is QrIdentity && other.studentId == studentId && other.secret == secret;

  @override
  int get hashCode => Object.hash(studentId, secret);
}

/// An arrival or a leaving at reception.
class Visit {
  const Visit({required this.arrived, required this.at});

  /// Arrived, or left.
  final bool arrived;
  final DateTime at;
}

abstract class CheckinRepository {
  /// The signed-in student's id and secret, from the server. Changing the
  /// password or the phone replaces the secret, so this is asked for whenever
  /// there is a connection.
  Future<QrIdentity> identity();

  /// The student's last visit since the start of the Tashkent day, or null.
  Future<Visit?> lastVisitToday(DateTime now);

  /// Fires when reception scans the student in or out.
  Stream<void> visitChanges();
}

/// Where the secret is kept on the phone.
abstract class QrSecretStore {
  /// The identity kept for this account, or null.
  Future<QrIdentity?> read(String profileId);

  Future<void> write(String profileId, QrIdentity identity);

  /// On Log out and Delete account.
  Future<void> clear();
}

/// The screen's brightness, raised while the code is shown so a scanner reads it.
abstract class ScreenLight {
  Future<void> raise();

  Future<void> restore();
}

class SupabaseCheckinRepository implements CheckinRepository {
  SupabaseCheckinRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<QrIdentity> identity() => reachServer(() async {
    final answer = Map<String, dynamic>.from(await _client.rpc('qr_secret') as Map);
    return QrIdentity(studentId: '${answer['student_id']}', secret: '${answer['secret']}');
  });

  @override
  Future<Visit?> lastVisitToday(DateTime now) => reachServer(() async {
    // The Tashkent day starts five hours before the UTC one.
    final local = now.toUtc().add(const Duration(hours: 5));
    final dayStart = DateTime.utc(local.year, local.month, local.day).subtract(const Duration(hours: 5));
    // Row level security returns the student's own visits only.
    final rows = await _client.from('visits').select('kind, at').gte('at', dayStart.toIso8601String()).order('at', ascending: false).limit(1);
    if (rows.isEmpty) return null;
    return Visit(arrived: rows.first['kind'] == 'arrived', at: DateTime.parse(rows.first['at'] as String).toUtc());
  });

  @override
  Stream<void> visitChanges() {
    final id = _client.auth.currentUser?.id;
    if (id == null) return const Stream.empty();
    late final StreamController<void> controller;
    RealtimeChannel? channel;
    controller = StreamController<void>.broadcast(
      onListen: () {
        // Realtime sends only rows the person may read: their own visits.
        channel = _client
            .channel('visits:$id')
            .onPostgresChanges(event: PostgresChangeEvent.insert, schema: 'public', table: 'visits', callback: (_) => controller.add(null))
            .subscribe();
      },
      onCancel: () {
        final open = channel;
        channel = null;
        if (open != null) _client.removeChannel(open);
      },
    );
    return controller.stream;
  }
}

/// The Keychain on iOS, the Keystore-backed store on Android.
class SecureQrSecretStore implements QrSecretStore {
  const SecureQrSecretStore([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  static const _key = 'qr_identity';

  @override
  Future<QrIdentity?> read(String profileId) async {
    try {
      final saved = await _storage.read(key: _key);
      if (saved == null) return null;
      final json = jsonDecode(saved) as Map<String, dynamic>;
      // Someone else signed in on this phone before: not theirs to use.
      if (json['profile_id'] != profileId) return null;
      return QrIdentity(studentId: json['student_id'] as String, secret: json['secret'] as String);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String profileId, QrIdentity identity) =>
      _storage.write(key: _key, value: jsonEncode({'profile_id': profileId, 'student_id': identity.studentId, 'secret': identity.secret}));

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {
      // Nothing was kept.
    }
  }
}

class DeviceScreenLight implements ScreenLight {
  const DeviceScreenLight();

  @override
  Future<void> raise() async {
    try {
      await device.ScreenBrightness.instance.setApplicationScreenBrightness(1);
    } catch (_) {
      // A phone that will not change it still shows the code.
    }
  }

  @override
  Future<void> restore() async {
    try {
      await device.ScreenBrightness.instance.resetApplicationScreenBrightness();
    } catch (_) {}
  }
}
