import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// The offer an App user gets — docs/STUDENT_APP_SPEC.md → "Rules → Vouchers"
// and "Rules → Free open lessons". The server issues the voucher, counts the
// seats, keeps the one-booking rule and the two-hour cutoff. The app shows
// what it is told and sends taps.

DateTime _time(Object? value) => DateTime.parse(value! as String).toUtc();
Map<String, dynamic> _map(Object? value) => Map<String, dynamic>.from(value! as Map);
List<Map<String, dynamic>> _list(Object? value) => [for (final item in (value as List? ?? const [])) _map(item)];
int _int(Object? value) => (value as num?)?.toInt() ?? 0;

/// One date of a weekly open lesson, in the next four weeks.
class OpenLessonSession {
  const OpenLessonSession({
    required this.slotId,
    required this.date,
    required this.title,
    required this.startsAt,
    required this.durationMin,
    required this.seats,
    required this.seatsLeft,
    this.level,
    this.room,
    this.teacher,
  });

  final String slotId;

  /// "2026-11-28", the Tashkent day: what the server is asked to book.
  final String date;
  final String title;

  /// beginner, topik1 or topik2; null when it is for every level.
  final String? level;
  final DateTime startsAt;
  final int durationMin;
  final String? room;
  final String? teacher;
  final int seats;
  final int seatsLeft;

  DateTime get endsAt => startsAt.add(Duration(minutes: durationMin));

  factory OpenLessonSession.fromJson(Map<String, dynamic> json) => OpenLessonSession(
    slotId: '${json['slot_id']}',
    date: '${json['session_date']}',
    title: '${json['title']}',
    level: json['korean_level'] as String?,
    startsAt: _time(json['starts_at']),
    durationMin: _int(json['duration_min']),
    room: json['room'] as String?,
    teacher: json['teacher'] as String?,
    seats: _int(json['seats']),
    seatsLeft: _int(json['seats_left']),
  );
}

/// The person's own booking.
class OpenLessonBooking {
  const OpenLessonBooking({
    required this.id,
    required this.slotId,
    required this.date,
    required this.title,
    required this.startsAt,
    required this.durationMin,
    required this.cancelUntil,
    this.level,
    this.room,
    this.teacher,
  });

  final String id;
  final String slotId;
  final String date;
  final String title;
  final String? level;
  final DateTime startsAt;
  final int durationMin;
  final String? room;
  final String? teacher;

  /// Cancelling closes two hours before the start.
  final DateTime cancelUntil;

  DateTime get endsAt => startsAt.add(Duration(minutes: durationMin));

  factory OpenLessonBooking.fromJson(Map<String, dynamic> json) => OpenLessonBooking(
    id: '${json['id']}',
    slotId: '${json['slot_id']}',
    date: '${json['session_date']}',
    title: '${json['title']}',
    level: json['korean_level'] as String?,
    startsAt: _time(json['starts_at']),
    durationMin: _int(json['duration_min']),
    room: json['room'] as String?,
    teacher: json['teacher'] as String?,
    cancelUntil: _time(json['cancel_until']),
  );
}

class OpenLessons {
  const OpenLessons({required this.serverNow, required this.sessions, this.booking});

  final DateTime serverNow;
  final List<OpenLessonSession> sessions;
  final OpenLessonBooking? booking;

  factory OpenLessons.fromJson(Map<String, dynamic> json) => OpenLessons(
    serverNow: _time(json['server_now']),
    sessions: [for (final session in _list(json['sessions'])) OpenLessonSession.fromJson(session)],
    booking: json['booking'] is Map ? OpenLessonBooking.fromJson(_map(json['booking'])) : null,
  );
}

enum OfferFailure { noSuchSession, full, alreadyBooked, tooLate, notAllowed }

class OfferException implements Exception {
  const OfferException(this.failure);

  final OfferFailure failure;

  static OfferException? fromCode(String? code) => switch (code) {
    'EO001' || 'P0002' => const OfferException(OfferFailure.noSuchSession),
    'EO002' => const OfferException(OfferFailure.full),
    'EO003' => const OfferException(OfferFailure.alreadyBooked),
    'EO004' => const OfferException(OfferFailure.tooLate),
    '42501' => const OfferException(OfferFailure.notAllowed),
    _ => null,
  };

  @override
  String toString() => 'OfferException(${failure.name})';
}

abstract class OfferRepository {
  /// The person's voucher, whatever its state; null when they have none.
  Future<HomeVoucher?> voucher();

  /// The open lessons of the next four weeks, and the person's booking.
  Future<OpenLessons> openLessons();

  /// Books a seat; the booking's id.
  Future<String> book(String slotId, String date);

  Future<void> cancel(String bookingId);
}

/// A voucher row as the app holds it.
HomeVoucher voucherFromRow(Map<String, dynamic> row, DateTime now) {
  final expiresAt = _time(row['expires_at']);
  final status = '${row['status']}';
  return HomeVoucher(
    kind: '${row['type']}',
    value: _int(row['value']),
    expiresAt: expiresAt,
    code: '${row['code']}',
    // Past its date it is expired, whether or not the hourly job has run.
    status: status == 'issued' && !expiresAt.isAfter(now) ? 'expired' : status,
  );
}

class SupabaseOfferRepository implements OfferRepository {
  SupabaseOfferRepository(this._client);

  final SupabaseClient _client;

  Future<T> _ask<T>(Future<T> Function() call) => reachServer(() async {
    try {
      return await call();
    } on PostgrestException catch (error) {
      throw OfferException.fromCode(error.code) ?? error;
    }
  });

  @override
  Future<HomeVoucher?> voucher() => _ask(() async {
    // Row level security returns the caller's own voucher only.
    final row = await _client.from('vouchers').select('code, type, value, expires_at, status').order('issued_at', ascending: false).limit(1).maybeSingle();
    return row == null ? null : voucherFromRow(row, DateTime.now().toUtc());
  });

  @override
  Future<OpenLessons> openLessons() => _ask(() async => OpenLessons.fromJson(_map(await _client.rpc('open_lessons'))));

  @override
  Future<String> book(String slotId, String date) =>
      _ask(() async => '${await _client.rpc('book_open_lesson', params: {'p_slot_id': slotId, 'p_session_date': date})}');

  @override
  Future<void> cancel(String bookingId) => _ask(() async {
    await _client.rpc('cancel_open_lesson_booking', params: {'p_id': bookingId});
  });
}
