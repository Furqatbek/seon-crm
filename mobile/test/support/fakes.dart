import 'dart:async';

import 'package:student/data/auth_failure.dart';
import 'package:student/data/auth_repository.dart';
import 'package:student/data/device_tokens.dart';
import 'package:student/data/models.dart';
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
