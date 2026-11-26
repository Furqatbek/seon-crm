import 'dart:async';
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart' show ThemeMode;
import 'package:shared_preferences/shared_preferences.dart';

import '../data/auth_repository.dart';
import '../data/device_tokens.dart';
import '../data/models.dart';
import '../push/push_service.dart';

// The app's state: who is signed in, and the language and appearance. The
// providers below marked "set in main" are given their real values when the
// app starts and fakes in tests.

/// Set in main.
final authRepositoryProvider = Provider<AuthRepository>((ref) => throw UnimplementedError('authRepositoryProvider'));

/// Set in main.
final deviceTokenRepositoryProvider = Provider<DeviceTokenRepository>((ref) => throw UnimplementedError('deviceTokenRepositoryProvider'));

/// Set in main.
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('sharedPreferencesProvider'));

/// Set in main; no push until then.
final pushServiceProvider = Provider<PushService>((ref) => const NoPushService());

/// The app's version, saved with the device token. Set in main.
final appVersionProvider = Provider<String?>((ref) => null);

/// The phone's own language, for the first launch.
final deviceLanguageProvider = Provider<String>((ref) => PlatformDispatcher.instance.locale.languageCode);

// ── Language and appearance ──

class AppSettings {
  const AppSettings({required this.language, required this.theme});

  /// uz, ru, en or ko.
  final String language;

  /// system, light or dark.
  final String theme;

  Locale get locale => Locale(language);

  ThemeMode get themeMode => switch (theme) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
}

const _languageKey = 'language';
const _themeKey = 'theme';

/// Language and appearance are kept on the phone, so they hold before sign-in
/// and at the next launch, and in the profile, so they follow the person to
/// another phone.
class SettingsController extends Notifier<AppSettings> {
  @override
  AppSettings build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final saved = prefs.getString(_languageKey);
    // First launch: the phone's language when it is one of the four, else Uzbek.
    final device = ref.watch(deviceLanguageProvider);
    final language = supportedLanguages.contains(saved) ? saved! : (supportedLanguages.contains(device) ? device : 'uz');
    final theme = prefs.getString(_themeKey);
    return AppSettings(language: language, theme: supportedThemes.contains(theme) ? theme! : 'system');
  }

  Future<void> setLanguage(String language) async {
    if (!supportedLanguages.contains(language) || language == state.language) return;
    state = AppSettings(language: language, theme: state.theme);
    await ref.read(sharedPreferencesProvider).setString(_languageKey, language);
    await _toProfile((repository) => repository.saveLanguage(language));
  }

  /// Appearance: System, Light or Dark.
  Future<void> setTheme(String theme) async {
    if (!supportedThemes.contains(theme) || theme == state.theme) return;
    state = AppSettings(language: state.language, theme: theme);
    await ref.read(sharedPreferencesProvider).setString(_themeKey, theme);
    await _toProfile((repository) => repository.saveTheme(theme));
  }

  /// What the profile says after signing in. The appearance is the
  /// profile's; the language stays as chosen on this phone and is saved to
  /// the profile, since the person has just been reading the app in it.
  Future<void> syncWithProfile(Profile profile) async {
    if (profile.theme != state.theme) {
      state = AppSettings(language: state.language, theme: profile.theme);
      await ref.read(sharedPreferencesProvider).setString(_themeKey, profile.theme);
    }
    if (profile.language != state.language) {
      await _toProfile((repository) => repository.saveLanguage(state.language));
    }
  }

  Future<void> _toProfile(Future<void> Function(AuthRepository repository) save) async {
    final repository = ref.read(authRepositoryProvider);
    if (!repository.isSignedIn) return;
    try {
      await save(repository);
    } catch (_) {
      // Kept on the phone; the profile catches up at the next change.
    }
  }
}

final settingsProvider = NotifierProvider<SettingsController, AppSettings>(SettingsController.new);

// ── Who is signed in ──

class AuthState {
  const AuthState({required this.signedIn, this.profile, this.profileLoaded = false});

  final bool signedIn;

  /// Null until it is read, and for an account that is not the app's.
  final Profile? profile;
  final bool profileLoaded;
}

class AuthController extends Notifier<AuthState> {
  String? _savedToken;

  @override
  AuthState build() {
    final repository = ref.watch(authRepositoryProvider);
    final changes = repository.signedInChanges.listen(_onChange);
    final tokens = ref.watch(pushServiceProvider).tokenChanges.listen((token) {
      if (state.signedIn) unawaited(_saveToken(token));
    });
    ref.onDispose(() {
      changes.cancel();
      tokens.cancel();
    });
    if (repository.isSignedIn) unawaited(Future.microtask(refreshProfile));
    return AuthState(signedIn: repository.isSignedIn);
  }

  void _onChange(bool signedIn) {
    if (signedIn == state.signedIn) return;
    state = AuthState(signedIn: signedIn);
    if (signedIn) unawaited(refreshProfile());
  }

  /// Reads the profile, brings language and appearance in step with it, and
  /// saves this phone's push token for the account.
  Future<Profile?> refreshProfile() async {
    final repository = ref.read(authRepositoryProvider);
    Profile? profile;
    try {
      profile = await repository.loadProfile();
    } catch (_) {
      profile = state.profile;
    }
    if (!repository.isSignedIn) return null;
    state = AuthState(signedIn: true, profile: profile, profileLoaded: true);
    if (profile != null) {
      await ref.read(settingsProvider.notifier).syncWithProfile(profile);
      unawaited(_registerDevice());
    }
    return profile;
  }

  Future<void> _registerDevice() async {
    final token = await ref.read(pushServiceProvider).token();
    if (token != null) await _saveToken(token);
  }

  Future<void> _saveToken(String token) async {
    try {
      await ref
          .read(deviceTokenRepositoryProvider)
          .save(token: token, platform: ref.read(pushServiceProvider).platform, appVersion: ref.read(appVersionProvider));
      _savedToken = token;
    } catch (_) {
      // Tried again at the next sign-in or token change.
    }
  }

  /// Delete account: at once, on the server and on this phone. Throws an
  /// AuthFailureException and changes nothing when the server cannot be reached.
  Future<void> deleteAccount() async {
    await ref.read(authRepositoryProvider).deleteAccount();
    _savedToken = null;
    final preferences = ref.read(sharedPreferencesProvider);
    for (final key in personalPreferenceKeys) {
      await preferences.remove(key);
    }
    state = const AuthState(signedIn: false);
  }

  /// Log out: the phone's push token goes first, while the account can still remove it.
  Future<void> signOut() async {
    final token = _savedToken ?? await ref.read(pushServiceProvider).token();
    if (token != null) {
      try {
        await ref.read(deviceTokenRepositoryProvider).remove(token);
      } catch (_) {
        // The server forgets a dead token by itself.
      }
    }
    _savedToken = null;
    await ref.read(authRepositoryProvider).signOut();
    state = const AuthState(signedIn: false);
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// What the phone remembers about the person: cleared when their account is deleted.
const personalPreferenceKeys = ['home_group', 'home_cache'];
