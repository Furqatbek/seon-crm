import 'package:student/data/home.dart';
import 'package:student/data/offers.dart';

// The voucher and the open lessons in memory, with the rules of
// supabase/migrations/20261213100000_vouchers_open_lessons.sql: one active
// booking per person, no booking of a full lesson, and cancelling up to two
// hours before the start.

/// "Birinchi oyga 20% chegirma", KOR-7F3K9, until 7 December.
HomeVoucher sampleVoucher({String kind = 'percent', int value = 20, String status = 'issued', DateTime? expiresAt}) =>
    HomeVoucher(kind: kind, value: value, expiresAt: expiresAt ?? DateTime.utc(2026, 12, 7, 10), code: 'KOR-7F3K9', status: status);

/// Saturdays at 11:00 in Tashkent for TOPIK I, as in the designs (the third is
/// full), and a Wednesday evening for TOPIK II.
List<OpenLessonSession> sampleSessions() => [
  for (final (day, left) in [(28, 6), (35, 6), (42, 0), (49, 10)])
    OpenLessonSession(
      slotId: 'slot-sat',
      date: _date(DateTime.utc(2026, 11, day)),
      title: 'Koreys tili: ochiq dars',
      level: 'topik1',
      startsAt: DateTime.utc(2026, 11, day, 6),
      durationMin: 90,
      room: '101-xona',
      teacher: 'Malika Tursunova',
      seats: 10,
      seatsLeft: left,
    ),
  OpenLessonSession(
    slotId: 'slot-wed',
    date: '2026-12-02',
    title: 'TOPIK II: ochiq dars',
    level: 'topik2',
    startsAt: DateTime.utc(2026, 12, 2, 13, 30),
    durationMin: 60,
    room: '204-xona',
    teacher: 'Jasur Karimov',
    seats: 8,
    seatsLeft: 3,
  ),
];

String _date(DateTime day) => '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

class FakeOfferRepository implements OfferRepository {
  FakeOfferRepository({required this.now, List<OpenLessonSession>? sessions}) : sessions = sessions ?? sampleSessions();

  DateTime Function() now;

  /// The person's voucher; null until they have one.
  HomeVoucher? voucherValue;
  List<OpenLessonSession> sessions;
  OpenLessonBooking? booking;

  /// Every call fails with this while it is set.
  Object? failure;
  final calls = <String>[];

  Future<T> _call<T>(String name, T Function() run) async {
    calls.add(name);
    if (failure != null) throw failure!;
    return run();
  }

  OpenLessonSession _with(OpenLessonSession session, int seatsLeft) => OpenLessonSession(
    slotId: session.slotId,
    date: session.date,
    title: session.title,
    level: session.level,
    startsAt: session.startsAt,
    durationMin: session.durationMin,
    room: session.room,
    teacher: session.teacher,
    seats: session.seats,
    seatsLeft: seatsLeft,
  );

  /// Books as the server would, without the app: a booking made earlier.
  OpenLessonBooking bookNow(String slotId, String date) {
    final index = sessions.indexWhere((session) => session.slotId == slotId && session.date == date && session.startsAt.isAfter(now()));
    if (index < 0) throw const OfferException(OfferFailure.noSuchSession);
    if (booking != null) throw const OfferException(OfferFailure.alreadyBooked);
    final session = sessions[index];
    if (session.seatsLeft <= 0) throw const OfferException(OfferFailure.full);
    sessions[index] = _with(session, session.seatsLeft - 1);
    return booking = OpenLessonBooking(
      id: 'booking-${calls.length}',
      slotId: session.slotId,
      date: session.date,
      title: session.title,
      level: session.level,
      startsAt: session.startsAt,
      durationMin: session.durationMin,
      room: session.room,
      teacher: session.teacher,
      cancelUntil: session.startsAt.subtract(const Duration(hours: 2)),
    );
  }

  @override
  Future<HomeVoucher?> voucher() => _call('voucher', () {
    final value = voucherValue;
    if (value == null || value.status != 'issued' || value.expiresAt.isAfter(now())) return value;
    return HomeVoucher(kind: value.kind, value: value.value, expiresAt: value.expiresAt, code: value.code, status: 'expired');
  });

  @override
  Future<OpenLessons> openLessons() => _call(
    'openLessons',
    () => OpenLessons(
      serverNow: now(),
      sessions: [...sessions.where((session) => session.startsAt.isAfter(now()))]..sort((a, b) => a.startsAt.compareTo(b.startsAt)),
      booking: booking != null && booking!.endsAt.isAfter(now()) ? booking : null,
    ),
  );

  @override
  Future<String> book(String slotId, String date) => _call('book', () => bookNow(slotId, date).id);

  @override
  Future<void> cancel(String bookingId) => _call('cancel', () {
    final mine = booking;
    if (mine == null || mine.id != bookingId) throw const OfferException(OfferFailure.noSuchSession);
    if (now().isAfter(mine.cancelUntil)) throw const OfferException(OfferFailure.tooLate);
    final index = sessions.indexWhere((session) => session.slotId == mine.slotId && session.date == mine.date);
    if (index >= 0) sessions[index] = _with(sessions[index], sessions[index].seatsLeft + 1);
    booking = null;
  });
}
