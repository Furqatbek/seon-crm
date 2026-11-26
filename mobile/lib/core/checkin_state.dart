import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/checkin.dart';
import 'home_state.dart';
import 'state.dart';

/// Set in main.
final checkinRepositoryProvider = Provider<CheckinRepository>((ref) => throw UnimplementedError('checkinRepositoryProvider'));

/// Set in main.
final qrSecretStoreProvider = Provider<QrSecretStore>((ref) => throw UnimplementedError('qrSecretStoreProvider'));

/// Set in main.
final screenLightProvider = Provider<ScreenLight>((ref) => throw UnimplementedError('screenLightProvider'));

/// The student's id and secret. The one kept on the phone is used at once, so
/// the code shows without a connection; the server's is asked for alongside,
/// and replaces it when the password or the phone was changed.
class QrIdentityController extends AsyncNotifier<QrIdentity?> {
  @override
  Future<QrIdentity?> build() async {
    final profileId = ref.watch(authProvider.select((auth) => auth.profile?.id));
    if (profileId == null) return null;
    final kept = await ref.read(qrSecretStoreProvider).read(profileId);
    if (kept != null) {
      unawaited(Future.microtask(refresh));
      return kept;
    }
    // The first time needs the server.
    return _fetch(profileId);
  }

  Future<QrIdentity> _fetch(String profileId) async {
    final identity = await ref.read(checkinRepositoryProvider).identity();
    await ref.read(qrSecretStoreProvider).write(profileId, identity);
    return identity;
  }

  /// Asks the server again. Offline, what the phone has stays.
  Future<void> refresh() async {
    final profileId = ref.read(authProvider).profile?.id;
    if (profileId == null) return;
    try {
      final identity = await _fetch(profileId);
      if (ref.mounted && ref.read(authProvider).profile?.id == profileId) state = AsyncData(identity);
    } catch (error, stack) {
      if (ref.mounted && state.value == null) state = AsyncError(error, stack);
    }
  }
}

// Not retried by itself: the tab asks again each time it is opened, and has a Retry button.
final qrIdentityProvider = AsyncNotifierProvider<QrIdentityController, QrIdentity?>(QrIdentityController.new, retry: (_, _) => null);

/// Today's last visit, kept live: read once, then again whenever reception
/// scans the code. Null before the first visit of the day, or offline.
final todayVisitProvider = StreamProvider<Visit?>((ref) async* {
  final profileId = ref.watch(authProvider.select((auth) => auth.profile?.id));
  if (profileId == null) {
    yield null;
    return;
  }
  final repository = ref.watch(checkinRepositoryProvider);
  final clock = ref.watch(clockProvider);
  Future<Visit?> read() async {
    try {
      return await repository.lastVisitToday(clock());
    } catch (_) {
      return null;
    }
  }

  yield await read();
  await for (final _ in repository.visitChanges()) {
    yield await read();
  }
});
