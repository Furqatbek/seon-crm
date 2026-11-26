// Sign-up validation, the SMS code screen, sign-in, forgot password and the
// linked confirmation — docs/STUDENT_APP_SPEC.md → "App behaviour → Sign-up
// and sign-in".
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/data/auth_failure.dart';
import 'package:student/data/models.dart';
import 'package:student/features/auth/code_screen.dart';
import 'package:student/features/auth/linked_screen.dart';
import 'package:student/features/auth/sign_in_screens.dart';
import 'package:student/features/auth/sign_up_screen.dart';
import 'package:student/features/home/app_user_home.dart';
import 'package:student/features/home/student_home.dart';
import 'package:student/features/tabs/tabs.dart';
import 'package:student/ui/widgets.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

Future<void> press(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(PrimaryButton, label));
  await tester.pumpAndSettle();
}

Future<void> fillSignUp(
  WidgetTester tester, {
  String name = 'Bekzod Aliyev',
  String number = '935551234',
  String password = 'parol1234',
  String? level = 'TOPIK I',
}) async {
  await tester.enterText(find.byType(TextField).at(0), name);
  await tester.enterText(find.byType(TextField).at(1), number);
  await tester.enterText(find.byType(TextField).at(2), password);
  if (level != null) await tester.tap(find.widgetWithText(Pill, level));
  await tester.pumpAndSettle();
}

Future<TestApp> openSignUp(WidgetTester tester, {FakeAuthRepository? auth}) async {
  useScreen(tester, phone);
  final app = TestApp(auth: auth);
  await app.pump(tester);
  await press(tester, l.createAccount);
  return app;
}

Future<TestApp> openCode(WidgetTester tester, {FakeAuthRepository? auth}) async {
  final app = await openSignUp(tester, auth: auth);
  await fillSignUp(tester);
  await press(tester, l.continueAction);
  expect(find.byType(CodeScreen), findsOneWidget);
  return app;
}

/// Ends the screen so its countdown stops with the test.
Future<void> close(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
}

void main() {
  group('sign-up validation', () {
    test('names every problem in plain words, and none when the form is right', () {
      final empty = validateSignUp(l, name: ' ', phone: '+998', password: '', level: null);
      expect(empty.name, l.errorNameRequired);
      expect(empty.phone, l.errorPhoneInvalid);
      expect(empty.password, l.errorPasswordShort);
      expect(empty.level, l.errorLevelRequired);
      expect(empty.any, isTrue);

      expect(validateSignUp(l, name: 'Bekzod Aliyev', phone: '+998 93 555 12 34', password: '12345678', level: KoreanLevel.beginner).any, isFalse);
      // 7 characters is one short; 8 digits of a phone is one short.
      expect(validateSignUp(l, name: 'Bekzod', phone: '+998 93 555 12 3', password: '1234567', level: KoreanLevel.topik1).phone, l.errorPhoneInvalid);
      expect(validateSignUp(l, name: 'Bekzod', phone: '+998 93 555 12 34', password: '1234567', level: KoreanLevel.topik1).password, l.errorPasswordShort);
    });

    testWidgets('Continue on an empty form shows each problem and sends nothing', (tester) async {
      final app = await openSignUp(tester);
      await press(tester, l.continueAction);
      for (final message in [l.errorNameRequired, l.errorPhoneInvalid, l.errorPasswordShort, l.errorLevelRequired]) {
        expect(find.text(message), findsOneWidget);
      }
      expect(app.auth.calls, isEmpty);
      expect(find.byType(SignUpScreen), findsOneWidget);
    });

    testWidgets('a problem goes away as soon as it is fixed', (tester) async {
      await openSignUp(tester);
      await press(tester, l.continueAction);
      await tester.enterText(find.byType(TextField).at(0), 'Bekzod Aliyev');
      await tester.pumpAndSettle();
      expect(find.text(l.errorNameRequired), findsNothing);
      expect(find.text(l.errorPhoneInvalid), findsOneWidget);
      await tester.tap(find.widgetWithText(Pill, 'TOPIK II'));
      await tester.pumpAndSettle();
      expect(find.text(l.errorLevelRequired), findsNothing);
    });

    testWidgets('the phone keeps its +998 mask and the password can be shown', (tester) async {
      await openSignUp(tester);
      await tester.enterText(find.byType(TextField).at(1), '93555123499');
      await tester.enterText(find.byType(TextField).at(2), 'parol1234');
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField).at(1)).controller!.text, '+998 93 555 12 34');
      expect(tester.widget<TextField>(find.byType(TextField).at(2)).obscureText, isTrue);
      await tester.tap(find.bySemanticsLabel(l.showPassword));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField).at(2)).obscureText, isFalse);
      expect(find.bySemanticsLabel(l.hidePassword), findsOneWidget);
    });

    testWidgets('a right form creates the account with the name, phone, level and language, and asks for the code', (tester) async {
      final app = await openCode(tester);
      expect(app.auth.signUpData, {
        'fullName': 'Bekzod Aliyev',
        'phone': '+998935551234',
        'password': 'parol1234',
        'level': KoreanLevel.topik1,
        'language': 'uz',
      });
      await close(tester);
    });

    testWidgets('a phone that is already registered says so and offers Sign in', (tester) async {
      final app = await openSignUp(tester, auth: FakeAuthRepository()..registered.add('+998935551234'));
      await fillSignUp(tester);
      await press(tester, l.continueAction);
      expect(find.text(l.errorAlreadyRegistered), findsOneWidget);
      expect(find.byType(SignUpScreen), findsOneWidget);
      await tester.tap(find.widgetWithText(LinkButton, l.signIn));
      await tester.pumpAndSettle();
      expect(find.byType(SignInScreen), findsOneWidget);
      expect(app.auth.calls, ['signUp']);
    });

    testWidgets('too many SMS says when to try again', (tester) async {
      await openSignUp(tester, auth: FakeAuthRepository()..failNext = AuthFailure.tooManySms);
      await fillSignUp(tester);
      await press(tester, l.continueAction);
      expect(find.text(l.errorTooManySms(60)), findsOneWidget);
    });

    testWidgets('the consent line opens the privacy policy', (tester) async {
      await openSignUp(tester, auth: FakeAuthRepository(policy: 'Biz faqat telefon raqamingizni saqlaymiz.'));
      final consent = find.textContaining(l.consentLink, findRichText: true);
      final box = tester.getRect(consent);
      // The link is the middle of the line.
      await tester.tapAt(box.center);
      await tester.pumpAndSettle();
      expect(find.text('Biz faqat telefon raqamingizni saqlaymiz.'), findsOneWidget);
    });
  });

  group('SMS code screen', () {
    testWidgets('shows the phone, six boxes and a countdown to Resend', (tester) async {
      await openCode(tester);
      expect(find.textContaining('+998 93 555 12 34', findRichText: true), findsOneWidget);
      expect(find.text(l.resendIn('1:00')), findsOneWidget);
      await tester.pump(const Duration(seconds: 15));
      expect(find.text(l.resendIn('0:45')), findsOneWidget);
      expect(find.widgetWithText(LinkButton, l.resend), findsNothing);
      await close(tester);
    });

    testWidgets('Resend appears after 60 seconds, sends a new code and starts the countdown again', (tester) async {
      final app = await openCode(tester);
      await tester.pump(const Duration(seconds: 59));
      expect(find.text(l.resendIn('0:01')), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      await tester.tap(find.widgetWithText(LinkButton, l.resend));
      await tester.pump();
      await tester.pump();
      expect(app.auth.calls.last, 'resend');
      expect(find.text(l.resendIn('1:00')), findsOneWidget);
      await close(tester);
    });

    testWidgets('only digits, six at most; the sixth sends the code by itself', (tester) async {
      final app = await openCode(tester);
      await tester.enterText(find.byType(TextField), '48a2');
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, '482');
      expect(app.auth.calls, ['signUp']);
      // Confirm with an unfinished code sends nothing.
      await tester.tap(find.widgetWithText(PrimaryButton, l.confirm));
      await tester.pump();
      expect(app.auth.calls, ['signUp']);
      await tester.enterText(find.byType(TextField), '482193');
      await tester.pumpAndSettle();
      expect(app.auth.calls, ['signUp', 'verifyCode:482193']);
      await close(tester);
    });

    testWidgets('a wrong code says how many tries are left, and after the last one asks for a new code', (tester) async {
      final app = await openCode(tester);
      for (var left = 4; left >= 1; left--) {
        await tester.enterText(find.byType(TextField), '000000');
        await tester.pump();
        await tester.pump();
        expect(find.text(l.errorWrongCode(left)), findsOneWidget);
        expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
      }
      await tester.enterText(find.byType(TextField), '000000');
      await tester.pump();
      await tester.pump();
      expect(find.text(l.errorWrongCode(0)), findsOneWidget);
      // No more tries with this code, even the right one.
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
      final sent = app.auth.calls.length;
      await tester.tap(find.widgetWithText(PrimaryButton, l.confirm));
      await tester.pump();
      expect(app.auth.calls.length, sent);

      // A new code has its own five tries.
      await tester.pump(const Duration(seconds: 60));
      await tester.pump();
      await tester.tap(find.widgetWithText(LinkButton, l.resend));
      await tester.pump();
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isTrue);
      expect(find.text(l.errorWrongCode(0)), findsNothing);
      await close(tester);
    });

    testWidgets('too many SMS on Resend says when to try again', (tester) async {
      final app = await openCode(tester);
      await tester.pump(const Duration(seconds: 60));
      await tester.pump();
      app.auth.failNext = AuthFailure.tooManySms;
      await tester.tap(find.widgetWithText(LinkButton, l.resend));
      await tester.pump();
      await tester.pump();
      expect(find.text(l.errorTooManySms(60)), findsOneWidget);
      await close(tester);
    });

    testWidgets('the right code of a phone the centre knows shows the linked confirmation with the group', (tester) async {
      await openCode(
        tester,
        auth: FakeAuthRepository(profile: studentProfile, groups: ['TOPIK II · Kechki']),
      );
      await tester.enterText(find.byType(TextField), '482193');
      await tester.pumpAndSettle();
      expect(find.byType(LinkedScreen), findsOneWidget);
      expect(find.text(l.linkedTitle), findsOneWidget);
      expect(find.text('TOPIK II · Kechki'), findsOneWidget);
      await press(tester, l.start);
      expect(find.byType(HomeTab), findsOneWidget);
      expect(find.byType(StudentHomeView), findsOneWidget);
    });

    testWidgets('the right code of an unknown phone goes straight to the App user Home', (tester) async {
      await openCode(tester, auth: FakeAuthRepository(profile: appUserProfile));
      await tester.enterText(find.byType(TextField), '482193');
      await tester.pumpAndSettle();
      expect(find.byType(LinkedScreen), findsNothing);
      expect(find.byType(HomeTab), findsOneWidget);
      expect(find.byType(AppUserHomeView), findsOneWidget);
    });
  });

  group('sign in and forgot password', () {
    Future<TestApp> openSignIn(WidgetTester tester, {FakeAuthRepository? auth}) async {
      useScreen(tester, phone);
      final app = TestApp(auth: auth ?? FakeAuthRepository(profile: studentProfile));
      await app.pump(tester);
      await tester.tap(find.widgetWithText(SecondaryButton, l.signIn));
      await tester.pumpAndSettle();
      return app;
    }

    testWidgets('phone and password sign in and lead to Home', (tester) async {
      final app = await openSignIn(tester);
      await press(tester, l.signIn);
      expect(find.text(l.errorPhoneInvalid), findsOneWidget);
      expect(find.text(l.errorPasswordRequired), findsOneWidget);
      expect(app.auth.calls, isEmpty);

      await tester.enterText(find.byType(TextField).at(0), '901234567');
      await tester.enterText(find.byType(TextField).at(1), 'parol1234');
      await press(tester, l.signIn);
      expect(app.auth.calls, ['signIn']);
      expect(find.byType(HomeTab), findsOneWidget);
    });

    testWidgets('a wrong password says so in plain words', (tester) async {
      await openSignIn(tester, auth: FakeAuthRepository()..failNext = AuthFailure.invalidCredentials);
      await tester.enterText(find.byType(TextField).at(0), '901234567');
      await tester.enterText(find.byType(TextField).at(1), 'wrong-one');
      await press(tester, l.signIn);
      expect(find.text(l.errorInvalidCredentials), findsOneWidget);
      expect(find.byType(SignInScreen), findsOneWidget);
    });

    testWidgets('forgot password: phone, code, then a new password typed twice', (tester) async {
      final app = await openSignIn(tester);
      await tester.tap(find.widgetWithText(LinkButton, l.forgotPassword));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '901234567');
      await press(tester, l.sendCode);
      expect(app.auth.calls, ['sendResetCode']);

      await tester.enterText(find.byType(TextField), '482193');
      await tester.pumpAndSettle();
      expect(find.byType(NewPasswordScreen), findsOneWidget);

      await tester.enterText(find.byType(TextField).at(0), 'yangi-parol');
      await tester.enterText(find.byType(TextField).at(1), 'yangi-paro');
      await press(tester, l.save);
      expect(find.text(l.errorPasswordsDiffer), findsOneWidget);
      expect(app.auth.newPassword, isNull);

      await tester.enterText(find.byType(TextField).at(1), 'yangi-parol');
      await press(tester, l.save);
      expect(app.auth.newPassword, 'yangi-parol');
      expect(find.byType(HomeTab), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('forgot password for a phone without an account says so', (tester) async {
      await openSignIn(tester, auth: FakeAuthRepository()..failNext = AuthFailure.noAccount);
      await tester.tap(find.widgetWithText(LinkButton, l.forgotPassword));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '901234567');
      await press(tester, l.sendCode);
      expect(find.text(l.errorNoAccount), findsOneWidget);
    });
  });

  group('what Supabase says, in plain words', () {
    test('error codes become the failures the screens show', () {
      expect(authFailureOf(code: 'otp_expired', status: '403', message: 'Token has expired or is invalid'), AuthFailure.wrongCode);
      expect(authFailureOf(code: 'user_already_exists', status: '422'), AuthFailure.alreadyRegistered);
      expect(authFailureOf(code: 'invalid_credentials', status: '400'), AuthFailure.invalidCredentials);
      expect(authFailureOf(code: 'phone_not_confirmed', status: '400'), AuthFailure.notConfirmed);
      expect(authFailureOf(code: 'over_sms_send_rate_limit', status: '429'), AuthFailure.tooManySms);
      expect(authFailureOf(code: 'weak_password', status: '422'), AuthFailure.weakPassword);
      expect(authFailureOf(code: 'otp_disabled', status: '422', message: 'Signups not allowed for otp'), AuthFailure.noAccount);
    });

    test('the codes of the CRM\'s Send SMS hook are understood', () {
      expect(authFailureOf(code: 'hook_payload_invalid', status: '500', message: 'Error sending sms: sms_rate_limited'), AuthFailure.tooManySms);
      expect(authFailureOf(code: 'unexpected_failure', status: '500', message: 'phone_not_supported'), AuthFailure.phoneNotSupported);
      expect(authFailureOf(code: 'unexpected_failure', status: '500', message: 'sms_send_failed'), AuthFailure.unknown);
    });

    test('no answer at all is a connection problem', () {
      expect(authFailureOf(message: 'SocketException: Failed host lookup'), AuthFailure.network);
    });
  });
}
