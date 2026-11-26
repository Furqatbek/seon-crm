// Integration tests of the whole app — docs/STUDENT_APP_SPEC.md, App 4.
//
//   flutter test integration_test                       on a phone or emulator
//   flutter test integration_test/app_test.dart         without one, on this computer
//
// By default the app runs on an in-memory stand-in for Supabase, in which a
// deleted account is really gone. To run the deletion test against the dev
// project instead, give it a throwaway account to delete:
//
//   flutter test integration_test --dart-define-from-file=env/dev.json \
//     --dart-define=TEST_PHONE=+998770000001 --dart-define=TEST_PASSWORD=...
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:student/app.dart';
import 'package:student/core/home_state.dart';
import 'package:student/core/more_state.dart';
import 'package:student/core/state.dart';
import 'package:student/data/auth_repository.dart';
import 'package:student/data/device_tokens.dart';
import 'package:student/data/home.dart';
import 'package:student/data/more.dart';
import 'package:student/data/notifications.dart';
import 'package:student/env.dart';
import 'package:student/features/auth/sign_in_screens.dart';
import 'package:student/features/auth/welcome_screen.dart';
import 'package:student/features/home/student_home.dart';
import 'package:student/features/more/more_tab.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../test/support/fakes.dart';

const testPhone = String.fromEnvironment('TEST_PHONE');
const testPassword = String.fromEnvironment('TEST_PASSWORD');

/// Against the dev project when it and a throwaway account are given; otherwise in memory.
bool get onDevProject => isConfigured && testPhone.isNotEmpty && testPassword.isNotEmpty;

final uz = lookupAppLocalizations(const Locale('uz'));
final ko = lookupAppLocalizations(const Locale('ko'));

/// The app on the in-memory stand-in, signed in or not.
Future<FakeAuthRepository> pumpInMemory(WidgetTester tester, {required bool signedIn}) async {
  SharedPreferences.setMockInitialValues({});
  final auth = FakeAuthRepository(signedIn: signedIn, profile: studentProfile);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(auth),
        deviceTokenRepositoryProvider.overrideWithValue(FakeDeviceTokens()),
        homeRepositoryProvider.overrideWithValue(FakeHomeRepository()),
        notificationsRepositoryProvider.overrideWithValue(FakeNotificationsRepository()),
        moreRepositoryProvider.overrideWithValue(FakeMoreRepository()),
        sharedPreferencesProvider.overrideWithValue(await SharedPreferences.getInstance()),
        clockProvider.overrideWithValue(() => testNow),
        deviceLanguageProvider.overrideWithValue('uz'),
      ],
      child: const StudentApp(),
    ),
  );
  await tester.pumpAndSettle();
  return auth;
}

/// The app on the dev project, signed out.
Future<void> pumpOnDevProject(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({});
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabasePublishableKey);
  final client = Supabase.instance.client;
  await client.auth.signOut();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(SupabaseAuthRepository(client)),
        deviceTokenRepositoryProvider.overrideWithValue(SupabaseDeviceTokenRepository(client)),
        homeRepositoryProvider.overrideWithValue(SupabaseHomeRepository(client)),
        notificationsRepositoryProvider.overrideWithValue(SupabaseNotificationsRepository(client)),
        moreRepositoryProvider.overrideWithValue(SupabaseMoreRepository(client)),
        sharedPreferencesProvider.overrideWithValue(await SharedPreferences.getInstance()),
        deviceLanguageProvider.overrideWithValue('uz'),
      ],
      child: const StudentApp(),
    ),
  );
  await tester.pumpAndSettle(const Duration(seconds: 1));
}

Future<void> signIn(WidgetTester tester, String phone, String password) async {
  await tester.tap(find.widgetWithText(SecondaryButton, uz.signIn));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField).at(0), phone.replaceFirst('+998', ''));
  await tester.enterText(find.byType(TextField).at(1), password);
  await tester.tap(find.widgetWithText(PrimaryButton, uz.signIn));
  // The dev project answers over the network.
  await tester.pumpAndSettle(const Duration(seconds: 1), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 20));
  await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
}

Future<void> openRow(WidgetTester tester, String label) async {
  final row = find.widgetWithText(ListRow, label);
  await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
  await tester.tap(row);
  await tester.pumpAndSettle();
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('switching to Korean and to dark mode changes Home', (tester) async {
    await pumpInMemory(tester, signedIn: true);

    // Home starts in Uzbek, in the light theme.
    expect(find.byType(StudentHomeView), findsOneWidget);
    expect(find.text('Salom, Aziza'), findsOneWidget);
    expect(find.text(uz.nextLesson), findsOneWidget);
    expect(Theme.of(tester.element(find.byType(StudentHomeView))).brightness, Brightness.light);

    // More → Language → Korean.
    await tester.tap(find.bySemanticsLabel(uz.tabMore).last);
    await tester.pumpAndSettle();
    await openRow(tester, uz.language);
    await tester.tap(find.text(uz.languageKo));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(ko.back));
    await tester.pumpAndSettle();

    // More → Appearance → Dark, now in Korean.
    await openRow(tester, ko.appearance);
    await tester.tap(find.text(ko.themeDark));
    await tester.pumpAndSettle();

    // Home has changed with both.
    await tester.tap(find.bySemanticsLabel(ko.tabHome).last);
    await tester.pumpAndSettle();
    expect(find.text(ko.greeting('Aziza')), findsOneWidget);
    expect(find.text(ko.nextLesson), findsOneWidget);
    expect(find.text(ko.balancePaid), findsOneWidget);
    expect(find.text(uz.nextLesson), findsNothing);
    expect(Theme.of(tester.element(find.byType(StudentHomeView))).brightness, Brightness.dark);
    expect(Theme.of(tester.element(find.byType(StudentHomeView))).scaffoldBackgroundColor, const Color(0xFF0B0B14));
  });

  testWidgets('a deleted account can no longer sign in', (tester) async {
    final phone = onDevProject ? testPhone : studentProfile.phone!;
    final password = onDevProject ? testPassword : 'parol1234';
    if (onDevProject) {
      await pumpOnDevProject(tester);
    } else {
      await pumpInMemory(tester, signedIn: false);
    }
    expect(find.byType(WelcomeScreen), findsOneWidget);

    // The account exists: it signs in.
    await signIn(tester, phone, password);
    expect(find.byType(WelcomeScreen), findsNothing);
    expect(find.byType(SignInScreen), findsNothing);

    // More → Delete account → Delete.
    await tester.tap(find.bySemanticsLabel(uz.tabMore).last);
    await tester.pumpAndSettle();
    await openRow(tester, uz.deleteAccount);
    expect(find.byType(DeleteAccountSheet), findsOneWidget);
    await tester.tap(find.widgetWithText(DangerButton, uz.deleteAction));
    await tester.pumpAndSettle(const Duration(seconds: 1), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 20));

    // Signed out at once.
    expect(find.byType(WelcomeScreen), findsOneWidget);

    // The same phone and password no longer work.
    await signIn(tester, phone, password);
    expect(find.byType(SignInScreen), findsOneWidget);
    expect(find.text(uz.errorInvalidCredentials), findsOneWidget);
  });
}
