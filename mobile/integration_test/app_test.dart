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
//
// The match test plays on the dev project too when a second account, an App
// user, is given as well. The first must be a linked student whose only group
// is a TOPIK I group, so both are in the same bank (see "Rules → 1v1 game"),
// and that bank needs its 30 active questions:
//
//     --dart-define=TEST_PHONE_2=+998770000002 --dart-define=TEST_PASSWORD_2=...
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:student/app.dart';
import 'package:student/core/checkin_state.dart';
import 'package:student/core/exam_state.dart';
import 'package:student/core/game_state.dart';
import 'package:student/core/home_state.dart';
import 'package:student/core/more_state.dart';
import 'package:student/core/shop_state.dart';
import 'package:student/core/state.dart';
import 'package:student/data/auth_repository.dart';
import 'package:student/data/checkin.dart';
import 'package:student/data/device_tokens.dart';
import 'package:student/data/exams.dart';
import 'package:student/data/game.dart';
import 'package:student/data/home.dart';
import 'package:student/data/models.dart';
import 'package:student/data/more.dart';
import 'package:student/data/notifications.dart';
import 'package:student/data/shop.dart';
import 'package:student/env.dart';
import 'package:student/features/auth/sign_in_screens.dart';
import 'package:student/features/auth/welcome_screen.dart';
import 'package:student/features/exams/exam_screen.dart';
import 'package:student/features/exams/exams_side.dart';
import 'package:student/features/game/finding.dart';
import 'package:student/features/game/match_screen.dart';
import 'package:student/features/home/student_home.dart';
import 'package:student/features/more/more_tab.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/features/shop/orders_page.dart';
import 'package:student/features/shop/product_page.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../test/support/fake_exams.dart';
import '../test/support/fake_game.dart';
import '../test/support/fakes.dart';

const testPhone = String.fromEnvironment('TEST_PHONE');
const testPassword = String.fromEnvironment('TEST_PASSWORD');
const testPhone2 = String.fromEnvironment('TEST_PHONE_2');
const testPassword2 = String.fromEnvironment('TEST_PASSWORD_2');
const testExam = String.fromEnvironment('TEST_EXAM');

/// Against the dev project when it and a throwaway account are given; otherwise in memory.
bool get onDevProject => isConfigured && testPhone.isNotEmpty && testPassword.isNotEmpty;

final uz = lookupAppLocalizations(const Locale('uz'));
final ko = lookupAppLocalizations(const Locale('ko'));

/// The app on the in-memory stand-in, signed in or not.
Future<FakeAuthRepository> pumpInMemory(
  WidgetTester tester, {
  required bool signedIn,
  FakeShopRepository? shop,
  GameRepository? game,
  ExamRepository? exams,
  Profile profile = studentProfile,
  DateTime Function()? clock,
}) async {
  SharedPreferences.setMockInitialValues({});
  // The shop spends and returns the coins Home shows, as the server does.
  final home = FakeHomeRepository();
  shop ??= FakeShopRepository();
  shop
    ..balance = (() => (home.home['coins'] as num).toInt())
    ..setBalance = ((coins) => home.home = {...home.home, 'coins': coins});
  final auth = FakeAuthRepository(signedIn: signedIn, profile: profile);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(auth),
        deviceTokenRepositoryProvider.overrideWithValue(FakeDeviceTokens()),
        homeRepositoryProvider.overrideWithValue(home),
        notificationsRepositoryProvider.overrideWithValue(FakeNotificationsRepository()),
        moreRepositoryProvider.overrideWithValue(FakeMoreRepository()),
        shopRepositoryProvider.overrideWithValue(shop),
        checkinRepositoryProvider.overrideWithValue(FakeCheckinRepository()),
        gameRepositoryProvider.overrideWithValue(
          game ?? FakeGameRepository((FakeGameServer(now: DateTime.now)..add(FakePlayer(studentProfile.id, 'Aziza K.'))), studentProfile.id),
        ),
        examRepositoryProvider.overrideWithValue(exams ?? FakeExamRepository(FakeExamServer(now: DateTime.now), profile.id)),
        examAudioProvider.overrideWithValue(FakeExamAudio.new),
        qrSecretStoreProvider.overrideWithValue(FakeQrSecretStore()),
        screenLightProvider.overrideWithValue(FakeScreenLight()),
        sharedPreferencesProvider.overrideWithValue(await SharedPreferences.getInstance()),
        clockProvider.overrideWithValue(clock ?? () => testNow),
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
        shopRepositoryProvider.overrideWithValue(SupabaseShopRepository(client)),
        checkinRepositoryProvider.overrideWithValue(SupabaseCheckinRepository(client)),
        gameRepositoryProvider.overrideWithValue(SupabaseGameRepository(client)),
        examRepositoryProvider.overrideWithValue(SupabaseExamRepository(client)),
        examAudioProvider.overrideWithValue(FakeExamAudio.new),
        qrSecretStoreProvider.overrideWithValue(const SecureQrSecretStore()),
        screenLightProvider.overrideWithValue(const DeviceScreenLight()),
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

  // The centre's side is the in-memory stand-in's: it does what the CRM's
  // Requests tab does through handle_redemption(). The same steps against the
  // real database are in supabase/tests/shop.test.ts.
  testWidgets('a size M T-shirt is ordered in the app, marked ready and given by the centre, and the app follows', (tester) async {
    final shop = FakeShopRepository(orders: []);
    await pumpInMemory(tester, signedIn: true, shop: shop);

    // Shop → the T-shirt → size M → Order → Confirm.
    await tester.tap(find.bySemanticsLabel(uz.tabShop).last);
    await tester.pumpAndSettle();
    expect(find.text('128 tanga'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Brendli futbolka'), 200, scrollable: find.byType(Scrollable).last);
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -150));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Brendli futbolka'));
    await tester.pumpAndSettle();
    expect(find.byType(ProductPage), findsOneWidget);
    await tester.scrollUntilVisible(find.widgetWithText(Pill, 'M'), 200, scrollable: find.byType(Scrollable).last);
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -150));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Pill, 'M'));
    await tester.pumpAndSettle();
    expect(find.text('M: ${uz.unitsLeft(3)}'), findsOneWidget);
    await tester.tap(find.widgetWithText(PrimaryButton, uz.orderAction));
    await tester.pumpAndSettle();
    expect(find.text('28 tanga'), findsOneWidget);
    await tester.tap(find.widgetWithText(PrimaryButton, uz.confirm));
    await tester.pumpAndSettle();

    // My orders: Requested, and it can still be cancelled. The centre sees it too.
    expect(find.byType(OrdersPage), findsOneWidget);
    expect(find.text('Brendli futbolka (M)'), findsOneWidget);
    expect(find.widgetWithText(Pill, uz.orderRequested), findsOneWidget);
    expect(find.text(uz.cancel), findsOneWidget);
    final order = shop.shopOrders.single;
    expect(order.status, OrderStatus.requested);
    expect(shop.balance(), 28);

    // The centre marks it ready: the app shows the steps and where to collect it, with no Cancel.
    shop.markReady(order.id);
    await tester.pumpAndSettle();
    expect(find.byType(OrderSteps), findsOneWidget);
    expect(find.text(uz.pickupNow), findsOneWidget);
    expect(find.text(uz.cancel), findsNothing);

    // The centre hands it over: Given, with the day.
    shop.give(order.id);
    await tester.pumpAndSettle();
    expect(find.byType(OrderSteps), findsNothing);
    expect(find.text(uz.givenOn('26-noyabr')), findsOneWidget);

    // The coins stay spent, and one M fewer is left.
    await tester.pump(const Duration(seconds: 5));
    await tester.tap(find.bySemanticsLabel(uz.back));
    await tester.pumpAndSettle();
    expect(find.text('28 tanga'), findsOneWidget);
    expect(shop.shopItems.firstWhere((item) => item.id == 'r-shirt').variants.firstWhere((variant) => variant.names['uz'] == 'M').stock, 2);
  });

  // Two clients on one server: the app itself, signed in as a linked student,
  // and a second connection playing as an App user. On the dev project both
  // are real accounts and the server is the real one; without it, the server
  // is the in-memory stand-in with the same rules.
  testWidgets('a full match between a student in the app and an App user: no coins for anyone', (tester) async {
    final live = onDevProject && testPhone2.isNotEmpty && testPassword2.isNotEmpty;
    late final GameRepository guest;
    if (live) {
      await pumpOnDevProject(tester);
      await signIn(tester, testPhone, testPassword);
      final second = SupabaseClient(supabaseUrl, supabasePublishableKey);
      await second.auth.signInWithPassword(phone: testPhone2, password: testPassword2);
      guest = SupabaseGameRepository(second);
    } else {
      final server = FakeGameServer(now: DateTime.now)
        ..add(FakePlayer(studentProfile.id, 'Aziza K.', level: 'topik1'))
        ..add(FakePlayer('p-guest', 'Sardor M.', student: false, groupId: null, level: 'topik1'));
      guest = FakeGameRepository(server, 'p-guest');
      await pumpInMemory(tester, signedIn: true, game: FakeGameRepository(server, studentProfile.id), clock: DateTime.now);
    }

    // Wait, in real time, until something is on screen.
    Future<void> until(Finder finder, {Duration within = const Duration(seconds: 25)}) async {
      final deadline = DateTime.now().add(within);
      while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(finder, findsWidgets);
    }

    // The App user is already waiting; the student presses Play now and they are paired.
    expect((await guest.joinQueue(null)).queuedAt, isNotNull);
    await tester.tap(find.bySemanticsLabel(uz.tabGame).last);
    await until(find.widgetWithText(PrimaryButton, uz.gamePlayNow));
    await tester.tap(find.widgetWithText(PrimaryButton, uz.gamePlayNow));
    await until(find.byType(MatchScreen));
    // The searching screen slides away.
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.byType(FindingScreen), findsNothing);
    final matchId = (await guest.lobby(null)).activeMatchId!;

    // 3-2-1, then ten questions. Each side answers with the first choice: the
    // student in the app a moment before the App user through their own connection.
    var played = 0;
    while (find.byType(MatchResultView).evaluate().isEmpty && played < 10) {
      await until(find.byType(ChoiceTile));
      final theirs = await guest.matchState(matchId);
      if (theirs.question == null) {
        await tester.pump(const Duration(milliseconds: 200));
        continue;
      }
      final index = theirs.question!.index;
      await tester.tap(find.byType(ChoiceTile).first, warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 400));
      final answer = await guest.submit(matchId, index, theirs.question!.options.first.id);
      expect(answer.accepted || answer.reason == 'late', isTrue);
      played++;
      // The question is settled; the next is shown two seconds later.
      final next = DateTime.now().add(const Duration(seconds: 12));
      while (DateTime.now().isBefore(next) && find.byType(MatchResultView).evaluate().isEmpty) {
        await tester.pump(const Duration(milliseconds: 200));
        final state = await guest.matchState(matchId);
        if (state.over || (state.question != null && state.question!.index > index)) break;
      }
    }

    // The result, on both sides: the server's own verdict.
    await until(find.byType(MatchResultView), within: const Duration(seconds: 40));
    final end = await guest.matchState(matchId);
    expect(end.status, MatchStatus.finished);
    expect(end.coinsEligible, isFalse);
    expect(end.result!.rewarded, isFalse);
    expect(end.result!.coins, 0);
    expect(end.result!.review, isNotEmpty);
    final title = switch (end.result!.outcome) {
      // What the App user lost, the student won.
      MatchOutcome.loss => uz.gameWinTitle,
      MatchOutcome.win => uz.gameLossTitle,
      MatchOutcome.draw => uz.gameDrawTitle,
    };
    expect(find.text(title), findsOneWidget);
    // No coins for anyone in a match with an App user, and the student is told why.
    expect(find.textContaining('+'), findsNothing);
    if (end.result!.outcome == MatchOutcome.loss) expect(find.text(uz.gameOpponentNotStudent), findsOneWidget);
    if (!live) {
      // Both gave the first choice every time: right on four questions, where the student was faster.
      expect(end.result!.outcome, MatchOutcome.loss);
      expect(find.text(uz.gameCorrectAnswers(4, 4)), findsOneWidget);
    }

    // The question review.
    await tester.tap(find.widgetWithText(SecondaryButton, uz.gameSeeQuestions));
    await until(find.byType(MatchReviewScreen));
    expect(find.textContaining(uz.gameRightAnswer, findRichText: true), findsWidgets);
  });

  // A short mock exam from the list to its result, once as a student and once
  // as an App user. With the dev project and the accounts given (the first a
  // linked student, the second an App user), a published exam is named with
  //     --dart-define=TEST_EXAM="TOPIK I — Qisqa"
  // and the server is the real one; without it, the in-memory stand-in with
  // the same rules. Keep the exam short: every question is answered in real time.
  for (final student in [true, false]) {
    testWidgets('a short mock exam as ${student ? 'a student: the coins are earned' : 'an App user: the coins are locked'}', (tester) async {
      final phone = student ? testPhone : testPhone2;
      final password = student ? testPassword : testPassword2;
      final live = isConfigured && testExam.isNotEmpty && phone.isNotEmpty && password.isNotEmpty;
      final title = live ? testExam : 'TOPIK I — Qisqa';
      final profile = student ? studentProfile : appUserProfile;
      final server = FakeExamServer(now: DateTime.now)
        ..exams.add(sampleExam(id: 'short', title: title, listening: 3, reading: 2, audioMaxPlays: 1, thresholds: const {1: 2, 2: 4}))
        ..students.addAll([if (student) profile.id]);
      late final ExamRepository exams;
      late final HomeRepository home;
      if (live) {
        await pumpOnDevProject(tester);
        await signIn(tester, phone, password);
        exams = SupabaseExamRepository(Supabase.instance.client);
        home = SupabaseHomeRepository(Supabase.instance.client);
      } else {
        exams = FakeExamRepository(server, profile.id);
        await pumpInMemory(tester, signedIn: true, profile: profile, exams: exams, clock: DateTime.now);
      }

      Future<void> until(Finder finder, {Duration within = const Duration(seconds: 25)}) async {
        final deadline = DateTime.now().add(within);
        while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        expect(finder, findsWidgets);
      }

      Future<void> pause() => tester.pump(const Duration(milliseconds: 700));

      // What the server says before: whether this will be the first completed attempt, and the coins so far.
      final before = (await exams.exams()).firstWhere((exam) => exam.title == title);
      final first = before.attempts == 0;
      final coinsBefore = !live ? 0 : (student ? ((await home.studentHome(null))['coins'] as num).toInt() : (await home.appUserHome()).lockedCoins);

      await tester.tap(find.bySemanticsLabel(uz.tabGame).last);
      await until(find.text(uz.gameExams));
      await tester.tap(find.text(uz.gameExams));
      await until(find.byType(ExamsSide));
      await tester.tap(find.text(before.level == ExamLevel.topik2 ? uz.levelTopik2 : uz.levelTopik1));
      await until(find.text(title));
      // A new exam opens its intro; one in progress goes straight back in.
      await tester.tap(
        find.text(before.attempts > 0 && before.openAttemptId == null ? (before.coinsPerCorrect > 0 ? uz.examRetake : uz.examRetakePlain) : title),
      );
      await pause();
      if (find.byType(ExamIntroScreen).evaluate().isNotEmpty) {
        await tester.tap(find.byType(PrimaryButton));
      }
      await until(find.byType(ExamPlayView));
      await pause();
      // During the attempt nothing says which choice is right.
      expect(find.text(uz.examRightAnswer), findsNothing);

      // Listening, then reading: the first choice of every question, Next, and Submit section at the end.
      var taps = 0;
      while (find.byType(ExamResultView).evaluate().isEmpty && taps < 400) {
        taps++;
        final choice = find.descendant(of: find.byType(ExamChoices), matching: find.byType(GestureDetector)).first;
        await tester.ensureVisible(choice);
        await tester.tap(choice, warnIfMissed: false);
        await pause();
        if (find.widgetWithText(PrimaryButton, uz.examNext).evaluate().isNotEmpty) {
          await tester.tap(find.widgetWithText(PrimaryButton, uz.examNext));
          await pause();
          continue;
        }
        await tester.tap(find.widgetWithText(PrimaryButton, uz.examSubmitSection));
        await until(find.byType(QuestionGridSheet));
        await pause();
        await tester.tap(find.widgetWithText(PrimaryButton, uz.examSubmitSection).last);
        // The sheet slides away, and the server answers with the next section or the result.
        for (var i = 0; i < 30 && find.byType(QuestionGridSheet).evaluate().isNotEmpty; i++) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        await until(find.byType(Scaffold));
        await pause();
      }

      await until(find.byType(ExamResultView), within: const Duration(seconds: 40));
      await pause();
      final after = (await exams.exams()).firstWhere((exam) => exam.title == title);
      expect(after.attempts, before.attempts + 1);
      expect(after.openAttemptId, isNull);
      final result = (await exams.state(after.last!.attemptId)).result!;
      expect(result.correct, after.last!.correct);
      expect(find.bySemanticsLabel('${uz.examTotal}: ${result.correct}/${result.questions}'), findsOneWidget);
      expect(result.firstAttempt, first);
      expect(result.coins, first ? result.correct * before.coinsPerCorrect : 0);
      expect(result.coinsLocked, !student && result.coins > 0);

      if (result.coins > 0) {
        // A student's coins are theirs at once; an App user's are locked until they join.
        final coins = uz.coinsCount(result.coins, '${result.coins}');
        expect(find.text(student ? '+$coins' : uz.examCoinsLocked(coins)), findsOneWidget);
        expect(find.text(student ? uz.examCoinsLocked(coins) : '+$coins'), findsNothing);
      } else if (!first) {
        expect(find.text(uz.examNoCoinsRetake), findsOneWidget);
      }
      // The offer is for App users only.
      expect(find.text(uz.examOfferTitle), student ? findsNothing : findsOneWidget);
      expect(find.widgetWithText(PrimaryButton, uz.bookOpenLesson), student ? findsNothing : findsOneWidget);

      if (live) {
        final coinsAfter = student ? ((await home.studentHome(null))['coins'] as num).toInt() : (await home.appUserHome()).lockedCoins;
        expect(coinsAfter - coinsBefore, result.coins);
      } else {
        // Every first choice: none right while listening (the second is), none while reading (the third is).
        expect(result.correct, 0);
        expect(server.earned, isEmpty);
        expect(server.locked, isEmpty);
        // The same person answering right is paid: to the balance, or locked.
        final again = FakeExamServer(now: DateTime.now)
          ..exams.add(sampleExam(id: 'short', title: title, listening: 3, reading: 2))
          ..students.addAll([if (student) profile.id]);
        final attempt = again.start(profile.id, 'short');
        again
          ..answer(profile.id, attempt, 'short-l1', 'b', false)
          ..submitSection(profile.id, attempt)
          ..answer(profile.id, attempt, 'short-r1', 'c', false)
          ..submitSection(profile.id, attempt);
        expect(student ? again.earned : again.locked, {profile.id: 2});
        expect(student ? again.locked : again.earned, isEmpty);
      }

      // The review, with the right answers now shown.
      await tester.tap(find.text(uz.examReview));
      await until(find.byType(ExamReviewScreen));
      await pause();
      expect(find.textContaining(uz.examRightAnswer), findsWidgets);
    });
  }
}
