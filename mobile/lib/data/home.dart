import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'offers.dart' show voucherFromRow;

// What the Home tab shows. The Student Home comes from one call to
// student_home(group_id); the server decides every number in it.

class HomeGroup {
  const HomeGroup({required this.id, required this.name});

  final String id;
  final String name;
}

/// The next lesson or exam of the chosen group.
class HomeLesson {
  const HomeLesson({required this.id, required this.startsAt, this.isExam = false, this.examTitle, this.room, this.teacher});

  final String id;
  final DateTime startsAt;
  final bool isExam;
  final String? examTitle;
  final String? room;
  final String? teacher;

  static HomeLesson? fromJson(Object? json) {
    if (json is! Map) return null;
    final startsAt = DateTime.tryParse('${json['starts_at']}');
    if (startsAt == null) return null;
    return HomeLesson(
      id: '${json['id']}',
      startsAt: startsAt.toUtc(),
      isExam: json['kind'] == 'exam',
      examTitle: json['exam_title'] as String?,
      room: json['room'] as String?,
      teacher: json['teacher'] as String?,
    );
  }
}

/// How a balance reads today, by the CRM's rule.
enum BalanceState {
  /// Nothing owed.
  paid,

  /// Something is owed and this month's due day has not passed.
  due,

  /// Owed after the due day, or from an earlier month.
  debt,
}

class StudentHome {
  const StudentHome({
    required this.fullName,
    required this.today,
    required this.groups,
    required this.groupId,
    required this.next,
    required this.nextExam,
    required this.rank,
    required this.rankOf,
    required this.coins,
    required this.coinsWeek,
    required this.balance,
    required this.oldestUnpaidMonth,
    required this.dueDay,
    required this.attendanceRate,
    required this.attendanceMarked,
  });

  final String fullName;

  /// The Tashkent calendar day the server answered on.
  final DateTime today;
  final List<HomeGroup> groups;

  /// The chosen group; null for a student who is in no group yet.
  final String? groupId;
  final HomeLesson? next;

  /// The next exam, when it is not already [next].
  final HomeLesson? nextExam;

  /// This month's place in the group among linked students; null without one.
  final int? rank;
  final int? rankOf;
  final int coins;
  final int coinsWeek;

  /// Payments minus charges in soʻm: below zero is owed.
  final int balance;

  /// The first day of the oldest month that is not fully paid.
  final DateTime? oldestUnpaidMonth;

  /// The day of the month fees are due by.
  final int dueDay;

  /// Whole percent this month; null when no lesson has been marked.
  final int? attendanceRate;
  final int attendanceMarked;

  String get firstName => fullName.trim().split(RegExp(r'\s+')).first;

  BalanceState get balanceState {
    if (balance >= 0) return BalanceState.paid;
    final monthStart = DateTime.utc(today.year, today.month);
    final fromEarlier = oldestUnpaidMonth != null && oldestUnpaidMonth!.isBefore(monthStart);
    return fromEarlier || today.day > dueDay ? BalanceState.debt : BalanceState.due;
  }

  /// The day the owed amount is or was due: the due day of the oldest unpaid month.
  DateTime get dueDate {
    final month = oldestUnpaidMonth ?? DateTime.utc(today.year, today.month);
    return DateTime.utc(month.year, month.month, dueDay);
  }

  /// With nothing owed, the next due day after today.
  DateTime get nextPaymentDate => today.day < dueDay ? DateTime.utc(today.year, today.month, dueDay) : DateTime.utc(today.year, today.month + 1, dueDay);

  static DateTime? _day(Object? value) {
    final parsed = value is String ? DateTime.tryParse(value) : null;
    return parsed == null ? null : DateTime.utc(parsed.year, parsed.month, parsed.day);
  }

  static int _int(Object? value) => value is num ? value.toInt() : 0;

  /// From the JSON of student_home().
  factory StudentHome.fromJson(Map<String, dynamic> json) {
    final student = json['student'];
    final rank = json['rank'];
    final balance = json['balance'];
    final attendance = json['attendance'];
    return StudentHome(
      fullName: student is Map ? '${student['full_name'] ?? ''}' : '',
      today: _day(json['today']) ?? DateTime.utc(1970),
      groups: [
        for (final group in json['groups'] as List? ?? const [])
          if (group is Map) HomeGroup(id: '${group['id']}', name: '${group['name']}'),
      ],
      groupId: json['group_id'] as String?,
      next: HomeLesson.fromJson(json['next']),
      nextExam: HomeLesson.fromJson(json['next_exam']),
      rank: rank is Map ? _int(rank['rank']) : null,
      rankOf: rank is Map ? _int(rank['of']) : null,
      coins: _int(json['coins']),
      coinsWeek: _int(json['coins_week']),
      balance: balance is Map ? _int(balance['amount']) : 0,
      oldestUnpaidMonth: balance is Map ? _day(balance['oldest_unpaid_month']) : null,
      dueDay: balance is Map && balance['due_day'] is num ? _int(balance['due_day']) : 5,
      attendanceRate: attendance is Map && attendance['rate'] is num ? _int(attendance['rate']) : null,
      attendanceMarked: attendance is Map ? _int(attendance['marked']) : 0,
    );
  }
}

/// The voucher an app user got after their first finished exam.
class HomeVoucher {
  const HomeVoucher({required this.kind, required this.value, required this.expiresAt, this.code = '', this.status = 'issued'});

  /// percent, fixed or trial_week.
  final String kind;

  /// Percent, soʻm, or free days.
  final int value;
  final DateTime expiresAt;

  /// "KOR-7F3K9": what the person tells reception.
  final String code;

  /// issued, redeemed or expired.
  final String status;

  bool get usable => status == 'issued';
}

class AppUserHome {
  const AppUserHome({required this.lockedCoins, this.voucher});

  /// Exam coins waiting until the person joins the centre.
  final int lockedCoins;

  /// Their voucher while it can still be used; null otherwise.
  final HomeVoucher? voucher;
}

/// The phone could not reach the server.
class OfflineException implements Exception {
  const OfflineException();
}

abstract class HomeRepository {
  /// The JSON of student_home(group_id). Throws [OfflineException] without a connection.
  Future<Map<String, dynamic>> studentHome(String? groupId);

  Future<AppUserHome> appUserHome();
}

/// Turns a failed call into [OfflineException] when the server was not reached.
Future<T> reachServer<T>(Future<T> Function() call) async {
  try {
    return await call();
  } on PostgrestException {
    rethrow;
  } on AuthException {
    rethrow;
  } on SocketException {
    throw const OfflineException();
  } on TimeoutException {
    throw const OfflineException();
  } on HttpException {
    throw const OfflineException();
  } catch (error) {
    // The HTTP client's own error type for a failed connection.
    if ('$error'.contains('ClientException') || '$error'.contains('Failed host lookup')) throw const OfflineException();
    rethrow;
  }
}

class SupabaseHomeRepository implements HomeRepository {
  SupabaseHomeRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<Map<String, dynamic>> studentHome(String? groupId) => reachServer(() async {
    final home = await _client.rpc('student_home', params: {'p_group_id': groupId});
    return Map<String, dynamic>.from(home as Map);
  });

  @override
  Future<AppUserHome> appUserHome() => reachServer(() async {
    // Row level security returns the caller's own rows only.
    final rows = await _client.from('locked_coins').select('amount').isFilter('moved_at', null);
    var locked = 0;
    for (final row in rows) {
      locked += (row['amount'] as num).toInt();
    }
    final row = await _client.from('vouchers').select('code, type, value, expires_at, status').order('issued_at', ascending: false).limit(1).maybeSingle();
    final voucher = row == null ? null : voucherFromRow(row, DateTime.now().toUtc());
    return AppUserHome(lockedCoins: locked, voucher: voucher != null && voucher.usable ? voucher : null);
  });
}
