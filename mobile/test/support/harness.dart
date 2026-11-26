import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:student/app.dart';
import 'package:student/core/localization.dart';
import 'package:student/core/state.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/theme.dart';

import 'fakes.dart';

/// The whole app on fakes: what a test needs to drive it and to look at what it did.
class TestApp {
  TestApp({FakeAuthRepository? auth, FakePush? push, this.deviceLanguage = 'uz', this.preferences = const {}})
    : auth = auth ?? FakeAuthRepository(),
      push = push ?? FakePush(),
      tokens = FakeDeviceTokens();

  final FakeAuthRepository auth;
  final FakePush push;
  final FakeDeviceTokens tokens;
  final String deviceLanguage;

  /// What the phone already has saved: 'language', 'theme'.
  final Map<String, Object> preferences;
  late SharedPreferences saved;

  Future<Widget> build() async {
    SharedPreferences.setMockInitialValues(preferences);
    saved = await SharedPreferences.getInstance();
    return ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(auth),
        deviceTokenRepositoryProvider.overrideWithValue(tokens),
        sharedPreferencesProvider.overrideWithValue(saved),
        pushServiceProvider.overrideWithValue(push),
        appVersionProvider.overrideWithValue('1.0.0'),
        deviceLanguageProvider.overrideWithValue(deviceLanguage),
      ],
      child: const StudentApp(),
    );
  }

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(await build());
    // Images decode off the test clock: let the logo finish before looking.
    await tester.runAsync(() => precacheImage(const AssetImage('assets/images/logo.png'), tester.element(find.byType(StudentApp))));
    await tester.pumpAndSettle();
  }
}

/// A phone screen of this many logical points.
void useScreen(WidgetTester tester, Size size, {double textScale = 1}) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
}

/// One widget with the app's theme and language, for tests of shared widgets.
Widget themed(Widget child, {Brightness brightness = Brightness.light, String language = 'uz'}) => MaterialApp(
  debugShowCheckedModeBanner: false,
  theme: appTheme(brightness),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: Scaffold(body: child),
);

AppLocalizations l10n(String language) => lookupAppLocalizations(Locale(language));
