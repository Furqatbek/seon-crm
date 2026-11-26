// QR check-in — docs/STUDENT_APP_SPEC.md → "Rules → QR check-in" and "App
// behaviour → QR tab".
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/data/checkin.dart';
import 'package:student/data/home.dart';
import 'package:student/features/more/simple_pages.dart';
import 'package:student/features/qr/qr_tab.dart';
import 'package:student/ui/widgets.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

FakeAuthRepository student() => FakeAuthRepository(signedIn: true, profile: studentProfile);
FakeAuthRepository appUser() => FakeAuthRepository(signedIn: true, profile: appUserProfile);

// The same fixed moment, secret and student as supabase/tests/checkin.test.ts:
// the phone and the server must write the very same code.
final fixedAt = DateTime.utc(2026, 11, 26, 10, 45);
const fixedCode = 'v1.11111111-2222-4333-8444-555555555555.59856330.cf514c2db341426d5c0869ad1fc302c589c3309ddb910369eb3fa5a609965193';
const nextCode = 'v1.11111111-2222-4333-8444-555555555555.59856331.8a2f6abd9b02e58b83ccf15327882bdf51f99f43a2833c401ce8b3fedd0e3dfb';

String codeAt(DateTime now, {QrIdentity identity = testQrIdentity}) => qrCode(secret: identity.secret, studentId: identity.studentId, now: now);

Future<void> openQr(WidgetTester tester) async {
  await tester.tap(find.bySemanticsLabel(l.tabQr).last);
  await tester.pumpAndSettle();
}

String shown(WidgetTester tester) => tester.widget<QrCodeView>(find.byType(QrCodeView)).data;

void main() {
  group('the code', () {
    test('is the same on the phone as on the server, for a fixed clock', () {
      expect(codeAt(fixedAt), fixedCode);
      // The phone's own time zone does not matter: a moment is a moment.
      expect(codeAt(fixedAt.toLocal()), fixedCode);
      expect(codeAt(DateTime.fromMillisecondsSinceEpoch(fixedAt.millisecondsSinceEpoch)), fixedCode);
    });

    test('stays for its 30 seconds, then changes', () {
      expect(codeAt(fixedAt.add(const Duration(seconds: 29, milliseconds: 999))), fixedCode);
      expect(codeAt(fixedAt.add(const Duration(seconds: 30))), nextCode);
      expect(qrStep(fixedAt.add(const Duration(seconds: 30))), qrStep(fixedAt) + 1);
      // Two steps on, reception's scanner no longer takes the first code: it reads the step in it.
      expect(codeAt(fixedAt.add(const Duration(seconds: 60))).split('.')[2], '${qrStep(fixedAt) + 2}');
    });

    test('has four parts: the version, the student, the step and a 64-character signature', () {
      final parts = fixedCode.split('.');
      expect(parts, hasLength(4));
      expect(parts[0], 'v1');
      expect(parts[1], testQrIdentity.studentId);
      expect(int.parse(parts[2]), fixedAt.millisecondsSinceEpoch ~/ 30000);
      expect(parts[3], matches(RegExp(r'^[0-9a-f]{64}$')));
    });

    test('is signed: another secret, another student or another step gives another signature', () {
      final signature = fixedCode.split('.').last;
      expect(
        codeAt(
          fixedAt,
          identity: QrIdentity(studentId: testQrIdentity.studentId, secret: 'f' * 64),
        ).split('.').last,
        isNot(signature),
      );
      expect(
        codeAt(
          fixedAt,
          identity: QrIdentity(studentId: '99999999-2222-4333-8444-555555555555', secret: testQrIdentity.secret),
        ).split('.').last,
        isNot(signature),
      );
      expect(nextCode.split('.').last, isNot(signature));
    });

    test('the countdown runs from the start of a step to its end', () {
      expect(qrStepProgress(fixedAt), 0);
      expect(qrStepProgress(fixedAt.add(const Duration(seconds: 15))), 0.5);
      expect(qrStepProgress(fixedAt.add(const Duration(seconds: 30))), 0);
    });
  });

  group('the QR tab for a student', () {
    testWidgets('shows their name and the code for this moment, and a new one 30 seconds later', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.pump(tester);
      await openQr(tester);

      expect(find.text('Aziza Karimova'), findsWidgets);
      expect(shown(tester), fixedCode);
      expect(find.text(l.qrRotates), findsOneWidget);
      expect(find.text(l.qrShowAtReception), findsOneWidget);
      expect(find.text(l.qrWorksOffline), findsOneWidget);
      // The secret came from the server once and is kept on the phone.
      expect(app.secrets.kept, testQrIdentity);
      expect(app.secrets.profileId, studentProfile.id);

      app.now = fixedAt.add(const Duration(seconds: 29));
      await tester.pump(const Duration(seconds: 1));
      expect(shown(tester), fixedCode);
      app.now = fixedAt.add(const Duration(seconds: 30));
      await tester.pump(const Duration(seconds: 1));
      expect(shown(tester), nextCode);
    });

    testWidgets('works without a connection, from the secret kept on the phone', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.secrets.write(studentProfile.id, testQrIdentity);
      app.checkin.failure = const OfflineException();
      await app.pump(tester);
      await openQr(tester);
      expect(shown(tester), fixedCode);
      // The status is not known offline: nothing is claimed beyond "not yet".
      expect(find.text(l.qrTodayNone), findsOneWidget);
    });

    testWidgets('the first time, without a connection, says to connect once; Retry gets the code', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      app.checkin.failure = const OfflineException();
      await app.pump(tester);
      await openQr(tester);
      expect(find.byType(QrCodeView), findsNothing);
      expect(find.text(l.qrNeedsInternet), findsOneWidget);

      app.checkin.failure = null;
      await tester.tap(find.widgetWithText(SecondaryButton, l.retry));
      await tester.pumpAndSettle();
      expect(shown(tester), fixedCode);
    });

    testWidgets('a secret kept for someone else on this phone is not used', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.secrets.write('someone-else', QrIdentity(studentId: 'other', secret: 'a' * 64));
      await app.pump(tester);
      await openQr(tester);
      expect(shown(tester), fixedCode);
      expect(app.secrets.profileId, studentProfile.id);
    });

    testWidgets('after the password or phone changed, the new secret replaces the old one', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.pump(tester);
      await openQr(tester);
      expect(shown(tester), fixedCode);

      // The server replaced the secret. Opening the tab again asks for it.
      final replaced = QrIdentity(studentId: testQrIdentity.studentId, secret: 'b' * 64);
      app.checkin.serverIdentity = replaced;
      await tester.tap(find.bySemanticsLabel(l.tabHome).last);
      await tester.pumpAndSettle();
      await openQr(tester);
      expect(shown(tester), codeAt(fixedAt, identity: replaced));
      expect(shown(tester), isNot(fixedCode));
      expect(app.secrets.kept, replaced);
    });

    testWidgets('today\'s status: not arrived yet, Arrived with the time, then Left, as reception scans', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.pump(tester);
      await openQr(tester);
      expect(find.widgetWithText(Pill, l.qrTodayNone), findsOneWidget);

      // 09:52 UTC is 14:52 in Tashkent.
      app.checkin.scan(DateTime.utc(2026, 11, 26, 9, 52));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(Pill, l.qrTodayArrived('14:52')), findsOneWidget);

      app.checkin.scan(DateTime.utc(2026, 11, 26, 13, 34));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(Pill, l.qrTodayLeft('18:34')), findsOneWidget);
    });

    testWidgets('the screen is brightened while the tab is open and put back on leaving it', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.pump(tester);
      expect(app.light.calls, isEmpty);

      await openQr(tester);
      expect(app.light.raised, isTrue);
      await tester.tap(find.bySemanticsLabel(l.tabHome).last);
      await tester.pumpAndSettle();
      expect(app.light.calls, ['raise', 'restore']);
      await openQr(tester);
      expect(app.light.calls, ['raise', 'restore', 'raise']);
    });

    testWidgets('Log out removes the secret from the phone', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student())..now = fixedAt;
      await app.pump(tester);
      await openQr(tester);
      expect(app.secrets.kept, isNotNull);

      await tester.tap(find.bySemanticsLabel(l.tabMore).last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text(l.logOut), 200, scrollable: find.byType(Scrollable).last);
      await tester.tap(find.text(l.logOut));
      await tester.pumpAndSettle();
      expect(app.secrets.kept, isNull);
      expect(app.light.raised, isFalse);
    });

    testWidgets('the code is black on white in the dark theme too', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student(), preferences: const {'theme': 'dark'})..now = fixedAt;
      await app.pump(tester);
      await openQr(tester);
      expect(shown(tester), fixedCode);
      expect(tester.takeException(), isNull);
    });
  });

  group('the QR tab for an App user', () {
    testWidgets('is locked: it says who the code is for and offers a free open lesson', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: appUser())..now = fixedAt;
      await app.pump(tester);
      await openQr(tester);

      expect(find.byType(QrCodeView), findsNothing);
      expect(find.text(l.qrLockedTitle), findsOneWidget);
      expect(find.text(l.qrLockedHint), findsOneWidget);
      // No secret is asked for, and the screen is left alone.
      expect(app.checkin.asked, 0);
      expect(app.light.calls, isEmpty);

      await tester.tap(find.widgetWithText(PrimaryButton, l.qrBookFreeLesson));
      await tester.pumpAndSettle();
      expect(find.byType(OpenLessonsPage), findsOneWidget);
    });
  });
}
