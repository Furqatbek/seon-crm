// Golden screenshots of 01a–01f and the tab shell: light and dark, in uz, ru,
// en and ko, at 390×844 and 412×915. Compare them with the approved designs
// in docs/design/student-app/. After a deliberate change of looks:
//   flutter test --update-goldens test/goldens
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/core/router.dart';
import 'package:student/data/models.dart';
import 'package:student/features/auth/sign_up_screen.dart';
import 'package:student/features/auth/welcome_screen.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/push/notification_routes.dart';
import 'package:student/ui/widgets.dart';

import '../support/fakes.dart';
import '../support/harness.dart';

const sizes = {'390x844': Size(390, 844), '412x915': Size(412, 915)};
const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

void go(WidgetTester tester, String route) => ProviderScope.containerOf(tester.element(find.byType(StudentApp))).read(routerProvider).go(route);

Future<void> tapButton(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(PrimaryButton, label));
  await tester.pumpAndSettle();
}

typedef Scene = Future<void> Function(WidgetTester tester, AppLocalizations l, TestApp app);

Future<void> createAccount(WidgetTester tester, AppLocalizations l, TestApp app) async {
  await app.pump(tester);
  await tapButton(tester, l.createAccount);
  await tester.enterText(find.byType(TextField).at(0), 'Bekzod Aliyev');
  await tester.enterText(find.byType(TextField).at(1), '935551234');
  await tester.enterText(find.byType(TextField).at(2), 'parol1234');
  await tester.tap(find.widgetWithText(Pill, l.levelTopik1));
  await tester.pumpAndSettle();
}

/// Each screen, brought to the state its design frame shows.
final Map<String, Scene> screens = {
  '01a_welcome': (tester, l, app) => app.pump(tester),
  '01b_create_account': createAccount,
  '01c_sms_code': (tester, l, app) async {
    await createAccount(tester, l, app);
    await tapButton(tester, l.continueAction);
    await tester.enterText(find.byType(TextField), '4821');
    // 0:45 on the resend countdown.
    await tester.pump(const Duration(seconds: 15));
  },
  '01d_linked': (tester, l, app) async {
    await app.pump(tester);
    go(tester, Routes.linked);
    await tester.pumpAndSettle();
  },
  '01e_sign_in': (tester, l, app) async {
    await app.pump(tester);
    await tester.tap(find.widgetWithText(SecondaryButton, l.signIn));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), '901234567');
    await tester.enterText(find.byType(TextField).at(1), 'parol1234');
    await tester.pumpAndSettle();
  },
  '01f_new_password': (tester, l, app) async {
    await app.pump(tester);
    go(tester, Routes.newPassword);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'parol1234');
    await tester.enterText(find.byType(TextField).at(1), 'parol1');
    await tapButton(tester, l.save);
  },
  'shell_student': (tester, l, app) => app.pump(tester),
  'shell_app_user': (tester, l, app) => app.pump(tester),
};

/// Who is signed in for a screen. Appearance is the profile's, so the profile carries it.
FakeAuthRepository authFor(String screen, String theme, String language) {
  Profile as(Profile profile) =>
      Profile(id: profile.id, fullName: profile.fullName, role: profile.role, language: language, theme: theme, koreanLevel: profile.koreanLevel);
  return switch (screen) {
    '01d_linked' => FakeAuthRepository(signedIn: true, profile: as(studentProfile), groups: const ['TOPIK II · Kechki']),
    '01f_new_password' || 'shell_student' => FakeAuthRepository(signedIn: true, profile: as(studentProfile)),
    'shell_app_user' => FakeAuthRepository(signedIn: true, profile: as(appUserProfile)),
    _ => FakeAuthRepository(),
  };
}

void main() {
  for (final screen in screens.entries) {
    group(screen.key, () {
      for (final size in sizes.entries) {
        for (final theme in themes) {
          for (final language in languages) {
            testWidgets('${size.key} $theme $language', (tester) async {
              useScreen(tester, size.value);
              final app = TestApp(auth: authFor(screen.key, theme, language), preferences: {'language': language, 'theme': theme});
              await screen.value(tester, l10n(language), app);
              // No text cursor in the picture: it blinks.
              if (screen.key != '01c_sms_code') {
                FocusManager.instance.primaryFocus?.unfocus();
                await tester.pumpAndSettle();
              }
              expect(tester.takeException(), isNull);
              await expectLater(find.byType(StudentApp), matchesGoldenFile('${screen.key}/${size.key}_${theme}_$language.png'));
              // Stops the resend countdown.
              await tester.pumpWidget(const SizedBox());
              await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
            });
          }
        }
      }
    });
  }

  testWidgets('the screens are built from the widgets the designs name', (tester) async {
    useScreen(tester, sizes['390x844']!);
    await TestApp().pump(tester);
    expect(find.byType(WelcomeScreen), findsOneWidget);
    await tapButton(tester, l10n('uz').createAccount);
    expect(find.byType(SignUpScreen), findsOneWidget);
  });
}
