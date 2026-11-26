import 'dart:async';

import 'package:student/data/auth_failure.dart';
import 'package:student/data/auth_repository.dart';
import 'package:student/data/device_tokens.dart';
import 'package:student/data/home.dart';
import 'package:student/data/models.dart';
import 'package:student/data/notifications.dart';
import 'package:student/push/push_service.dart';

/// Supabase Auth, as far as the app can tell: accounts by phone, one code,
/// and what was asked of it.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.profile, bool signedIn = false, this.groups = const [], this.policy})
    // ignore: prefer_initializing_formals
    : _signedIn = signedIn;

  /// The profile the signed-in person has.
  Profile? profile;
  List<String> groups;
  String? policy;

  /// The code that is right.
  String code = '482193';

  /// What the next call fails with, once.
  AuthFailure? failNext;

  /// Phones that already have an account.
  final registered = <String>{};
  final calls = <String>[];
  final _changes = StreamController<bool>.broadcast();
  bool _signedIn;
  String? savedLanguage;
  String? savedTheme;
  String? newPassword;
  Map<String, Object?>? signUpData;

  void _maybeFail() {
    final failure = failNext;
    if (failure != null) {
      failNext = null;
      throw AuthFailureException(failure);
    }
  }

  void _set(bool signedIn) {
    _signedIn = signedIn;
    _changes.add(signedIn);
  }

  @override
  bool get isSignedIn => _signedIn;

  @override
  Stream<bool> get signedInChanges => _changes.stream;

  @override
  Future<void> signUp({required String fullName, required String phone, required String password, required KoreanLevel level, required String language}) async {
    calls.add('signUp');
    _maybeFail();
    if (registered.contains(phone)) throw const AuthFailureException(AuthFailure.alreadyRegistered);
    signUpData = {'fullName': fullName, 'phone': phone, 'password': password, 'level': level, 'language': language};
  }

  @override
  Future<void> verifyCode({required String phone, required String code}) async {
    calls.add('verifyCode:$code');
    _maybeFail();
    if (code != this.code) throw const AuthFailureException(AuthFailure.wrongCode);
    _set(true);
  }

  @override
  Future<void> resendSignUpCode(String phone) async {
    calls.add('resend');
    _maybeFail();
  }

  @override
  Future<void> signIn({required String phone, required String password}) async {
    calls.add('signIn');
    _maybeFail();
    _set(true);
  }

  @override
  Future<void> sendResetCode(String phone) async {
    calls.add('sendResetCode');
    _maybeFail();
  }

  @override
  Future<void> setPassword(String password) async {
    calls.add('setPassword');
    _maybeFail();
    newPassword = password;
  }

  @override
  Future<void> signOut() async {
    calls.add('signOut');
    _set(false);
  }

  @override
  Future<Profile?> loadProfile() async => _signedIn ? profile : null;

  @override
  Future<void> saveLanguage(String language) async => savedLanguage = language;

  @override
  Future<void> saveTheme(String theme) async => savedTheme = theme;

  @override
  Future<List<String>> groupNames() async => groups;

  @override
  Future<String?> privacyPolicy(String language) async => policy;
}

class FakeDeviceTokens implements DeviceTokenRepository {
  final saved = <String, ({String platform, String? appVersion})>{};
  final removed = <String>[];

  @override
  Future<void> save({required String token, required String platform, String? appVersion}) async {
    saved[token] = (platform: platform, appVersion: appVersion);
  }

  @override
  Future<void> remove(String token) async {
    saved.remove(token);
    removed.add(token);
  }
}

class FakePush implements PushService {
  FakePush({this.deviceToken = 'device-token-1', this.launch});

  String? deviceToken;
  Map<String, dynamic>? launch;
  final taps = StreamController<Map<String, dynamic>>.broadcast();
  final refreshed = StreamController<String>.broadcast();

  @override
  String get platform => 'android';

  @override
  Future<String?> token() async => deviceToken;

  @override
  Stream<String> get tokenChanges => refreshed.stream;

  @override
  Stream<Map<String, dynamic>> get opened => taps.stream;

  @override
  Future<Map<String, dynamic>?> launchedFrom() async => launch;
}

const studentProfile = Profile(
  id: 'p-student',
  fullName: 'Aziza Karimova',
  role: AccountRole.student,
  language: 'uz',
  theme: 'system',
  koreanLevel: KoreanLevel.topik2,
);
const appUserProfile = Profile(
  id: 'p-app-user',
  fullName: 'Bekzod Aliyev',
  role: AccountRole.appUser,
  language: 'uz',
  theme: 'system',
  koreanLevel: KoreanLevel.topik1,
);

/// 15:45 in Tashkent on Thursday 26 November 2026: the moment the design frames show.
final testNow = DateTime.utc(2026, 11, 26, 10, 45);

/// student_home() as the server answers it; `changes` replaces parts of it.
Map<String, dynamic> homeJson([Map<String, dynamic> changes = const {}]) => {
  'student': {'id': 's-1', 'full_name': 'Aziza Karimova'},
  'today': '2026-11-26',
  'groups': [
    {'id': 'g-1', 'name': 'TOPIK II · Kechki', 'subject': 'Korean', 'level': 'TOPIK II'},
  ],
  'group_id': 'g-1',
  'next': {
    'id': 'l-1',
    'kind': 'lesson',
    'exam_title': null,
    'starts_at': '2026-11-26T13:00:00+00:00',
    'duration_min': 90,
    'room': '204',
    'teacher': 'Malika Tursunova',
  },
  'next_exam': {
    'id': 'l-2',
    'kind': 'exam',
    'exam_title': 'Mock TOPIK II',
    'starts_at': '2026-11-27T05:00:00+00:00',
    'duration_min': 90,
    'room': '301',
    'teacher': 'Malika Tursunova',
  },
  'rank': {'rank': 3, 'of': 14},
  'coins': 128,
  'coins_week': 12,
  'balance': {'amount': 0, 'oldest_unpaid_month': null, 'due_day': 5},
  'attendance': {'present': 11, 'late': 1, 'absent': 1, 'excused': 0, 'marked': 13, 'rate': 92},
  'unread': 3,
  ...changes,
};

class FakeHomeRepository implements HomeRepository {
  FakeHomeRepository({Map<String, dynamic>? home, this.appUser = const AppUserHome(lockedCoins: 34)}) : home = home ?? homeJson();

  Map<String, dynamic> home;
  AppUserHome appUser;

  /// Throw this from the next calls: an [OfflineException], or anything else.
  Object? failure;

  /// Never answers: the screen stays on its skeleton.
  bool hang = false;
  final asked = <String?>[];

  @override
  Future<Map<String, dynamic>> studentHome(String? groupId) async {
    asked.add(groupId);
    if (hang) return Completer<Map<String, dynamic>>().future;
    if (failure != null) throw failure!;
    return {...home, if (groupId != null && (home['groups'] as List).any((group) => group['id'] == groupId)) 'group_id': groupId};
  }

  @override
  Future<AppUserHome> appUserHome() async {
    if (hang) return Completer<AppUserHome>().future;
    if (failure != null) throw failure!;
    return appUser;
  }
}

AppNotification notification(String id, String type, String body, DateTime at, {bool read = false, Map<String, dynamic> data = const {}}) =>
    AppNotification(id: id, type: type, title: 'Seon', body: body, data: data, createdAt: at, readAt: read ? at : null);

/// The list of frame 03.
List<AppNotification> sampleNotifications() => [
  notification('n-1', 'custom', '+5 tanga: oʻyinda gʻalaba', DateTime.utc(2026, 11, 26, 10, 20), data: {'screen': 'coins'}),
  notification('n-2', 'reward_update', 'Buyurtmangiz olib ketishga tayyor: Brendli futbolka (M)', DateTime.utc(2026, 11, 26, 7, 40)),
  notification('n-3', 'lesson_reminder', 'Ertaga imtihon: Mock TOPIK II, 10:00', DateTime.utc(2026, 11, 26, 4)),
  notification('n-4', 'custom', 'Jasur T. sizni oʻyinga chaqirdi', DateTime.utc(2026, 11, 25, 14, 5), read: true, data: {'screen': 'game'}),
  notification('n-5', 'receipt_approved', 'Noyabr toʻlovi qabul qilindi: 600 000 soʻm', DateTime.utc(2026, 11, 3, 6), read: true),
];

class FakeNotificationsRepository implements NotificationsRepository {
  FakeNotificationsRepository([List<AppNotification>? items]) : items = items ?? [];

  List<AppNotification> items;
  Object? failure;
  final _changes = StreamController<void>.broadcast();
  final markedRead = <String>[];
  var markedAll = 0;

  /// The server added one, as Realtime would tell the app.
  void arrive(AppNotification item) {
    items = [item, ...items];
    _changes.add(null);
  }

  @override
  Future<List<AppNotification>> list() async {
    if (failure != null) throw failure!;
    return [...items];
  }

  @override
  Future<int> unreadCount() async => items.where((item) => item.unread).length;

  @override
  Stream<void> changes() => _changes.stream;

  @override
  Future<void> markRead(String id) async {
    markedRead.add(id);
    items = [for (final item in items) item.id == id ? item.read(testNow) : item];
  }

  @override
  Future<void> markAllRead() async {
    markedAll += 1;
    items = [for (final item in items) item.read(testNow)];
  }
}
