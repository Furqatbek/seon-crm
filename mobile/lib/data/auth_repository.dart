import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_failure.dart';
import 'models.dart';

/// Everything the app asks Supabase about the signed-in person. Screens and
/// controllers use this interface; tests give them a fake.
abstract class AuthRepository {
  bool get isSignedIn;

  /// True when someone signs in, false when they sign out.
  Stream<bool> get signedInChanges;

  /// Creates the account and has the SMS code sent. Throws
  /// [AuthFailureException]; `alreadyRegistered` when the phone has an account.
  Future<void> signUp({required String fullName, required String phone, required String password, required KoreanLevel level, required String language});

  /// Checks the SMS code; on success the person is signed in.
  Future<void> verifyCode({required String phone, required String code});

  /// Sends the sign-up code again.
  Future<void> resendSignUpCode(String phone);

  Future<void> signIn({required String phone, required String password});

  /// Forgot password: sends a code to an existing account's phone.
  Future<void> sendResetCode(String phone);

  /// Sets a new password for the signed-in person.
  Future<void> setPassword(String password);

  Future<void> signOut();

  /// Edit profile: sends a code to the new number. The phone changes only when it is confirmed.
  Future<void> startPhoneChange(String phone);

  /// Confirms the code sent to the new number.
  Future<void> confirmPhoneChange({required String phone, required String code});

  /// Deletes the account at once and ends the session. The centre keeps its business records.
  Future<void> deleteAccount();

  /// The signed-in person's profile; null when the account is not the app's.
  Future<Profile?> loadProfile();

  Future<void> saveLanguage(String language);

  Future<void> saveTheme(String theme);

  /// The names of the groups a linked student is in.
  Future<List<String>> groupNames();

  /// The privacy policy in a language, or null when the centre has not written one.
  Future<String?> privacyPolicy(String language);
}

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client);

  final SupabaseClient _client;

  GoTrueClient get _auth => _client.auth;

  @override
  bool get isSignedIn => _auth.currentSession != null;

  @override
  Stream<bool> get signedInChanges => _auth.onAuthStateChange
      .where((change) => change.event == AuthChangeEvent.signedIn || change.event == AuthChangeEvent.signedOut)
      .map((change) => change.session != null);

  /// Runs a call and turns whatever goes wrong into an [AuthFailureException].
  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on AuthFailureException {
      rethrow;
    } on AuthException catch (error) {
      throw AuthFailureException(authFailureOf(code: error.code, status: error.statusCode, message: error.message));
    } on PostgrestException {
      throw const AuthFailureException(AuthFailure.unknown);
    } catch (_) {
      throw const AuthFailureException(AuthFailure.network);
    }
  }

  @override
  Future<void> signUp({required String fullName, required String phone, required String password, required KoreanLevel level, required String language}) =>
      _guard(() async {
        final response = await _auth.signUp(phone: phone, password: password, data: {'full_name': fullName, 'korean_level': level.value, 'language': language});
        // For a phone that already has an account Supabase answers with a stand-in
        // user that has no identities, and sends no code.
        final identities = response.user?.identities;
        if (response.user == null || (identities != null && identities.isEmpty)) {
          throw const AuthFailureException(AuthFailure.alreadyRegistered);
        }
      });

  @override
  Future<void> verifyCode({required String phone, required String code}) => _guard(() async {
    await _auth.verifyOTP(phone: phone, token: code, type: OtpType.sms);
  });

  @override
  Future<void> resendSignUpCode(String phone) => _guard(() async {
    await _auth.resend(type: OtpType.sms, phone: phone);
  });

  @override
  Future<void> signIn({required String phone, required String password}) => _guard(() async {
    await _auth.signInWithPassword(phone: phone, password: password);
  });

  @override
  Future<void> sendResetCode(String phone) => _guard(() async {
    await _auth.signInWithOtp(phone: phone, shouldCreateUser: false);
  });

  @override
  Future<void> setPassword(String password) => _guard(() async {
    await _auth.updateUser(UserAttributes(password: password));
  });

  @override
  Future<void> signOut() => _guard(() => _auth.signOut());

  @override
  Future<void> startPhoneChange(String phone) => _guard(() async {
    await _auth.updateUser(UserAttributes(phone: phone));
  });

  @override
  Future<void> confirmPhoneChange({required String phone, required String code}) => _guard(() async {
    await _auth.verifyOTP(phone: phone, token: code, type: OtpType.phoneChange);
  });

  @override
  Future<void> deleteAccount() async {
    final id = _auth.currentUser?.id;
    try {
      // The photo goes first, while the account can still remove it; the server clears anything left.
      if (id != null) {
        final files = await _client.storage.from('avatars').list(path: id);
        if (files.isNotEmpty) await _client.storage.from('avatars').remove([for (final file in files) '$id/${file.name}']);
      }
    } catch (_) {
      // Not a reason to keep the account.
    }
    await _guard(() => _client.rpc('delete_my_account'));
    try {
      await _auth.signOut();
    } catch (_) {
      // The account is gone; the session on the phone is cleared either way.
    }
  }

  @override
  Future<Profile?> loadProfile() async {
    final id = _auth.currentUser?.id;
    if (id == null) return null;
    final row = await _client.from('profiles').select('id, full_name, role, language, theme, korean_level, phone, avatar_path').eq('id', id).maybeSingle();
    return row == null ? null : Profile.fromRow(row);
  }

  Future<void> _saveOwn(Map<String, dynamic> values) async {
    final id = _auth.currentUser?.id;
    if (id == null) return;
    await _client.from('profiles').update(values).eq('id', id);
  }

  @override
  Future<void> saveLanguage(String language) => _saveOwn({'language': language});

  @override
  Future<void> saveTheme(String theme) => _saveOwn({'theme': theme});

  @override
  Future<List<String>> groupNames() async {
    final home = await _client.rpc('student_home');
    final groups = home is Map ? home['groups'] : null;
    if (groups is! List) return const [];
    return [
      for (final group in groups)
        if (group is Map && group['name'] is String) group['name'] as String,
    ];
  }

  @override
  Future<String?> privacyPolicy(String language) async {
    final info = await _client.rpc('app_centre_info');
    final policy = info is Map ? info['privacy_policy'] : null;
    if (policy is! Map) return null;
    final text = policy[language] ?? policy['uz'];
    return text is String && text.trim().isNotEmpty ? text : null;
  }
}
