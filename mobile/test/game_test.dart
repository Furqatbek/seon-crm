// The 1v1 game in the app — docs/STUDENT_APP_SPEC.md → "App behaviour → Game
// tab" and "Rules → 1v1 game". The server here is the in-memory one in
// test/support/fake_game.dart, with the rules of the real one.
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/core/game_state.dart';
import 'package:student/data/game.dart';
import 'package:student/data/home.dart';
import 'package:student/features/game/finding.dart';
import 'package:student/features/game/game_tab.dart';
import 'package:student/features/game/game_widgets.dart';
import 'package:student/features/game/match_screen.dart';
import 'package:student/push/notification_routes.dart';
import 'package:student/ui/tokens.dart';
import 'package:student/ui/widgets.dart';

import 'support/fake_game.dart';
import 'support/fakes.dart';
import 'support/game_play.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

FakeAuthRepository appUser() => FakeAuthRepository(signedIn: true, profile: appUserProfile);

/// The app on the Game tab, with a clock the test moves.
Future<(TestApp, GameClock)> open(WidgetTester tester, {FakeAuthRepository? auth, void Function(TestApp app)? before}) async {
  useScreen(tester, phone);
  final clock = GameClock();
  final app = gameApp(clock, auth: auth);
  before?.call(app);
  await app.pump(tester);
  await openGame(tester, l.tabGame);
  await settle(tester);
  return (app, clock);
}

String timerLabel(WidgetTester tester) => tester.widget<TimerRing>(find.byKey(const ValueKey('match-timer'))).label;
int ropeOf(WidgetTester tester) => tester.widget<RopeBar>(find.byType(RopeBar).last).rope;

void main() {
  group('the rope', () {
    for (var rope = -5; rope <= 5; rope++) {
      testWidgets(
        'at $rope: the knot is ${rope.abs()} step(s) ${rope > 0
            ? "towards the player"
            : rope < 0
            ? "towards the opponent"
            : "from nowhere: dead centre"}',
        (tester) async {
          useScreen(tester, phone);
          await tester.pumpWidget(
            themed(
              Center(
                child: SizedBox(
                  width: 320,
                  child: RopeBar(rope: rope, yourLabel: 'Aziza', opponentLabel: 'Jasur'),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final bar = tester.getRect(find.byType(RopeBar));
          final knot = tester.getRect(find.byKey(const ValueKey('rope-knot')));
          // Eleven places along the bar, the knot's own width kept inside it: the player's end is on the left.
          final track = bar.width - knot.width;
          final expected = bar.left + knot.width / 2 + track * (5 - rope) / 10;
          expect(knot.center.dx, closeTo(expected, 0.01));
          expect(RopeBar.fractionOf(rope), (5 - rope) / 10);
          if (rope == 5) expect(knot.left, closeTo(bar.left, 0.01));
          if (rope == -5) expect(knot.right, closeTo(bar.right, 0.01));
          if (rope == 0) expect(knot.center.dx, closeTo(bar.center.dx, 0.01));
          // Violet while the player is ahead or level, cyan when the opponent is.
          final border =
              (tester.widget<DecoratedBox>(find.descendant(of: find.byKey(const ValueKey('rope-knot')), matching: find.byType(DecoratedBox))).decoration
                          as BoxDecoration)
                      .border!
                  as Border;
          expect(border.top.color, rope >= 0 ? AppColors.light.primaryFill : AppColors.light.accent);
          expect(find.bySemanticsLabel(l.gameRopeLabel(rope)), findsOneWidget);
        },
      );
    }

    testWidgets('never leaves the bar, and slides from one place to the next', (tester) async {
      useScreen(tester, phone);
      Widget bar(int rope) => themed(
        Center(
          child: SizedBox(width: 320, child: RopeBar(rope: rope)),
        ),
      );
      expect(RopeBar.fractionOf(9), 0);
      expect(RopeBar.fractionOf(-9), 1);
      await tester.pumpWidget(bar(0));
      await tester.pumpAndSettle();
      final from = tester.getRect(find.byKey(const ValueKey('rope-knot'))).center.dx;
      await tester.pumpWidget(bar(1));
      await tester.pump(const Duration(milliseconds: 120));
      final midway = tester.getRect(find.byKey(const ValueKey('rope-knot'))).center.dx;
      await tester.pumpAndSettle();
      final to = tester.getRect(find.byKey(const ValueKey('rope-knot'))).center.dx;
      expect(to, lessThan(from));
      expect(midway, allOf(lessThan(from), greaterThan(to)));
    });
  });

  group('the timer and the server\'s clock', () {
    test('a phone whose clock is wrong still counts the server\'s seconds', () {
      // The phone is 7 minutes fast.
      var phoneNow = DateTime.utc(2026, 11, 26, 10, 7);
      final clock = ServerClock(() => phoneNow);
      final serverNow = DateTime.utc(2026, 11, 26, 10);
      clock.sync(serverNow);
      expect(clock.offset, const Duration(minutes: -7));
      final deadline = serverNow.add(const Duration(seconds: 10));
      expect(clock.until(deadline), const Duration(seconds: 10));
      phoneNow = phoneNow.add(const Duration(seconds: 4));
      expect(clock.until(deadline), const Duration(seconds: 6));
      phoneNow = phoneNow.add(const Duration(seconds: 60));
      expect(clock.until(deadline), Duration.zero);
    });

    test('drift is corrected by every answer from the server', () {
      var phoneNow = DateTime.utc(2026, 11, 26, 10);
      final clock = ServerClock(() => phoneNow);
      clock.sync(DateTime.utc(2026, 11, 26, 10));
      // The phone's clock runs slow: after a real 20 seconds it has counted 17.
      phoneNow = phoneNow.add(const Duration(seconds: 17));
      expect(clock.now(), DateTime.utc(2026, 11, 26, 10, 0, 17));
      clock.sync(DateTime.utc(2026, 11, 26, 10, 0, 20));
      expect(clock.now(), DateTime.utc(2026, 11, 26, 10, 0, 20));
      expect(clock.offset, const Duration(seconds: 3));
      // The person changes the phone's clock in the middle of a match.
      phoneNow = phoneNow.add(const Duration(hours: 2));
      clock.sync(DateTime.utc(2026, 11, 26, 10, 0, 25));
      expect(clock.now(), DateTime.utc(2026, 11, 26, 10, 0, 25));
    });

    test('the answer is taken to be written halfway through a slow round trip', () {
      var phoneNow = DateTime.utc(2026, 11, 26, 10);
      final clock = ServerClock(() => phoneNow);
      final sentAt = phoneNow;
      // 800 ms there and back; the server wrote its time in the middle.
      phoneNow = phoneNow.add(const Duration(milliseconds: 800));
      clock.sync(sentAt.add(const Duration(milliseconds: 400)), sentAt: sentAt);
      expect(clock.offset, Duration.zero);
    });

    testWidgets('in a match: the ring shows the server\'s seconds on a phone that is minutes off, and a jump of the phone\'s clock is put right', (
      tester,
    ) async {
      useScreen(tester, phone);
      final server = GameClock();
      var skew = const Duration(minutes: 7, seconds: 13);
      final app = TestApp(auth: FakeAuthRepository(signedIn: true, profile: studentProfile))..clock = () => server.t.add(skew);
      app.game.now = server.call;
      await app.pump(tester);
      await openGame(tester, l.tabGame);
      await settle(tester);
      final other = opponent(app);
      await startMatch(tester, app, server, other, l.gamePlayNow);

      expect(timerLabel(tester), '10');
      await server.pass(tester, const Duration(seconds: 3));
      expect(timerLabel(tester), '7');
      // The phone's clock jumps back half a minute. The next heartbeat corrects the ring.
      skew -= const Duration(seconds: 30);
      await server.pass(tester, const Duration(milliseconds: 200));
      // Until the server is heard from again the phone has only its own, wrong, clock.
      expect(timerLabel(tester), '10');
      // A heartbeat goes out every 5 seconds: by then the ring is right again.
      await server.pass(tester, const Duration(milliseconds: 4800));
      expect(timerLabel(tester), '2');
      await server.pass(tester, const Duration(seconds: 1));
      expect(timerLabel(tester), '1');
    });
  });

  group('the lobby', () {
    testWidgets('a student: Play now, Challenge a classmate, rewarded wins and the last matches', (tester) async {
      final (app, _) = await open(
        tester,
        before: (app) {
          app.game.players[studentProfile.id]!.rewardedWinsToday = 3;
          app.game.recent[studentProfile.id] = [
            RecentMatch(id: 'r-1', finishedAt: DateTime.utc(2026, 11, 26, 10, 20), outcome: MatchOutcome.win, coins: 5, opponent: 'Jasur T.'),
            RecentMatch(id: 'r-2', finishedAt: DateTime.utc(2026, 11, 25, 14, 40), outcome: MatchOutcome.loss, coins: 0, opponent: 'Madina R.'),
            RecentMatch(id: 'r-3', finishedAt: DateTime.utc(2026, 11, 22, 9), outcome: MatchOutcome.draw, coins: 0, computer: true),
          ];
        },
      );
      expect(find.byType(GameTab), findsOneWidget);
      expect(find.text(l.gameZone), findsOneWidget);
      expect(find.text(l.gamePitch('+5 tanga')), findsOneWidget);
      expect(find.widgetWithText(PrimaryButton, l.gamePlayNow), findsOneWidget);
      expect(find.widgetWithText(SecondaryButton, l.gameChallenge), findsOneWidget);
      expect(find.text(l.gameRewardedWins(3, 5)), findsOneWidget);
      expect(find.byType(RecentMatchTile), findsNWidgets(3));
      expect(find.text('Bugun, 15:20'), findsOneWidget);
      expect(find.text('Kecha, 19:40'), findsOneWidget);
      expect(find.text(keepTogether('22-noyabr')), findsOneWidget);
      expect(find.text(l.gameWin), findsOneWidget);
      expect(find.text(l.gameLoss), findsOneWidget);
      expect(find.text(l.gameDraw), findsOneWidget);
      expect(find.text(l.gameComputer), findsOneWidget);
      expect(find.text('+5 tanga'), findsOneWidget);
      expect(app.gameRepository.calls, contains('lobby'));
    });

    testWidgets('an App user: Play now only, and no coins until they join the centre', (tester) async {
      await open(tester, auth: appUser());
      expect(find.widgetWithText(PrimaryButton, l.gamePlayNow), findsOneWidget);
      expect(find.text(l.gameNoCoinsAppUser), findsOneWidget);
      expect(find.text(l.gameChallenge), findsNothing);
      expect(find.textContaining('5/5'), findsNothing);
      expect(find.text(l.gamePitchNoCoins), findsOneWidget);
    });

    testWidgets('a bank without enough questions cannot be played yet', (tester) async {
      final (app, _) = await open(tester, before: (app) => app.game.randomOpen = false);
      expect(find.text(l.gameBankNotReady), findsOneWidget);
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      expect(find.byType(FindingScreen), findsNothing);
      expect(app.gameRepository.calls, isNot(contains('joinQueue')));
    });

    testWidgets('the other side of the tab is mock exams, which are not here yet', (tester) async {
      await open(tester);
      await tester.tap(find.text(l.gameExams));
      await settle(tester);
      expect(find.text(l.gameExamsSoon), findsOneWidget);
      expect(find.text(l.gamePlayNow), findsNothing);
      await tester.tap(find.text(l.gameDuel));
      await settle(tester);
      expect(find.text(l.gamePlayNow), findsOneWidget);
    });

    testWidgets('without a connection it says so and tries again', (tester) async {
      final (app, _) = await open(tester, before: (app) => app.game.failure = const OfflineException());
      expect(find.text(l.errorNetwork), findsOneWidget);
      app.game.failure = null;
      await tester.tap(find.widgetWithText(SecondaryButton, l.retry));
      await settle(tester);
      expect(find.text(l.gamePlayNow), findsOneWidget);
    });

    test('a tapped push about a challenge opens the Game tab', () {
      expect(routeForNotification({'type': 'game_invite'}), Routes.game);
      expect(routeForNotification({'type': 'game_invite', 'screen': 'game'}), Routes.game);
    });
  });

  group('Play now', () {
    testWidgets('waits for an opponent, counting; Cancel leaves the queue', (tester) async {
      final (app, clock) = await open(tester);
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      expect(find.byType(FindingScreen), findsOneWidget);
      expect(find.text(l.gameSearching), findsOneWidget);
      expect(find.text('TOPIK II'), findsOneWidget);
      await clock.pass(tester, const Duration(seconds: 12));
      expect(tester.widget<TimerRing>(find.byType(TimerRing)).label, '0:12');
      // It keeps asking, which keeps its place in the line.
      expect(app.gameRepository.calls.where((call) => call == 'joinQueue').length, greaterThanOrEqualTo(4));
      expect(app.game.lobby(studentProfile.id).queuedAt, isNotNull);

      await tester.tap(find.widgetWithText(SecondaryButton, l.cancel));
      await settle(tester);
      expect(find.byType(FindingScreen), findsNothing);
      expect(app.game.lobby(studentProfile.id).queuedAt, isNull);
    });

    testWidgets('when someone else joins, the match starts with its 3-2-1', (tester) async {
      final (app, clock) = await open(tester);
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 5));
      await opponent(app).joinQueue(null);
      await settle(tester);
      expect(find.byType(MatchScreen), findsOneWidget);
      expect(find.byType(FindingScreen), findsNothing);
      expect(find.text(l.gameGetReady), findsOneWidget);
      expect(find.text('Jasur T.'), findsOneWidget);
      expect(find.text('Aziza K.'), findsOneWidget);
      final shown = <String>[];
      for (var i = 0; i < 3; i++) {
        shown.add(tester.widget<Text>(find.byKey(const ValueKey('match-countdown'))).data!);
        await clock.pass(tester, const Duration(seconds: 1));
      }
      expect(shown, ['3', '2', '1']);
      await clock.pass(tester, const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('match-countdown')), findsNothing);
      expect(find.text(app.game.questions.first.text), findsOneWidget);
      expect(find.byType(ChoiceTile), findsNWidgets(4));
    });

    testWidgets('after 30 seconds practice against the computer is offered; Keep waiting waits 30 more', (tester) async {
      final (app, clock) = await open(tester);
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      final queuedAt = app.game.lobby(studentProfile.id).queuedAt;
      await clock.pass(tester, const Duration(seconds: 28));
      expect(find.text(l.gamePractice), findsNothing);
      await clock.pass(tester, const Duration(seconds: 2));
      expect(find.text(l.gameNobodyFree), findsOneWidget);
      expect(find.text(l.gamePracticeNoCoins), findsOneWidget);

      await tester.tap(find.text(l.gameWaitMore));
      await settle(tester);
      expect(find.text(l.gameSearching), findsOneWidget);
      // Still in the line, where it was.
      expect(app.game.lobby(studentProfile.id).queuedAt, queuedAt);
      await clock.pass(tester, const Duration(seconds: 31));
      expect(find.text(l.gameNobodyFree), findsOneWidget);

      await tester.tap(find.widgetWithText(PrimaryButton, l.gamePractice));
      await settle(tester);
      expect(find.byType(MatchScreen), findsOneWidget);
      expect(find.text(l.gameComputer), findsWidgets);
    });
  });

  group('challenges', () {
    testWidgets('a student challenges a classmate, waits with the seconds, and the match starts when they accept', (tester) async {
      final (app, clock) = await open(tester);
      await tester.tap(find.text(l.gameChallenge));
      await settle(tester);
      expect(find.byType(ClassmatesScreen), findsOneWidget);
      // Classmates with the app; not the App user, not oneself.
      expect(find.text('Jasur T.'), findsOneWidget);
      expect(find.text('Madina R.'), findsOneWidget);
      expect(find.text('Otabek S.'), findsOneWidget);
      expect(find.text('Sardor M.'), findsNothing);
      // The search narrows the list.
      await tester.enterText(find.byType(TextField), 'mad');
      await settle(tester);
      expect(find.text('Jasur T.'), findsNothing);
      await tester.tap(find.widgetWithText(Pill, l.gameInvite));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 12));
      expect(find.textContaining('0:4', findRichText: true), findsOneWidget);

      final madina = opponent(app, 'p-madina');
      final invite = (await madina.lobby(null)).invites.single;
      expect(invite.from, 'Aziza K.');
      await madina.answerInvite(invite.id, accept: true);
      await clock.pass(tester, const Duration(seconds: 1));
      expect(find.byType(MatchScreen), findsOneWidget);
      expect(find.text('Madina R.'), findsOneWidget);
    });

    testWidgets('a declined challenge, and one nobody answered in 60 seconds, say so and can be sent again', (tester) async {
      final (app, clock) = await open(tester);
      await tester.tap(find.text(l.gameChallenge));
      await settle(tester);
      await tester.tap(find.widgetWithText(Pill, l.gameInvite).first);
      await settle(tester);
      final jasur = opponent(app);
      await jasur.answerInvite((await jasur.lobby(null)).invites.single.id, accept: false);
      await clock.pass(tester, const Duration(seconds: 1));
      expect(find.text(l.gameInviteDeclined('Jasur T.')), findsOneWidget);
      expect(find.text(l.gameInviteWaiting, findRichText: true), findsNothing);
      await clock.pass(tester, const Duration(seconds: 5));

      await tester.tap(find.widgetWithText(Pill, l.gameInvite).first);
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 61));
      expect(find.text(l.gameInviteExpired('Jasur T.')), findsOneWidget);
      expect(find.byType(MatchScreen), findsNothing);
    });

    testWidgets('an incoming challenge shows a card over any tab; Accept starts the match', (tester) async {
      final (app, clock) = await open(tester);
      await tester.tap(find.bySemanticsLabel(l.tabHome).last);
      await settle(tester);
      await opponent(app).sendInvite(studentProfile.id, 'g-1');
      await settle(tester);
      expect(find.byType(InviteCard), findsOneWidget);
      expect(find.text(l.gameInvitedYou('Jasur T.')), findsOneWidget);
      await clock.pass(tester, const Duration(seconds: 18));
      expect(tester.widget<TimerRing>(find.byType(TimerRing)).label, '0:42');
      await tester.tap(find.widgetWithText(PrimaryButton, l.gameAccept));
      await settle(tester);
      expect(find.byType(InviteCard), findsNothing);
      expect(find.byType(MatchScreen), findsOneWidget);
      expect(find.text('Jasur T.'), findsOneWidget);
    });

    testWidgets('Decline closes the card and tells the challenger; an unanswered card closes itself after 60 seconds', (tester) async {
      final (app, clock) = await open(tester);
      final jasur = opponent(app);
      final first = await jasur.sendInvite(studentProfile.id, 'g-1');
      await settle(tester);
      await tester.tap(find.widgetWithText(SecondaryButton, l.gameDecline));
      await settle(tester);
      expect(find.byType(InviteCard), findsNothing);
      expect((await jasur.inviteState(first))?.status, InviteStatus.declined);

      final second = await opponent(app, 'p-madina').sendInvite(studentProfile.id, 'g-1');
      await settle(tester);
      expect(find.text(l.gameInvitedYou('Madina R.')), findsOneWidget);
      await clock.pass(tester, const Duration(seconds: 61));
      expect(find.byType(InviteCard), findsNothing);
      expect((await jasur.inviteState(second))?.status, InviteStatus.expired);
      expect(find.byType(MatchScreen), findsNothing);
    });

    testWidgets('an App user is never shown a challenge', (tester) async {
      final (app, _) = await open(tester, auth: appUser());
      expect(app.gameRepository.calls.where((call) => call == 'lobby').length, lessThanOrEqualTo(2));
      expect(find.byType(InviteCard), findsNothing);
    });
  });

  group('the match', () {
    testWidgets('answers, the rope and the notes follow the server, question by question', (tester) async {
      final (app, clock) = await open(tester);
      final other = opponent(app);
      final matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
      final first = app.game.questions[0];
      expect(find.bySemanticsLabel(l.gameQuestionOf(1, 10)), findsOneWidget);
      expect(ropeOf(tester), 0);

      // The opponent answers first: the app says they have, not what.
      await clock.pass(tester, const Duration(seconds: 2));
      await other.submit(matchId, 0, 'b');
      await settle(tester);
      expect(find.text(l.gameOpponentAnswered), findsOneWidget);
      // The player taps the right answer: told at once, the choice turns green, and the rope moves a step their way.
      await tester.tap(find.widgetWithText(ChoiceTile, first.choices.first.text));
      await settle(tester);
      expect(find.text(l.gameCorrect), findsOneWidget);
      expect(ropeOf(tester), 1);
      expect(app.feedback.events, ['tap', 'right']);
      // The same question stays, settled, until the next is shown; it cannot be answered again.
      expect(find.text(first.text), findsOneWidget);
      await tester.tap(find.widgetWithText(ChoiceTile, first.choices.last.text), warnIfMissed: false);
      await settle(tester);
      expect(app.gameRepository.calls.where((call) => call == 'submit'), hasLength(1));

      await clock.pass(tester, const Duration(milliseconds: 2400));
      expect(find.text(app.game.questions[1].text), findsOneWidget);
      expect(timerLabel(tester), anyOf('10', '9'));

      // A wrong answer while the opponent is right: the rope goes back.
      await playQuestion(tester, app, clock, other, matchId, mine: Move.wrong, theirs: Move.right);
      expect(ropeOf(tester), 0);
      expect(app.feedback.events.last, 'wrong');
      // Both right, the opponent faster: one step their way.
      await playQuestion(
        tester,
        app,
        clock,
        other,
        matchId,
        mine: Move.right,
        theirs: Move.right,
        mineAfter: const Duration(seconds: 5),
        theirsAfter: const Duration(seconds: 1),
      );
      expect(ropeOf(tester), -1);
      // Nobody answers: the ten seconds run out and the app moves on by itself.
      await playQuestion(tester, app, clock, other, matchId, mine: Move.none, theirs: Move.none);
      expect(ropeOf(tester), -1);
      expect(find.text(app.game.questions[4].text), findsOneWidget);
    });

    testWidgets('says who was faster when both were right, and that time is up when the player did not answer', (tester) async {
      final (app, clock) = await open(tester);
      final other = opponent(app);
      final matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
      await clock.pass(tester, const Duration(seconds: 1));
      await tester.tap(find.widgetWithText(ChoiceTile, app.game.questions[0].choices.first.text));
      await settle(tester);
      expect(find.text(l.gameCorrect), findsOneWidget);
      await clock.pass(tester, const Duration(seconds: 2));
      await other.submit(matchId, 0, 'a');
      await settle(tester);
      expect(find.text(l.gameCorrectFaster), findsOneWidget);
      await clock.pass(tester, const Duration(milliseconds: 2400));

      await clock.pass(tester, const Duration(seconds: 1));
      await other.submit(matchId, 1, 'b');
      await clock.pass(tester, const Duration(seconds: 9, milliseconds: 500));
      expect(find.text(l.gameTimeUp), findsOneWidget);
      expect(ropeOf(tester), 0);
    });

    testWidgets('a heartbeat goes out every 5 seconds', (tester) async {
      final (app, clock) = await open(tester);
      await startMatch(tester, app, clock, opponent(app), l.gamePlayNow);
      final before = app.gameRepository.calls.where((call) => call == 'heartbeat').length;
      await clock.pass(tester, const Duration(seconds: 5));
      await clock.pass(tester, const Duration(seconds: 5));
      expect(app.gameRepository.calls.where((call) => call == 'heartbeat').length, before + 2);
    });

    testWidgets('with the connection lost it says so and keeps trying; back online the server\'s state is the truth again', (tester) async {
      final (app, clock) = await open(tester);
      final other = opponent(app);
      final matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
      app.game.failure = const OfflineException();
      await clock.pass(tester, const Duration(seconds: 6));
      expect(find.text(l.gameReconnecting), findsOneWidget);
      // A tap that cannot be sent is not taken as an answer.
      await tester.tap(find.widgetWithText(ChoiceTile, app.game.questions[0].choices.first.text));
      await settle(tester);
      expect(find.text(l.gameCorrect), findsNothing);

      // Meanwhile the opponent keeps playing: question 1 runs out, they answer question 2.
      app.game.failure = null;
      await other.heartbeat(matchId);
      app.game.failure = const OfflineException();
      await clock.pass(tester, const Duration(seconds: 7));
      app.game.failure = null;
      await other.advance(matchId);
      // Back online with the next heartbeat.
      await clock.pass(tester, const Duration(seconds: 5));
      expect(find.text(l.gameReconnecting), findsNothing);
      expect(find.text(app.game.questions[1].text), findsOneWidget);
    });

    testWidgets('Back does nothing during a match', (tester) async {
      final (app, clock) = await open(tester);
      await startMatch(tester, app, clock, opponent(app), l.gamePlayNow);
      await tester.binding.handlePopRoute();
      await settle(tester);
      expect(find.byType(MatchScreen), findsOneWidget);
      expect(find.bySemanticsLabel(l.back), findsNothing);
    });

    testWidgets('an opponent who stops answering the server for 20 seconds forfeits: the player wins', (tester) async {
      final (app, clock) = await open(tester);
      await startMatch(tester, app, clock, opponent(app), l.gamePlayNow);
      await clock.pass(tester, const Duration(seconds: 26));
      expect(find.text(l.gameWinTitle), findsOneWidget);
      expect(find.text(l.gameForfeitWin), findsOneWidget);
      expect(app.feedback.events.last, 'won');
    });

    testWidgets('a match that is not the player\'s says so', (tester) async {
      final (app, clock) = await open(tester);
      final jasur = opponent(app);
      await jasur.joinQueue(null);
      final theirs = (await opponent(app, 'p-madina').joinQueue(null)).matchId!;
      GoRouter.of(tester.element(find.byType(GameTab))).push(Routes.match(theirs));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 1));
      expect(find.text(l.gameMatchGone), findsOneWidget);
    });
  });

  group('the result', () {
    Future<void> win(WidgetTester tester, TestApp app, GameClock clock, FakeGameRepository other) async {
      final matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
      for (var i = 0; i < 5; i++) {
        await playQuestion(tester, app, clock, other, matchId, mine: Move.right, theirs: Move.wrong);
      }
    }

    testWidgets('a win between two students: the winner, the answers, +5 coins and the rewarded wins', (tester) async {
      final (app, clock) = await open(tester, before: (app) => app.game.players[studentProfile.id]!.rewardedWinsToday = 3);
      await win(tester, app, clock, opponent(app));
      expect(find.byType(MatchResultView), findsOneWidget);
      expect(find.text(l.gameWinTitle), findsOneWidget);
      expect(find.text(l.gameCorrectAnswers(5, 0)), findsOneWidget);
      expect(find.widgetWithText(Pill, '+5 tanga'), findsOneWidget);
      expect(find.text(l.gameRewardedWins(4, 5)), findsOneWidget);
      expect(app.feedback.events.last, 'won');

      // The questions, with the right answer of each.
      await tester.tap(find.widgetWithText(SecondaryButton, l.gameSeeQuestions));
      await settle(tester);
      expect(find.byType(MatchReviewScreen), findsOneWidget);
      expect(find.text(app.game.questions[0].text), findsOneWidget);
      expect(find.text('${l.gameRightAnswer} 입니다', findRichText: true), findsOneWidget);
      expect(find.text(app.game.questions[5].text), findsNothing);
      await tester.tap(find.bySemanticsLabel(l.back));
      await settle(tester);

      // Play again looks for the next opponent.
      await tester.tap(find.widgetWithText(PrimaryButton, l.gamePlayAgain));
      await settle(tester);
      expect(find.byType(FindingScreen), findsOneWidget);
    });

    testWidgets('a win past the daily limit says why no coins were given', (tester) async {
      final (app, clock) = await open(tester, before: (app) => app.game.players[studentProfile.id]!.rewardedWinsToday = 5);
      await win(tester, app, clock, opponent(app));
      expect(find.text(l.gameWinTitle), findsOneWidget);
      expect(find.widgetWithText(Pill, l.gameLimitReached), findsOneWidget);
      expect(find.textContaining('+5'), findsNothing);
      expect(find.text(l.gameRewardedWins(5, 5)), findsOneWidget);
    });

    testWidgets('a student who beats an App user is told the opponent is not the centre\'s student', (tester) async {
      final (app, clock) = await open(tester);
      await win(tester, app, clock, opponent(app, 'p-guest'));
      expect(find.text(l.gameWinTitle), findsOneWidget);
      expect(find.widgetWithText(Pill, l.gameOpponentNotStudent), findsOneWidget);
      expect(find.textContaining('+5'), findsNothing);
    });

    testWidgets('an App user sees "no coins until you join the centre" on every result', (tester) async {
      final (app, clock) = await open(tester, auth: appUser());
      await win(tester, app, clock, opponent(app, 'p-guest'));
      expect(find.text(l.gameWinTitle), findsOneWidget);
      expect(find.widgetWithText(Pill, l.gameNoCoinsAppUser), findsOneWidget);
      expect(find.textContaining('5/5'), findsNothing);
    });

    testWidgets('a loss and a draw are named, without coins', (tester) async {
      final (app, clock) = await open(tester);
      final other = opponent(app);
      var matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
      for (var i = 0; i < 5; i++) {
        await playQuestion(tester, app, clock, other, matchId, mine: Move.wrong, theirs: Move.right);
      }
      expect(find.text(l.gameLossTitle), findsOneWidget);
      expect(find.byType(Pill), findsNothing);
      expect(app.feedback.events.last, 'finished');

      // Again: ten questions nobody answers end level.
      await other.joinQueue(null);
      await tester.tap(find.widgetWithText(PrimaryButton, l.gamePlayAgain));
      await settle(tester);
      matchId = (await other.lobby(null)).activeMatchId!;
      await clock.pass(tester, const Duration(milliseconds: 2700));
      for (var i = 0; i < 10; i++) {
        await other.heartbeat(matchId);
        await playQuestion(tester, app, clock, other, matchId, mine: Move.none, theirs: Move.none);
      }
      expect(find.text(l.gameDrawTitle), findsOneWidget);
      expect(find.text(l.gameCorrectAnswers(0, 0)), findsOneWidget);
    });

    testWidgets('practice against the computer never pays, and says so', (tester) async {
      final (app, clock) = await open(tester);
      app.game.computer = (index, question) => (option: 'd', ms: 4000);
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 31));
      await tester.tap(find.widgetWithText(PrimaryButton, l.gamePractice));
      await settle(tester);
      await clock.pass(tester, const Duration(milliseconds: 2700));
      // The player answers every question right, one second in; the computer answers three seconds later.
      for (var i = 0; i < 10 && find.byType(MatchResultView).evaluate().isEmpty; i++) {
        final question = app.game.questions.firstWhere((question) => find.text(question.text).evaluate().isNotEmpty);
        await clock.pass(tester, const Duration(seconds: 1));
        await tester.tap(find.widgetWithText(ChoiceTile, question.choices.firstWhere((choice) => choice.id == question.correct).text));
        await tester.pump();
        await clock.pass(tester, const Duration(milliseconds: 5800));
      }
      expect(find.byType(MatchResultView), findsOneWidget);
      expect(find.widgetWithText(Pill, l.gamePracticeNoCoins), findsOneWidget);
      expect(find.textContaining('+5'), findsNothing);
    });
  });
}
