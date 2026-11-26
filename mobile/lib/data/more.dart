import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// What the More pages read. Every number is the server's.

/// A linked student's record, as the app may show it. Only staff change it.
class StudentDetails {
  const StudentDetails({required this.fullName, this.birthDate, this.parentName, this.parentPhone});

  final String fullName;
  final DateTime? birthDate;
  final String? parentName;
  final String? parentPhone;
}

class LeaderRow {
  const LeaderRow({required this.rank, required this.name, required this.coins, this.isMe = false});

  final int rank;

  /// First name and last initial: "Aziza K."
  final String name;
  final int coins;
  final bool isMe;

  /// "AK"
  String get initials => name.split(RegExp(r'\s+')).where((part) => part.isNotEmpty).map((part) => part.substring(0, 1)).take(2).join().toUpperCase();
}

class ScheduleLesson {
  const ScheduleLesson({
    required this.id,
    required this.groupName,
    required this.day,
    required this.startMinutes,
    required this.durationMin,
    this.cancelled = false,
    this.isExam = false,
    this.examTitle,
    this.room,
    this.teacher,
  });

  final String id;
  final String groupName;

  /// The Tashkent calendar day.
  final DateTime day;

  /// Minutes after midnight, Tashkent time.
  final int startMinutes;
  final int durationMin;
  final bool cancelled;
  final bool isExam;
  final String? examTitle;
  final String? room;
  final String? teacher;

  static String _clock(int minutes) => '${((minutes ~/ 60) % 24).toString().padLeft(2, '0')}:${(minutes % 60).toString().padLeft(2, '0')}';

  /// "18:00"
  String get startsAt => _clock(startMinutes);

  /// "19:30"
  String get endsAt => _clock(startMinutes + durationMin);

  factory ScheduleLesson.fromRow(Map<String, dynamic> row) {
    final date = DateTime.parse(row['lesson_date'] as String);
    final time = (row['start_time'] as String).split(':');
    return ScheduleLesson(
      id: '${row['lesson_id']}',
      groupName: '${row['group_name']}',
      day: DateTime.utc(date.year, date.month, date.day),
      startMinutes: int.parse(time[0]) * 60 + int.parse(time[1]),
      durationMin: (row['duration_min'] as num?)?.toInt() ?? 90,
      cancelled: row['status'] == 'cancelled',
      isExam: row['kind'] == 'exam',
      examTitle: row['exam_title'] as String?,
      room: row['room'] as String?,
      teacher: row['teacher'] as String?,
    );
  }
}

/// A payment taken or a fee charged.
class LedgerEntry {
  const LedgerEntry({required this.at, required this.amount, required this.isPayment, this.receiptNo, this.billingMonth, this.isAdjustment = false});

  /// When it was paid, or charged.
  final DateTime at;

  /// Whole soʻm: above zero for a payment and a credit, below for a fee.
  final int amount;
  final bool isPayment;
  final int? receiptNo;

  /// The first day of the month a fee is for.
  final DateTime? billingMonth;
  final bool isAdjustment;

  /// The month it is listed under: the fee's month, or the month it was paid in (Tashkent).
  DateTime get month {
    final day = billingMonth ?? at.toUtc().add(const Duration(hours: 5));
    return DateTime.utc(day.year, day.month);
  }
}

class CoinEntry {
  const CoinEntry({required this.delta, required this.source, required this.at, this.reason});

  final int delta;

  /// attendance, teacher_award, reward_hold, game_win, exam, …
  final String source;
  final DateTime at;

  /// The teacher's or the owner's own words, when they wrote some.
  final String? reason;
}

/// A photo chosen for the profile: where from.
enum PhotoSource { camera, gallery }

abstract class MoreRepository {
  Future<StudentDetails?> studentDetails();

  /// `scope` is group or centre; `period` is month or all.
  Future<List<LeaderRow>> leaderboard({required String scope, String? groupId, required String period});

  /// The lessons of the student's groups between two Tashkent days, both included.
  Future<List<ScheduleLesson>> schedule(DateTime from, DateTime to);

  /// Payments and charges, the newest first.
  Future<List<LedgerEntry>> ledger();

  Future<List<CoinEntry>> coinHistory();

  /// About the centre in a language, or null when nothing is written.
  Future<String?> about(String language);

  /// A short-lived link to a photo in the private avatars bucket.
  Future<String?> avatarUrl(String path);

  /// Saves a square PNG as the profile photo and returns its path.
  Future<String> saveAvatar(Uint8List png, {String? replacing});

  Future<void> removeAvatar(String path);
}

String _day(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

class SupabaseMoreRepository implements MoreRepository {
  SupabaseMoreRepository(this._client);

  final SupabaseClient _client;

  static const _bucket = 'avatars';

  @override
  Future<StudentDetails?> studentDetails() => reachServer(() async {
    final me = await _client.rpc('my_student');
    if (me is! Map) return null;
    final birth = me['birth_date'] is String ? DateTime.tryParse(me['birth_date'] as String) : null;
    return StudentDetails(
      fullName: '${me['full_name'] ?? ''}',
      birthDate: birth == null ? null : DateTime.utc(birth.year, birth.month, birth.day),
      parentName: me['parent_name'] as String?,
      parentPhone: me['parent_phone'] as String?,
    );
  });

  @override
  Future<List<LeaderRow>> leaderboard({required String scope, String? groupId, required String period}) => reachServer(() async {
    final rows = await _client.rpc('app_leaderboard', params: {'p_scope': scope, 'p_group_id': scope == 'group' ? groupId : null, 'p_period': period}) as List;
    return [
      for (final row in rows)
        LeaderRow(rank: (row['rank'] as num).toInt(), name: '${row['display_name']}', coins: (row['coins'] as num).toInt(), isMe: row['is_me'] == true),
    ];
  });

  @override
  Future<List<ScheduleLesson>> schedule(DateTime from, DateTime to) => reachServer(() async {
    final rows = await _client.rpc('my_schedule', params: {'p_from': _day(from), 'p_to': _day(to)}) as List;
    return [for (final row in rows) ScheduleLesson.fromRow(Map<String, dynamic>.from(row as Map))];
  });

  @override
  Future<List<LedgerEntry>> ledger() => reachServer(() async {
    final answers = await Future.wait([_client.rpc('my_payments'), _client.rpc('my_charges')]);
    final entries = <LedgerEntry>[
      for (final row in answers[0] as List)
        // A voided payment was never the student's money: it is left out.
        if (row['voided_at'] == null)
          LedgerEntry(
            at: DateTime.parse(row['paid_at'] as String).toUtc(),
            amount: (row['amount'] as num).toInt(),
            isPayment: true,
            receiptNo: (row['receipt_no'] as num?)?.toInt(),
          ),
      for (final row in answers[1] as List)
        LedgerEntry(
          at: DateTime.parse(row['created_at'] as String).toUtc(),
          amount: -(row['amount'] as num).toInt(),
          isPayment: false,
          billingMonth: DateTime.parse(row['billing_month'] as String),
          isAdjustment: row['type'] == 'adjustment',
        ),
    ];
    entries.sort((a, b) => b.at.compareTo(a.at));
    return entries;
  });

  @override
  Future<List<CoinEntry>> coinHistory() => reachServer(() async {
    // Row level security returns the student's own rows only.
    final rows = await _client.from('points_ledger').select('delta, source, reason, created_at').order('created_at', ascending: false).limit(200);
    return [
      for (final row in rows)
        CoinEntry(
          delta: (row['delta'] as num).toInt(),
          source: '${row['source']}',
          reason: row['reason'] as String?,
          at: DateTime.parse(row['created_at'] as String).toUtc(),
        ),
    ];
  });

  @override
  Future<String?> about(String language) => reachServer(() async {
    final info = await _client.rpc('app_centre_info');
    final about = info is Map ? info['about'] : null;
    if (about is! Map) return null;
    final text = about[language] ?? about['uz'];
    return text is String && text.trim().isNotEmpty ? text : null;
  });

  @override
  Future<String?> avatarUrl(String path) async {
    try {
      return await _client.storage.from(_bucket).createSignedUrl(path, 3600);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<String> saveAvatar(Uint8List png, {String? replacing}) => reachServer(() async {
    final id = _client.auth.currentUser!.id;
    // A new name each time, so no phone keeps showing the old picture.
    final path = '$id/${DateTime.now().millisecondsSinceEpoch}.png';
    await _client.storage.from(_bucket).uploadBinary(path, png, fileOptions: const FileOptions(contentType: 'image/png'));
    await _client.from('profiles').update({'avatar_path': path}).eq('id', id);
    if (replacing != null && replacing != path) {
      try {
        await _client.storage.from(_bucket).remove([replacing]);
      } catch (_) {
        // An old file left behind is cleared when the account is deleted.
      }
    }
    return path;
  });

  @override
  Future<void> removeAvatar(String path) => reachServer(() async {
    final id = _client.auth.currentUser!.id;
    await _client.from('profiles').update({'avatar_path': null}).eq('id', id);
    await _client.storage.from(_bucket).remove([path]);
  });
}
