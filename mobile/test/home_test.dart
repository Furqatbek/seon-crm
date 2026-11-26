// Home for both roles and the notifications list — docs/STUDENT_APP_SPEC.md →
// "App behaviour → Home", "App behaviour → Notifications".
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/core/home_state.dart';
import 'package:student/core/time.dart';
import 'package:student/data/home.dart';
import 'package:student/features/home/app_user_home.dart';
import 'package:student/features/home/home_widgets.dart';
import 'package:student/features/home/student_home.dart';
import 'package:student/features/notifications/notifications_screen.dart';
import 'package:student/features/more/leaderboard.dart';
import 'package:student/features/more/money_pages.dart';
import 'package:student/features/more/simple_pages.dart';
import 'package:student/features/shop/orders_page.dart';
import 'package:student/features/tabs/tabs.dart';
import 'package:student/ui/tokens.dart';
import 'package:student/ui/widgets.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

FakeAuthRepository student() => FakeAuthRepository(signedIn: true, profile: studentProfile);
FakeAuthRepository appUser() => FakeAuthRepository(signedIn: true, profile: appUserProfile);

Future<TestApp> openStudentHome(WidgetTester tester, [Map<String, dynamic> changes = const {}, Map<String, Object> preferences = const {}]) async {
  useScreen(tester, phone);
  final app = TestApp(
    auth: student(),
    home: FakeHomeRepository(home: homeJson(changes)),
    preferences: preferences,
  );
  await app.pump(tester);
  return app;
}

/// The text of a StatCard's value, found by its label.
String statValue(WidgetTester tester, String label) => tester.widget<StatCard>(find.widgetWithText(StatCard, label)).value;
String? statCaption(WidgetTester tester, String label) => tester.widget<StatCard>(find.widgetWithText(StatCard, label)).caption;

void main() {
  group('Student Home', () {
    testWidgets('loads everything from one student_home() call and greets by first name', (tester) async {
      final app = await openStudentHome(tester);
      expect(app.home.asked, [null]);
      expect(find.text('Salom, Aziza'), findsOneWidget);
      expect(find.byType(HeroLessonCard), findsOneWidget);
      expect(find.byType(StatCard), findsNWidgets(4));
    });

    testWidgets('hero card: the next lesson with its day, time, room, teacher and a countdown', (tester) async {
      await openStudentHome(tester, {'next_exam': null});
      final hero = find.byType(HeroLessonCard);
      for (final text in [l.nextLesson, 'Bugun, 18:00', '204-xona · Malika Tursunova', '2 soat 15 daqiqadan soʻng']) {
        expect(
          find.descendant(of: hero, matching: find.text(text)),
          findsOneWidget,
          reason: text,
        );
      }
      expect(find.byType(ExamCard), findsNothing);
    });

    testWidgets('the countdown is live: it moves with the clock without a reload', (tester) async {
      final app = await openStudentHome(tester);
      app.now = testNow.add(const Duration(minutes: 45));
      await tester.pump(const Duration(seconds: 15));
      expect(find.text('1 soat 30 daqiqadan soʻng'), findsOneWidget);
      app.now = testNow.add(const Duration(hours: 2, minutes: 5));
      await tester.pump(const Duration(seconds: 15));
      expect(find.text('10 daqiqadan soʻng'), findsOneWidget);
      expect(app.home.asked.length, 1);
    });

    testWidgets('when the lesson has started, Home asks the server for the next one', (tester) async {
      final app = await openStudentHome(tester);
      app.home.home = homeJson({
        'next': {'id': 'l-9', 'kind': 'lesson', 'starts_at': '2026-11-28T13:00:00+00:00', 'room': '204', 'teacher': 'Malika Tursunova'},
      });
      app.now = testNow.add(const Duration(hours: 2, minutes: 16));
      await tester.pump(const Duration(seconds: 15));
      await tester.pumpAndSettle();
      expect(app.home.asked.length, 2);
      expect(find.text('Shanba, 18:00'), findsOneWidget);
    });

    testWidgets('hero card: an exam shows its title; the same exam is not shown twice', (tester) async {
      await openStudentHome(tester, {
        'next': {
          'id': 'l-2',
          'kind': 'exam',
          'exam_title': 'Mock TOPIK II',
          'starts_at': '2026-11-27T05:00:00+00:00',
          'room': '301',
          'teacher': 'Malika Tursunova',
        },
        'next_exam': null,
      });
      final hero = find.byType(HeroLessonCard);
      expect(find.descendant(of: hero, matching: find.text(l.exam)), findsOneWidget);
      expect(find.descendant(of: hero, matching: find.text('Mock TOPIK II')), findsOneWidget);
      expect(find.descendant(of: hero, matching: find.text('Ertaga, 10:00')), findsOneWidget);
      expect(find.byType(ExamCard), findsNothing);
    });

    testWidgets('an exam after the next lesson has its own card, marked Tomorrow when it is', (tester) async {
      await openStudentHome(tester);
      final exam = find.byType(ExamCard);
      expect(find.descendant(of: exam, matching: find.text('Mock TOPIK II')), findsOneWidget);
      expect(find.descendant(of: exam, matching: find.text('Ertaga, 10:00 · 301-xona')), findsOneWidget);
      expect(find.descendant(of: exam, matching: find.widgetWithText(Pill, l.tomorrow)), findsOneWidget);
    });

    testWidgets('a cancelled next lesson is skipped: the hero shows the one after it', (tester) async {
      // The server leaves a cancelled lesson out of "next" (tested in the database suite);
      // Home shows whichever lesson it is given, here Saturday's.
      await openStudentHome(tester, {
        'next': {'id': 'l-3', 'kind': 'lesson', 'starts_at': '2026-11-28T13:00:00+00:00', 'room': '204', 'teacher': 'Malika Tursunova'},
        'next_exam': null,
      });
      expect(find.text('Shanba, 18:00'), findsOneWidget);
      expect(find.text('2 kundan soʻng'), findsOneWidget);
    });

    testWidgets('nothing scheduled says so', (tester) async {
      await openStudentHome(tester, {'next': null, 'next_exam': null});
      final hero = find.byType(HeroLessonCard);
      expect(find.descendant(of: hero, matching: find.text(l.nextLesson)), findsOneWidget);
      expect(find.descendant(of: hero, matching: find.text(l.nothingScheduled)), findsOneWidget);
    });

    testWidgets('Rank and Coins', (tester) async {
      await openStudentHome(tester);
      expect(statValue(tester, l.rankInGroup), '3-oʻrin');
      expect(statCaption(tester, l.rankInGroup), '14 kishidan, shu oy');
      expect(statValue(tester, l.coins), '128 tanga');
      expect(statCaption(tester, l.coins), '+12 shu hafta');
    });

    testWidgets('no rank yet this month', (tester) async {
      await openStudentHome(tester, {'rank': null});
      expect(statValue(tester, l.rankInGroup), '—');
      expect(statCaption(tester, l.rankInGroup), l.rankNone);
    });

    testWidgets('balance: paid, with the next payment day', (tester) async {
      await openStudentHome(tester);
      final card = tester.widget<StatCard>(find.widgetWithText(StatCard, l.balance));
      expect(card.value, l.balancePaid);
      expect(card.caption, 'keyingi toʻlov 5-dekabr');
      expect(card.valueColor, AppColors.light.success);
    });

    testWidgets('balance: a debt in red, with the day it was due', (tester) async {
      await openStudentHome(tester, {
        'balance': {'amount': -600000, 'oldest_unpaid_month': '2026-11-01', 'due_day': 5},
      });
      final card = tester.widget<StatCard>(find.widgetWithText(StatCard, l.balance));
      expect(card.value, '−600 000 soʻm');
      expect(card.caption, 'qarz, muddati 5-noyabr edi');
      expect(card.valueColor, AppColors.light.danger);
    });

    testWidgets('balance: owed but not yet due is a warning with the due date', (tester) async {
      await openStudentHome(tester, {
        'today': '2026-12-02',
        'balance': {'amount': -600000, 'oldest_unpaid_month': '2026-12-01', 'due_day': 5},
      });
      final card = tester.widget<StatCard>(find.widgetWithText(StatCard, l.balance));
      expect(card.caption, '5-dekabr gacha toʻlang');
      expect(card.valueColor, AppColors.light.warning);
    });

    test('the balance reads as it does in the CRM', () {
      StudentHome home(int amount, String today, [String? oldest]) => StudentHome.fromJson(
        homeJson({
          'today': today,
          'balance': {'amount': amount, 'oldest_unpaid_month': oldest, 'due_day': 5},
        }),
      );
      expect(home(0, '2026-11-26').balanceState, BalanceState.paid);
      expect(home(150000, '2026-11-26').balanceState, BalanceState.paid);
      expect(home(-1, '2026-11-05', '2026-11-01').balanceState, BalanceState.due);
      expect(home(-1, '2026-11-06', '2026-11-01').balanceState, BalanceState.debt);
      // Still unpaid from an earlier month: a debt even before this month's due day.
      expect(home(-1, '2026-12-02', '2026-11-01').balanceState, BalanceState.debt);
      // The next payment is this month's due day until it passes, then next month's, also over a year's end.
      expect(home(0, '2026-11-03').nextPaymentDate, DateTime.utc(2026, 11, 5));
      expect(home(0, '2026-11-05').nextPaymentDate, DateTime.utc(2026, 12, 5));
      expect(home(0, '2026-12-20').nextPaymentDate, DateTime.utc(2027, 1, 5));
    });

    testWidgets('attendance this month, and "no lessons yet" before the first mark', (tester) async {
      await openStudentHome(tester);
      expect(statValue(tester, l.attendance), '92%');
      expect(statCaption(tester, l.attendance), l.thisMonth);
      await tester.pumpWidget(const SizedBox());

      await openStudentHome(tester, {
        'attendance': {'present': 0, 'late': 0, 'absent': 0, 'excused': 0, 'marked': 0, 'rate': null},
      });
      expect(statValue(tester, l.attendance), '—');
      expect(statCaption(tester, l.attendance), l.noLessonsYet);
    });

    testWidgets('a student in no group yet sees empty cards, not an error', (tester) async {
      await openStudentHome(tester, {
        'groups': <Object>[],
        'group_id': null,
        'next': null,
        'next_exam': null,
        'rank': null,
        'coins': 0,
        'coins_week': 0,
        'attendance': {'present': 0, 'late': 0, 'absent': 0, 'excused': 0, 'marked': 0, 'rate': null},
      });
      expect(tester.takeException(), isNull);
      expect(find.text(l.nothingScheduled), findsOneWidget);
      expect(statValue(tester, l.coins), '0 tanga');
      expect(find.byType(GroupSwitcher), findsNothing);
    });

    testWidgets('one group has no switcher; several have one, and the choice is remembered on the phone', (tester) async {
      await openStudentHome(tester);
      expect(find.byType(GroupSwitcher), findsNothing);
      await tester.pumpWidget(const SizedBox());

      final groups = {
        'groups': [
          {'id': 'g-1', 'name': 'TOPIK II · Kechki'},
          {'id': 'g-2', 'name': 'Matematika · Shanba'},
        ],
      };
      final app = await openStudentHome(tester, groups);
      expect(find.widgetWithText(GroupSwitcher, 'TOPIK II · Kechki'), findsOneWidget);
      await tester.tap(find.byType(GroupSwitcher));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Matematika · Shanba'));
      await tester.pumpAndSettle();
      expect(app.home.asked, [null, 'g-2']);
      expect(app.saved.getString('home_group'), 'g-2');
      expect(find.widgetWithText(GroupSwitcher, 'Matematika · Shanba'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());

      // The next launch asks for the remembered group straight away.
      final again = await openStudentHome(tester, groups, {'home_group': 'g-2'});
      expect(again.home.asked, ['g-2']);
    });

    testWidgets('pull to refresh asks the server again', (tester) async {
      final app = await openStudentHome(tester);
      app.home.home = homeJson({'coins': 133, 'coins_week': 17});
      await tester.drag(find.byType(HeroLessonCard), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(app.home.asked.length, 2);
      expect(statValue(tester, l.coins), '133 tanga');
    });

    testWidgets('a skeleton while the first answer is on its way', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student(), home: FakeHomeRepository()..hang = true);
      await tester.pumpWidget(await app.build());
      await tester.pump();
      await tester.pump();
      expect(find.byType(HomeSkeleton), findsOneWidget);
      expect(find.byType(HeroLessonCard), findsNothing);
    });

    testWidgets('offline: the banner, over what the phone remembers from last time', (tester) async {
      final app = await openStudentHome(tester);
      expect(find.byType(StatusBanner), findsNothing);
      app.home.failure = const OfflineException();
      await tester.drag(find.byType(HeroLessonCard), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(StatusBanner, l.offlineBanner), findsOneWidget);
      expect(statValue(tester, l.coins), '128 tanga');

      // Closed and opened again without a connection: last time's Home, under the banner.
      final saved = Map<String, Object>.from({for (final key in app.saved.getKeys()) key: app.saved.get(key)!});
      await tester.pumpWidget(const SizedBox());
      final offline = TestApp(auth: student(), home: FakeHomeRepository()..failure = const OfflineException(), preferences: saved);
      await offline.pump(tester);
      expect(find.widgetWithText(StatusBanner, l.offlineBanner), findsOneWidget);
      expect(find.text('Salom, Aziza'), findsOneWidget);

      // Back online, the banner goes.
      offline.home.failure = null;
      await tester.drag(find.byType(HeroLessonCard), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(find.byType(StatusBanner), findsNothing);
    });

    testWidgets('offline with nothing remembered: says so and offers Try again', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student(), home: FakeHomeRepository()..failure = const OfflineException());
      await app.pump(tester);
      expect(find.widgetWithText(StatusBanner, l.offlineBanner), findsOneWidget);
      app.home.failure = null;
      await tester.tap(find.widgetWithText(SecondaryButton, l.retry));
      await tester.pumpAndSettle();
      expect(find.byType(HeroLessonCard), findsOneWidget);
    });

    testWidgets('another person on the same phone never sees the last one\'s Home', (tester) async {
      final app = await openStudentHome(tester);
      final saved = Map<String, Object>.from({for (final key in app.saved.getKeys()) key: app.saved.get(key)!});
      await tester.pumpWidget(const SizedBox());
      final next = TestApp(auth: appUser(), home: FakeHomeRepository()..failure = const OfflineException(), preferences: saved);
      await next.pump(tester);
      expect(find.text('Salom, Aziza'), findsNothing);
      expect(find.byType(AppUserHomeView), findsOneWidget);
    });

    testWidgets('cards lead to their screens', (tester) async {
      await openStudentHome(tester);
      await tester.tap(find.widgetWithText(StatCard, l.coins));
      await tester.pumpAndSettle();
      expect(find.byType(CoinHistoryPage), findsOneWidget);
    });
  });

  group('the bell', () {
    testWidgets('shows the unread count and keeps it live', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student(), notifications: FakeNotificationsRepository(sampleNotifications()));
      await app.pump(tester);
      final bell = find.byType(BellButton);
      expect(find.descendant(of: bell, matching: find.text('3')), findsOneWidget);

      // Realtime says a new one arrived.
      app.notifications.arrive(notification('n-9', 'points_weekly', 'Bu hafta 12 ta tanga', testNow));
      await tester.pumpAndSettle();
      expect(find.descendant(of: bell, matching: find.text('4')), findsOneWidget);
      expect(tester.getSemantics(bell).value, l.unreadCount(4));
    });

    testWidgets('has no badge when everything is read, and opens the list', (tester) async {
      useScreen(tester, phone);
      await TestApp(auth: appUser()).pump(tester);
      expect(find.descendant(of: find.byType(BellButton), matching: find.byType(Text)), findsNothing);
      await tester.tap(find.byType(BellButton));
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsScreen), findsOneWidget);
      expect(find.text(l.notificationsEmpty), findsOneWidget);
    });
  });

  group('App user Home', () {
    Future<TestApp> open(WidgetTester tester, {AppUserHome home = const AppUserHome(lockedCoins: 34)}) async {
      useScreen(tester, phone);
      final app = TestApp(
        auth: appUser(),
        home: FakeHomeRepository(appUser: home),
      );
      await app.pump(tester);
      return app;
    }

    testWidgets('greeting, level, bell, the mock exam card, locked coins and the open lesson', (tester) async {
      await open(tester);
      expect(find.text('Salom, Bekzod'), findsOneWidget);
      expect(find.widgetWithText(Pill, 'TOPIK I darajasi'), findsOneWidget);
      expect(find.byType(BellButton), findsOneWidget);
      expect(find.byType(MockExamHeroCard), findsOneWidget);
      final locked = find.byType(LockedCoinsCard);
      expect(find.descendant(of: locked, matching: find.text('34 tanga')), findsOneWidget);
      expect(find.descendant(of: locked, matching: find.text(l.lockedCoinsHint)), findsOneWidget);
      expect(find.widgetWithText(PrimaryButton, l.bookOpenLesson), findsOneWidget);
    });

    testWidgets('without a voucher there is no voucher card', (tester) async {
      await open(tester);
      expect(find.byType(VoucherCard), findsNothing);
      expect(find.text(l.voucherTitle), findsNothing);
    });

    testWidgets('with a voucher: what it gives and when it runs out', (tester) async {
      await open(
        tester,
        home: AppUserHome(
          lockedCoins: 34,
          voucher: HomeVoucher(kind: 'percent', value: 20, expiresAt: DateTime.utc(2026, 12, 7, 10)),
        ),
      );
      final card = find.byType(VoucherCard);
      expect(find.descendant(of: card, matching: find.text(l.voucherTitle)), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Birinchi oyga 20% chegirma')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('7-dekabrgacha')), findsOneWidget);
    });

    test('each kind of voucher is put in words', () {
      final until = DateTime.utc(2026, 12, 7);
      expect(voucherOffer(HomeVoucher(kind: 'percent', value: 20, expiresAt: until), l), 'Birinchi oyga 20% chegirma');
      expect(voucherOffer(HomeVoucher(kind: 'fixed', value: 100000, expiresAt: until), l), 'Birinchi oyga 100 000 soʻm chegirma');
      expect(voucherOffer(HomeVoucher(kind: 'trial_week', value: 7, expiresAt: until), l), l.voucherTrialWeek);
    });

    testWidgets('no locked coins yet shows zero, and offline shows the banner', (tester) async {
      final app = await open(tester, home: const AppUserHome(lockedCoins: 0));
      expect(find.text('0 tanga'), findsOneWidget);
      app.home.failure = const OfflineException();
      await tester.drag(find.byType(LockedCoinsCard), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(StatusBanner, l.offlineBanner), findsOneWidget);
    });
  });

  group('notifications', () {
    Future<TestApp> open(WidgetTester tester, {List<dynamic>? items, FakeAuthRepository? auth}) async {
      useScreen(tester, phone);
      final app = TestApp(auth: auth ?? student(), notifications: FakeNotificationsRepository(items == null ? sampleNotifications() : [...items]));
      await app.pump(tester);
      await tester.tap(find.byType(BellButton));
      await tester.pumpAndSettle();
      return app;
    }

    testWidgets('are grouped by day: Today, Yesterday, Earlier', (tester) async {
      await open(tester);
      final headers = [l.today, l.yesterday, l.earlier].map((text) => tester.getTopLeft(find.text(text)).dy).toList();
      expect(headers, orderedEquals([...headers]..sort()));
      expect(find.byType(NotificationRow), findsNWidgets(5));
      // Today's show the time, older ones the date.
      expect(find.text('15:20'), findsOneWidget);
      expect(find.text('19:05'), findsOneWidget);
      expect(find.text('3-noyabr'), findsOneWidget);
    });

    test('within a day the unread come first, then the newest', () {
      final items = [
        notification('read-late', 'custom', 'a', DateTime.utc(2026, 11, 26, 10), read: true),
        notification('unread-early', 'custom', 'b', DateTime.utc(2026, 11, 26, 3)),
        notification('unread-late', 'custom', 'c', DateTime.utc(2026, 11, 26, 9)),
        // 23:30 in Tashkent on the 25th is yesterday there, though the 25th in UTC too.
        notification('yesterday', 'custom', 'd', DateTime.utc(2026, 11, 25, 18, 30)),
        // 00:30 in Tashkent on the 26th is today, though still the 25th in UTC.
        notification('just-after-midnight', 'custom', 'e', DateTime.utc(2026, 11, 25, 19, 30), read: true),
      ];
      final groups = groupNotifications(items, testNow);
      expect(groups.keys, [DayGroup.today, DayGroup.yesterday]);
      expect(groups[DayGroup.today]!.map((item) => item.id), ['unread-late', 'unread-early', 'read-late', 'just-after-midnight']);
      expect(groups[DayGroup.yesterday]!.map((item) => item.id), ['yesterday']);
    });

    testWidgets('unread ones are bold with a dot', (tester) async {
      await open(tester);
      FontWeight? weight(String text) => tester.widget<Text>(find.text(text)).style?.fontWeight;
      expect(weight('+5 tanga: oʻyinda gʻalaba'), FontWeight.w600);
      expect(weight('Jasur T. sizni oʻyinga chaqirdi'), FontWeight.w400);
    });

    testWidgets('opening one marks it read and leads to its screen', (tester) async {
      final app = await open(tester);
      await tester.tap(find.text('Buyurtmangiz olib ketishga tayyor: Brendli futbolka (M)'));
      await tester.pumpAndSettle();
      expect(app.notifications.markedRead, ['n-2']);
      expect(find.byType(OrdersPage), findsOneWidget);

      // Back on Home, the bell counts one fewer.
      await tester.tap(find.bySemanticsLabel(l.tabHome).last);
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byType(BellButton), matching: find.text('2')), findsOneWidget);
    });

    testWidgets('one that is already read is not marked again', (tester) async {
      final app = await open(tester);
      await tester.tap(find.text('Jasur T. sizni oʻyinga chaqirdi'));
      await tester.pumpAndSettle();
      expect(app.notifications.markedRead, isEmpty);
      expect(find.byType(GameTab), findsOneWidget);
    });

    testWidgets('Mark all as read clears the bold and hides itself', (tester) async {
      final app = await open(tester);
      await tester.tap(find.widgetWithText(LinkButton, l.markAllRead));
      await tester.pumpAndSettle();
      expect(app.notifications.markedAll, 1);
      expect(tester.widget<Text>(find.text('+5 tanga: oʻyinda gʻalaba')).style?.fontWeight, FontWeight.w400);
      expect(find.widgetWithText(LinkButton, l.markAllRead), findsNothing);
    });

    testWidgets('a new one appears while the list is open', (tester) async {
      final app = await open(tester);
      app.notifications.arrive(notification('n-9', 'points_weekly', 'Bu hafta 12 ta tanga', testNow));
      await tester.pumpAndSettle();
      expect(find.text('Bu hafta 12 ta tanga'), findsOneWidget);
    });

    testWidgets('empty says so', (tester) async {
      await open(tester, items: const []);
      expect(find.text(l.notificationsEmpty), findsOneWidget);
      expect(find.widgetWithText(LinkButton, l.markAllRead), findsNothing);
    });

    testWidgets('every type has a screen to open', (tester) async {
      final types = {
        'points_weekly': CoinHistoryPage,
        'points_deduction': CoinHistoryPage,
        'points_month_result': LeaderboardPage,
        'reward_update': OrdersPage,
        'receipt_approved': PaymentsPage,
        'receipt_rejected': PaymentsPage,
        'lesson_reminder': HomeTab,
        'payment_due': PaymentsPage,
        'payment_overdue': PaymentsPage,
        'voucher_expiring': VoucherPage,
        'open_lesson_reminder': OpenLessonsPage,
        'account_linked': HomeTab,
      };
      for (final entry in types.entries) {
        final app = await open(tester, items: [notification('n', entry.key, 'Xabar ${entry.key}', testNow)]);
        await tester.tap(find.text('Xabar ${entry.key}'));
        await tester.pumpAndSettle();
        expect(find.byType(entry.value), findsOneWidget, reason: entry.key);
        expect(find.byType(NotificationsScreen), findsNothing, reason: entry.key);
        expect(app.notifications.markedRead, ['n']);
        await tester.pumpWidget(const SizedBox());
      }
      // A game challenge names its screen in the data.
      await open(
        tester,
        items: [
          notification('n', 'custom', 'Jasur T. sizni oʻyinga chaqirdi', testNow, data: {'screen': 'game'}),
        ],
      );
      await tester.tap(find.text('Jasur T. sizni oʻyinga chaqirdi'));
      await tester.pumpAndSettle();
      expect(find.byType(GameTab), findsOneWidget);
    });
  });

  group('dates and countdowns', () {
    test('days are named next to today, in Tashkent time', () {
      DateTime at(int day, int hour) => DateTime.utc(2026, 11, day, hour);
      expect(dayAndTime(at(26, 13), testNow, l), 'Bugun, 18:00');
      expect(dayAndTime(at(27, 5), testNow, l), 'Ertaga, 10:00');
      expect(dayAndTime(at(28, 13), testNow, l), 'Shanba, 18:00');
      // 20:00 UTC is 01:00 the next day in Tashkent.
      expect(dayAndTime(at(26, 20), testNow, l), 'Ertaga, 01:00');
      expect(dayAndTime(DateTime.utc(2026, 12, 5, 5), testNow, l), '5-dekabr, 10:00');
    });

    test('dates in each language', () {
      final day = DateTime.utc(2026, 12, 5);
      expect(dayMonth(day, l10n('uz')), '5-dekabr');
      expect(dayMonth(day, l10n('ru')), '5 декабря');
      expect(dayMonth(day, l10n('en')), 'December 5');
      expect(dayMonth(day, l10n('ko')), '12월 5일');
    });

    test('countdowns', () {
      String left(Duration duration) => countdown(testNow.add(duration), testNow, l);
      expect(left(const Duration(hours: 2, minutes: 15)), '2 soat 15 daqiqadan soʻng');
      expect(left(const Duration(hours: 3)), '3 soatdan soʻng');
      expect(left(const Duration(minutes: 10)), '10 daqiqadan soʻng');
      expect(left(const Duration(seconds: 20)), '1 daqiqadan soʻng');
      expect(left(const Duration(days: 3)), '3 kundan soʻng');
      expect(left(Duration.zero), l.startingNow);
      expect(left(const Duration(minutes: -5)), l.startingNow);
    });
  });

  testWidgets('providers are scoped to the app', (tester) async {
    await openStudentHome(tester);
    final container = ProviderScope.containerOf(tester.element(find.byType(StudentApp)));
    expect(container.read(studentHomeProvider).home?.coins, 128);
  });
}
