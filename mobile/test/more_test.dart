// The More tab and its pages — docs/STUDENT_APP_SPEC.md → "App behaviour → More".
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/core/more_state.dart';
import 'package:student/data/auth_failure.dart';
import 'package:student/data/more.dart';
import 'package:student/features/auth/code_screen.dart';
import 'package:student/features/auth/sign_in_screens.dart';
import 'package:student/features/auth/welcome_screen.dart';
import 'package:student/features/home/student_home.dart';
import 'package:student/features/more/crop.dart';
import 'package:student/features/more/edit_profile.dart';
import 'package:student/features/more/leaderboard.dart';
import 'package:student/features/more/money_pages.dart';
import 'package:student/features/more/more_tab.dart';
import 'package:student/features/more/schedule.dart';
import 'package:student/features/more/simple_pages.dart';
import 'package:student/features/offers/offers.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/ui/tokens.dart';
import 'package:student/ui/widgets.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

FakeAuthRepository student() => FakeAuthRepository(signedIn: true, profile: studentProfile);
FakeAuthRepository appUser() => FakeAuthRepository(signedIn: true, profile: appUserProfile);

Future<TestApp> openMore(WidgetTester tester, {FakeAuthRepository? auth, TestApp? app}) async {
  useScreen(tester, phone);
  app ??= TestApp(
    auth: auth ?? student(),
    home: FakeHomeRepository(
      home: homeJson({
        'groups': [
          {'id': 'g-1', 'name': 'TOPIK II · Kechki'},
          {'id': 'g-2', 'name': 'Matematika · Shanba'},
        ],
      }),
    ),
  );
  await app.pump(tester);
  await tester.tap(find.bySemanticsLabel(l.tabMore).last);
  await tester.pumpAndSettle();
  return app;
}

Future<void> openRow(WidgetTester tester, String label) async {
  await tester.ensureVisible(find.widgetWithText(ListRow, label));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ListRow, label));
  await tester.pumpAndSettle();
}

Future<void> close(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
}

List<String> rowLabels(WidgetTester tester) => tester.widgetList<ListRow>(find.byType(ListRow)).map((row) => row.label).toList();

void main() {
  group('More: the two versions', () {
    testWidgets('Student: hero with name and groups, then the centre\'s pages in order', (tester) async {
      await openMore(tester);
      expect(find.text('Aziza Karimova'), findsOneWidget);
      expect(find.widgetWithText(Pill, 'TOPIK II · Kechki'), findsOneWidget);
      expect(find.widgetWithText(Pill, 'Matematika · Shanba'), findsOneWidget);
      expect(find.text('AK'), findsOneWidget);
      expect(rowLabels(tester), [
        l.editProfile,
        l.leaderboard,
        l.schedule,
        l.payments,
        l.coinHistory,
        l.language,
        l.appearance,
        l.privacyPolicy,
        l.aboutCentre,
        l.deleteAccount,
        l.logOut,
      ]);
    });

    testWidgets('App user: hero with name and level, the voucher and open lessons instead', (tester) async {
      await openMore(tester, auth: appUser());
      expect(find.text('Bekzod Aliyev'), findsOneWidget);
      expect(find.widgetWithText(Pill, 'TOPIK I darajasi'), findsOneWidget);
      expect(rowLabels(tester), [
        l.editProfile,
        l.myVoucher,
        l.openLessons,
        l.language,
        l.appearance,
        l.privacyPolicy,
        l.aboutCentre,
        l.deleteAccount,
        l.logOut,
      ]);
      for (final hidden in [l.leaderboard, l.schedule, l.payments, l.coinHistory]) {
        expect(find.text(hidden), findsNothing);
      }
    });

    testWidgets('Language and Appearance show what is chosen', (tester) async {
      await openMore(tester);
      expect(tester.widget<ListRow>(find.widgetWithText(ListRow, l.language)).value, 'Oʻzbekcha');
      expect(tester.widget<ListRow>(find.widgetWithText(ListRow, l.appearance)).value, l.themeSystem);
    });

    testWidgets('every row opens its page, and Back returns', (tester) async {
      await openMore(tester);
      final pages = {
        l.editProfile: EditProfilePage,
        l.leaderboard: LeaderboardPage,
        l.schedule: SchedulePage,
        l.payments: PaymentsPage,
        l.coinHistory: CoinHistoryPage,
        l.language: LanguagePage,
        l.appearance: AppearancePage,
        l.privacyPolicy: CentreTextPage,
        l.aboutCentre: CentreTextPage,
      };
      for (final page in pages.entries) {
        await openRow(tester, page.key);
        expect(find.byType(page.value), findsOneWidget, reason: page.key);
        await tester.tap(find.bySemanticsLabel(l.back));
        await tester.pumpAndSettle();
        expect(find.byType(MoreTab), findsOneWidget);
      }
    });

    testWidgets('App user: My voucher and Open lessons open', (tester) async {
      await openMore(tester, auth: appUser());
      await openRow(tester, l.myVoucher);
      expect(find.text(l.voucherEmpty), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.back));
      await tester.pumpAndSettle();
      await openRow(tester, l.openLessons);
      expect(find.byType(OpenLessonsPage), findsOneWidget);
    });

    testWidgets('Privacy policy and About come from the centre\'s settings', (tester) async {
      final app = await openMore(tester);
      app.auth.policy = 'Biz faqat telefon raqamingizni saqlaymiz.';
      await openRow(tester, l.privacyPolicy);
      expect(find.text('Biz faqat telefon raqamingizni saqlaymiz.'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.back));
      await tester.pumpAndSettle();
      await openRow(tester, l.aboutCentre);
      expect(find.text('Seon Topik — Toshkentdagi koreys tili markazi.'), findsOneWidget);
    });

    testWidgets('About says so when the centre has written nothing', (tester) async {
      final app = await openMore(tester);
      app.more.aboutText = null;
      await openRow(tester, l.aboutCentre);
      expect(find.text(l.aboutEmpty), findsOneWidget);
    });
  });

  group('language and appearance pages', () {
    testWidgets('the four languages, each in its own name; choosing one switches at once and is saved', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.language);
      expect(rowLabels(tester), ['Oʻzbekcha', 'Русский', 'English', '한국어']);
      await tester.tap(find.text('한국어'));
      await tester.pumpAndSettle();
      // The page itself is in Korean now, without leaving it.
      expect(find.text(l10n('ko').language), findsOneWidget);
      expect(tester.widget<ListRow>(find.widgetWithText(ListRow, '한국어')).selected, isTrue);
      expect(app.saved.getString('language'), 'ko');
      expect(app.auth.savedLanguage, 'ko');
    });

    testWidgets('System, Light and Dark; the choice applies at once and is saved to the profile', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.appearance);
      expect(rowLabels(tester), [l.themeSystem, l.themeLight, l.themeDark]);
      await tester.tap(find.text(l.themeDark));
      await tester.pumpAndSettle();
      expect(Theme.of(tester.element(find.byType(AppearancePage))).brightness, Brightness.dark);
      expect(app.auth.savedTheme, 'dark');
      await tester.tap(find.text(l.themeLight));
      await tester.pumpAndSettle();
      expect(Theme.of(tester.element(find.byType(AppearancePage))).brightness, Brightness.light);
    });
  });

  group('Delete account and Log out', () {
    testWidgets('the sheet lists what is deleted and what the centre keeps', (tester) async {
      await openMore(tester);
      await openRow(tester, l.deleteAccount);
      final sheet = find.byType(DeleteAccountSheet);
      for (final text in [l.deleteWillBeDeleted, l.deleteLogin, l.deleteCoins, l.deleteResults, l.deleteBookings, l.deleteKept, l.deletePaymentRecords]) {
        expect(
          find.descendant(of: sheet, matching: find.text(text)),
          findsOneWidget,
          reason: text,
        );
      }
    });

    testWidgets('Cancel changes nothing', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.deleteAccount);
      await tester.tap(find.widgetWithText(SecondaryButton, l.cancel));
      await tester.pumpAndSettle();
      expect(find.byType(DeleteAccountSheet), findsNothing);
      expect(app.auth.calls, isEmpty);
      expect(find.byType(MoreTab), findsOneWidget);
    });

    testWidgets('Delete calls delete_my_account, signs out at once, and the account can no longer sign in', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.deleteAccount);
      await tester.tap(find.widgetWithText(DangerButton, l.deleteAction));
      await tester.pumpAndSettle();
      expect(app.auth.calls, ['deleteAccount']);
      expect(find.byType(WelcomeScreen), findsOneWidget);
      // Nothing of the person is left on the phone.
      expect(app.saved.getString('home_cache'), isNull);

      await tester.tap(find.widgetWithText(SecondaryButton, l.signIn));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '901234567');
      await tester.enterText(find.byType(TextField).at(1), 'parol1234');
      await tester.tap(find.widgetWithText(PrimaryButton, l.signIn));
      await tester.pumpAndSettle();
      expect(find.text(l.errorInvalidCredentials), findsOneWidget);
      expect(find.byType(SignInScreen), findsOneWidget);
    });

    testWidgets('when the server cannot be reached the account stays and the sheet says so', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.deleteAccount);
      app.auth.failNext = AuthFailure.network;
      await tester.tap(find.widgetWithText(DangerButton, l.deleteAction));
      await tester.pumpAndSettle();
      expect(find.text(l.deleteFailed), findsOneWidget);
      expect(app.auth.isSignedIn, isTrue);
    });

    testWidgets('an app user has no payment records for the centre to keep', (tester) async {
      await openMore(tester, auth: appUser());
      await openRow(tester, l.deleteAccount);
      expect(find.text(l.deleteKept), findsNothing);
    });

    testWidgets('Log out leads to Welcome and keeps the account', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.logOut);
      expect(find.byType(WelcomeScreen), findsOneWidget);
      expect(app.auth.calls, ['signOut']);
      expect(app.auth.deleted, isFalse);
    });
  });

  group('Leaderboard', () {
    test('own row is pinned only when it is below the first ten', () {
      List<LeaderRow> board(int count, int me) => [for (var i = 1; i <= count; i++) LeaderRow(rank: i, name: 'A B.', coins: 1000 - i, isMe: i == me)];
      expect(pinnedRow(board(180, 27))?.rank, 27);
      expect(pinnedRow(board(180, 11))?.rank, 11);
      expect(pinnedRow(board(180, 10)), isNull);
      expect(pinnedRow(board(8, 3)), isNull);
      expect(pinnedRow(board(180, 1)), isNull);
      // Not on the board at all (hidden, or no coins yet): nothing to pin.
      expect(pinnedRow(board(20, 0)), isNull);
      expect(pinnedRow(const []), isNull);
      // Ties share a rank: the position in the list decides, not the number.
      final tied = [for (var i = 0; i < 12; i++) LeaderRow(rank: 1, name: 'A B.', coins: 5, isMe: i == 11)];
      expect(pinnedRow(tied)?.isMe, isTrue);
    });

    testWidgets('my group, this month: a podium for the first three and "(you)" on the own place', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.leaderboard);
      expect(app.more.boards, ['group:month:g-1']);
      final podium = find.byType(Podium);
      expect(find.descendant(of: podium, matching: find.text('Jasur T.')), findsOneWidget);
      expect(find.descendant(of: podium, matching: find.text('Aziza K. (siz)')), findsOneWidget);
      expect(find.byType(LeaderTile), findsNWidgets(5));
      expect(find.text('Otabek S.'), findsOneWidget);
      // Third place is on screen: nothing is pinned.
      expect(find.text(l.ofPeople(8)), findsNothing);
    });

    testWidgets('centre: own row pinned under the list with "of 180"', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.leaderboard);
      await tester.tap(find.text(l.scopeCentre));
      await tester.pumpAndSettle();
      expect(app.more.boards.last, 'centre:month:g-1');
      expect(find.byType(Podium), findsNothing);
      final pinned = tester.widgetList<LeaderTile>(find.byType(LeaderTile)).where((tile) => tile.pinned).toList();
      expect(pinned.length, 1);
      expect(pinned.single.row.rank, 27);
      expect(find.text('Aziza K. (siz)'), findsOneWidget);
      expect(find.text('180 kishidan'), findsOneWidget);
      // It stays in place while the list scrolls.
      final before = tester.getTopLeft(find.text('180 kishidan'));
      await tester.drag(find.text('Kamola E.'), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.text('180 kishidan')), before);
    });

    testWidgets('all-time asks for the other period', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.leaderboard);
      await tester.tap(find.text(l.periodAll));
      await tester.pumpAndSettle();
      expect(app.more.boards.last, 'group:all:g-1');
    });

    testWidgets('an empty board says so', (tester) async {
      final app = await openMore(tester);
      app.more.group = [];
      await openRow(tester, l.leaderboard);
      expect(find.text(l.leaderboardEmpty), findsOneWidget);
    });
  });

  group('Schedule', () {
    test('a week starts on Monday, across months and years', () {
      expect(weekStartOf(DateTime.utc(2026, 11, 26)), DateTime.utc(2026, 11, 23));
      expect(weekStartOf(DateTime.utc(2026, 11, 23)), DateTime.utc(2026, 11, 23));
      expect(weekStartOf(DateTime.utc(2026, 11, 29)), DateTime.utc(2026, 11, 23));
      expect(weekStartOf(DateTime.utc(2026, 11, 30)), DateTime.utc(2026, 11, 30));
      expect(weekStartOf(DateTime.utc(2026, 12, 1)), DateTime.utc(2026, 11, 30));
      expect(weekStartOf(DateTime.utc(2027, 1, 1)), DateTime.utc(2026, 12, 28));
      expect(weekStartOf(DateTime.utc(2027, 1, 3)), DateTime.utc(2026, 12, 28));
      expect(weekStartOf(DateTime.utc(2027, 1, 4)), DateTime.utc(2027, 1, 4));
    });

    test('the week is named by its days', () {
      expect(weekTitle(DateTime.utc(2026, 11, 16), l), '16–22 noyabr');
      expect(weekTitle(DateTime.utc(2026, 11, 30), l), '30-noyabr–6-dekabr');
      expect(weekTitle(DateTime.utc(2026, 11, 16), l10n('en')), 'November 16–22');
      expect(weekTitle(DateTime.utc(2026, 11, 16), l10n('ko')), '11월 16–22일');
    });

    testWidgets('opens on this week, Monday to Sunday', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.schedule);
      expect(app.more.weeks, [(DateTime.utc(2026, 11, 23), DateTime.utc(2026, 11, 29))]);
      expect(find.text('23–29 noyabr'), findsOneWidget);
      expect(find.textContaining('Dushanba, 23-noyabr', findRichText: true), findsOneWidget);
      // Thursday the 26th is today.
      expect(find.textContaining('Payshanba, 26-noyabr · Bugun', findRichText: true), findsOneWidget);
      // Days without lessons have no section.
      expect(find.textContaining('Seshanba', findRichText: true), findsNothing);
    });

    testWidgets('the week follows Tashkent time, not the phone\'s or UTC', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student());
      // Sunday 29 November, 19:30 UTC is already Monday 30 November, 00:30 in Tashkent.
      app.now = DateTime.utc(2026, 11, 29, 19, 30);
      await openMore(tester, app: app);
      await openRow(tester, l.schedule);
      expect(app.more.weeks, [(DateTime.utc(2026, 11, 30), DateTime.utc(2026, 12, 6))]);
      await close(tester);

      final earlier = TestApp(auth: student());
      // 18:30 UTC is 23:30 in Tashkent: still Sunday, still the old week.
      earlier.now = DateTime.utc(2026, 11, 29, 18, 30);
      await openMore(tester, app: earlier);
      await openRow(tester, l.schedule);
      expect(earlier.more.weeks, [(DateTime.utc(2026, 11, 23), DateTime.utc(2026, 11, 29))]);
    });

    testWidgets('the arrows move a week at a time, over the end of the month', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.schedule);
      await tester.tap(find.bySemanticsLabel(l.nextWeek));
      await tester.pumpAndSettle();
      expect(app.more.weeks.last, (DateTime.utc(2026, 11, 30), DateTime.utc(2026, 12, 6)));
      expect(find.text('30-noyabr–6-dekabr'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.previousWeek));
      await tester.pumpAndSettle();
      await tester.tap(find.bySemanticsLabel(l.previousWeek));
      await tester.pumpAndSettle();
      expect(app.more.weeks.last, (DateTime.utc(2026, 11, 16), DateTime.utc(2026, 11, 22)));
      expect(find.text('16–22 noyabr'), findsOneWidget);
    });

    testWidgets('a lesson shows its time, group, room and teacher; a cancelled one is struck through', (tester) async {
      await openMore(tester);
      await openRow(tester, l.schedule);
      final tiles = tester.widgetList<LessonTile>(find.byType(LessonTile)).toList();
      expect(tiles.length, 5);
      final first = find.byType(LessonTile).first;
      expect(find.descendant(of: first, matching: find.text('18:00–19:30')), findsOneWidget);
      expect(find.descendant(of: first, matching: find.text('204-xona · Malika Tursunova')), findsOneWidget);
      expect(tester.widget<Text>(find.descendant(of: first, matching: find.text('TOPIK II'))).style?.decoration, isNull);

      final cancelled = find.byType(LessonTile).at(1);
      for (final text in tester.widgetList<Text>(find.descendant(of: cancelled, matching: find.byType(Text)))) {
        expect(text.style?.decoration, TextDecoration.lineThrough);
      }
      expect(find.widgetWithText(Pill, l.cancelled), findsOneWidget);
    });

    testWidgets('an exam is highlighted with its title', (tester) async {
      await openMore(tester);
      await openRow(tester, l.schedule);
      await tester.ensureVisible(find.text('Mock TOPIK II'));
      final exam = find.ancestor(of: find.text('Mock TOPIK II'), matching: find.byType(LessonTile));
      expect(find.descendant(of: exam, matching: find.widgetWithText(Pill, l.exam)), findsOneWidget);
      final box = tester.widget<Container>(find.descendant(of: exam, matching: find.byType(Container)).first);
      expect((box.decoration! as BoxDecoration).color, AppColors.light.primaryTint);
      // A lesson of another group on the same day, an hour long.
      expect(find.text('12:00–13:00'), findsOneWidget);
    });

    testWidgets('a week without lessons says so', (tester) async {
      final app = await openMore(tester);
      app.more.week = (_) => [];
      await openRow(tester, l.schedule);
      expect(find.text(l.noLessonsThisWeek), findsOneWidget);
    });
  });

  group('Payments and Coin history', () {
    testWidgets('balance, then payments with receipt numbers and charges by month', (tester) async {
      await openMore(tester);
      await openRow(tester, l.payments);
      final balance = find.byType(BalanceCard);
      expect(find.descendant(of: balance, matching: find.text('0 soʻm')), findsOneWidget);
      expect(find.descendant(of: balance, matching: find.widgetWithText(Pill, l.balancePaid)), findsOneWidget);
      expect(find.text('Noyabr'), findsOneWidget);
      expect(find.text('Oktabr'), findsOneWidget);
      expect(find.text('3‑noyabr · kvitansiya №1043'), findsOneWidget);
      expect(find.text('4‑oktabr · kvitansiya №0987'), findsOneWidget);
      expect(find.text('Noyabr toʻlovi'), findsOneWidget);
      expect(find.text('+600 000 soʻm'), findsNWidgets(2));
      expect(find.text('−600 000 soʻm'), findsNWidgets(2));
    });

    testWidgets('Pay by card and My receipts are there but not open yet', (tester) async {
      await openMore(tester);
      await openRow(tester, l.payments);
      expect(tester.widget<PrimaryButton>(find.widgetWithText(PrimaryButton, l.payByCard)).onPressed, isNull);
      expect(tester.widget<LinkButton>(find.byType(LinkButton)).onPressed, isNull);
      expect(find.textContaining(l.myReceipts), findsOneWidget);
    });

    testWidgets('a debt shows on the balance card', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(
        auth: student(),
        home: FakeHomeRepository(
          home: homeJson({
            'balance': {'amount': -600000, 'oldest_unpaid_month': '2026-11-01', 'due_day': 5},
          }),
        ),
      );
      await openMore(tester, app: app);
      await openRow(tester, l.payments);
      expect(find.descendant(of: find.byType(BalanceCard), matching: find.widgetWithText(Pill, l.balanceDebt)), findsOneWidget);
      expect(find.descendant(of: find.byType(BalanceCard), matching: find.text('−600 000 soʻm')), findsOneWidget);
    });

    testWidgets('coin history: the balance, then each time coins were earned or spent', (tester) async {
      await openMore(tester);
      await openRow(tester, l.coinHistory);
      expect(find.text('128 tanga'), findsOneWidget);
      expect(find.text('+12 shu hafta'), findsOneWidget);
      for (final text in [
        l.sourceGameWin,
        'Bugun, 15:20',
        l.sourceAttendance,
        'Uy vazifasi bajarildi',
        l.yesterday,
        'Buyurtma: Brendli futbolka',
        '22‑noyabr',
        l.sourcePerfectMonth,
        '+5',
        '−100',
        '+10',
      ]) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
    });

    test('a coin row is named by the reason given, else by where the coins came from', () {
      CoinEntry entry(String source, [String? reason]) => CoinEntry(delta: 1, source: source, at: testNow, reason: reason);
      expect(coinTitle(entry('teacher_award', 'Darsda faol'), l), 'Darsda faol');
      expect(coinTitle(entry('teacher_award', '  '), l), l.sourceTeacherAward);
      expect(coinTitle(entry('exam'), l), l.sourceExam);
      expect(coinTitle(entry('owner_adjustment'), l), l.sourceAdjustment);
      expect(coinTitle(entry('something_new'), l), l.sourceAdjustment);
    });

    testWidgets('empty lists say so', (tester) async {
      final app = await openMore(tester);
      app.more.ledgerEntries = [];
      app.more.coins = [];
      await openRow(tester, l.payments);
      expect(find.text(l.paymentsEmpty), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.back));
      await tester.pumpAndSettle();
      await openRow(tester, l.coinHistory);
      expect(find.text(l.coinHistoryEmpty), findsOneWidget);
    });
  });

  group('Edit profile', () {
    testWidgets('shows the phone to change; name, birthday and parent details are read-only', (tester) async {
      await openMore(tester);
      await openRow(tester, l.editProfile);
      ListRow row(String label) => tester.widget<ListRow>(find.widgetWithText(ListRow, label));
      expect(row(l.phone).value, '+998 90 123 45 67');
      expect(row(l.phone).onTap, isNotNull);
      expect(row(l.fullName).value, 'Aziza Karimova');
      expect(row(l.birthDate).value, '12-aprel, 2009');
      expect(row(l.parentName).value, 'Dilfuza Karimova');
      expect(row(l.parentPhone).value, '+998 97 111 22 33');
      for (final label in [l.fullName, l.birthDate, l.parentName, l.parentPhone]) {
        expect(row(label).onTap, isNull, reason: label);
      }
      expect(find.text(l.staffOnlyHint), findsOneWidget);
    });

    testWidgets('changing the phone sends a code to the new number and saves it only when confirmed', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.editProfile);
      await openRow(tester, l.phone);
      expect(find.byType(ChangePhonePage), findsOneWidget);

      // The current number is not a change.
      await tester.enterText(find.byType(TextField), '901234567');
      await tester.tap(find.widgetWithText(PrimaryButton, l.continueAction));
      await tester.pumpAndSettle();
      expect(find.text(l.phoneSame), findsOneWidget);
      expect(app.auth.calls, isEmpty);

      await tester.enterText(find.byType(TextField), '935550011');
      await tester.tap(find.widgetWithText(PrimaryButton, l.continueAction));
      await tester.pumpAndSettle();
      expect(app.auth.calls, ['startPhoneChange:+998935550011']);
      expect(find.byType(CodeScreen), findsOneWidget);
      expect(app.auth.profile!.phone, '+998901234567');

      // A wrong code changes nothing.
      await tester.enterText(find.byType(TextField), '000000');
      await tester.pump();
      await tester.pump();
      expect(find.text(l.errorWrongCode(4)), findsOneWidget);
      expect(app.auth.profile!.phone, '+998901234567');

      await tester.enterText(find.byType(TextField), '482193');
      await tester.pumpAndSettle();
      expect(app.auth.profile!.phone, '+998935550011');
      expect(find.byType(EditProfilePage), findsOneWidget);
      expect(tester.widget<ListRow>(find.widgetWithText(ListRow, l.phone)).value, '+998 93 555 00 11');
      await tester.pump(const Duration(seconds: 5));
      await close(tester);
    });

    testWidgets('a number someone else has says so', (tester) async {
      final app = await openMore(tester);
      app.auth.registered.add('+998935550011');
      await openRow(tester, l.editProfile);
      await openRow(tester, l.phone);
      await tester.enterText(find.byType(TextField), '935550011');
      await tester.tap(find.widgetWithText(PrimaryButton, l.continueAction));
      await tester.pumpAndSettle();
      expect(find.text(l.errorAlreadyRegistered), findsOneWidget);
      expect(find.byType(ChangePhonePage), findsOneWidget);
    });

    testWidgets('change password: typed twice, 8 characters or more', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.editProfile);
      await openRow(tester, l.changePassword);
      await tester.enterText(find.byType(TextField).at(0), 'qisqa');
      await tester.enterText(find.byType(TextField).at(1), 'boshqa');
      await tester.tap(find.widgetWithText(PrimaryButton, l.save));
      await tester.pumpAndSettle();
      expect(find.text(l.errorPasswordShort), findsOneWidget);
      expect(find.text(l.errorPasswordsDiffer), findsOneWidget);
      expect(app.auth.newPassword, isNull);

      await tester.enterText(find.byType(TextField).at(0), 'yangi-parol');
      await tester.enterText(find.byType(TextField).at(1), 'yangi-parol');
      await tester.tap(find.widgetWithText(PrimaryButton, l.save));
      await tester.pumpAndSettle();
      expect(app.auth.newPassword, 'yangi-parol');
      expect(find.byType(EditProfilePage), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('photo: camera or gallery, cropped square, uploaded; then it can be removed', (tester) async {
      final app = await openMore(tester);
      // A real picture, wider than tall, as a camera gives.
      app.photo = await tester.runAsync(() async {
        final recorder = ui.PictureRecorder();
        Canvas(recorder).drawRect(const Rect.fromLTWH(0, 0, 80, 40), Paint()..color = const Color(0xFF7C4DFF));
        final image = await recorder.endRecording().toImage(80, 40);
        return (await image.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
      });
      await openRow(tester, l.editProfile);
      await tester.tap(find.widgetWithText(LinkButton, l.changePhoto));
      await tester.pumpAndSettle();
      expect(find.text(l.takePhoto), findsOneWidget);
      expect(find.text(l.removePhoto), findsNothing);
      await tester.tap(find.text(l.chooseFromGallery));
      await tester.pumpAndSettle();
      expect(find.byType(CropPage), findsOneWidget);
      // Decoding and cutting the picture happen off the test clock.
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(PrimaryButton, l.done));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pumpAndSettle();

      expect(app.more.uploads.length, 1);
      final saved = await tester.runAsync(() async {
        final frame = await (await ui.instantiateImageCodec(app.more.uploads.single)).getNextFrame();
        return (frame.image.width, frame.image.height);
      });
      expect(saved, (AppSizes.avatarPixels, AppSizes.avatarPixels));
      expect(app.auth.profile!.avatarPath, 'p-student/photo.png');
      expect(find.byType(EditProfilePage), findsOneWidget);

      // Once the "Photo saved" message has gone, the photo can be removed.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(LinkButton, l.changePhoto));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l.removePhoto));
      await tester.pumpAndSettle();
      expect(app.more.removed, ['p-student/photo.png']);
      expect(app.auth.profile!.avatarPath, isNull);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('backing out of the picker changes nothing', (tester) async {
      final app = await openMore(tester);
      await openRow(tester, l.editProfile);
      await tester.tap(find.widgetWithText(LinkButton, l.changePhoto));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l.takePhoto));
      await tester.pumpAndSettle();
      expect(find.byType(CropPage), findsNothing);
      expect(app.more.uploads, isEmpty);
    });

    test('the crop is the square that shows, in the picture\'s own pixels', () {
      // A 4000×2000 picture covering a 300-point square: 2000 px fill 300 pt.
      const image = Size(4000, 2000);
      expect(cropRect(image: image, side: 300, scale: 1, translation: Offset.zero), const Rect.fromLTWH(0, 0, 2000, 2000));
      // Dragged 150 points to the left: the middle of the picture.
      expect(cropRect(image: image, side: 300, scale: 1, translation: const Offset(-150, 0)), const Rect.fromLTWH(1000, 0, 2000, 2000));
      // Zoomed in twice: half as many pixels show.
      expect(cropRect(image: image, side: 300, scale: 2, translation: const Offset(-300, -150)), const Rect.fromLTWH(1000, 500, 1000, 1000));
      // Never outside the picture.
      expect(cropRect(image: image, side: 300, scale: 1, translation: const Offset(-10000, 50)), const Rect.fromLTWH(2000, 0, 2000, 2000));
      // A tall picture: the width fills the square.
      expect(cropRect(image: const Size(1000, 3000), side: 250, scale: 1, translation: const Offset(0, -250)), const Rect.fromLTWH(0, 1000, 1000, 1000));
    });

    testWidgets('an app user edits the photo and phone too, without the centre\'s details', (tester) async {
      await openMore(tester, auth: appUser());
      await openRow(tester, l.editProfile);
      expect(tester.widget<ListRow>(find.widgetWithText(ListRow, l.phone)).value, '+998 93 555 12 34');
      expect(find.widgetWithText(ListRow, l.birthDate), findsNothing);
      expect(find.widgetWithText(ListRow, l.parentName), findsNothing);
    });
  });

  testWidgets('Home cards open their More pages', (tester) async {
    useScreen(tester, phone);
    final app = TestApp(auth: student());
    await app.pump(tester);
    final pages = {l.rankInGroup: LeaderboardPage, l.coins: CoinHistoryPage, l.balance: PaymentsPage, l.attendance: SchedulePage};
    for (final page in pages.entries) {
      await tester.tap(find.widgetWithText(StatCard, page.key));
      await tester.pumpAndSettle();
      expect(find.byType(page.value), findsOneWidget, reason: page.key);
      await tester.tap(find.bySemanticsLabel(l.tabHome).last);
      await tester.pumpAndSettle();
      expect(find.byType(StudentHomeView), findsOneWidget);
    }
  });
}
