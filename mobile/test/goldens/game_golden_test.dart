// Golden screenshots of the game: the lobby (04), looking for an opponent
// (05a–05d), the match (06a, 06b) and the result (07a–07c): light and dark,
// in uz, ru, en and ko at 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/game.dart';
import 'package:student/data/models.dart';
import 'package:student/features/game/match_screen.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/widgets.dart';

import '../support/fakes.dart';
import '../support/game_play.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

typedef Steps = Future<void> Function(WidgetTester tester, TestApp app, GameClock clock, AppLocalizations l);

/// Five questions that leave the rope two steps on the player's side.
Future<String> toQuestionSix(WidgetTester tester, TestApp app, GameClock clock, AppLocalizations l) async {
  final other = opponent(app);
  final matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
  for (final (mine, theirs) in [
    (Move.right, Move.wrong),
    (Move.wrong, Move.right),
    (Move.right, Move.right),
    (Move.wrong, Move.wrong),
    (Move.right, Move.wrong),
  ]) {
    await playQuestion(tester, app, clock, other, matchId, mine: mine, theirs: theirs);
  }
  return matchId;
}

/// A whole match the player wins seven answers to five.
Future<void> winMatch(WidgetTester tester, TestApp app, GameClock clock, AppLocalizations l) async {
  final other = opponent(app);
  final matchId = await startMatch(tester, app, clock, other, l.gamePlayNow);
  const script = [
    (Move.right, Move.wrong),
    (Move.right, Move.right),
    (Move.wrong, Move.right),
    (Move.right, Move.wrong),
    (Move.right, Move.right),
    (Move.wrong, Move.right),
    (Move.right, Move.wrong),
    (Move.right, Move.wrong),
    (Move.wrong, Move.right),
    (Move.right, Move.wrong),
  ];
  for (final (mine, theirs) in script) {
    await playQuestion(tester, app, clock, other, matchId, mine: mine, theirs: theirs);
  }
}

final scenes = <String, ({bool student, Steps steps})>{
  '04_game_lobby': (student: true, steps: (_, _, _, _) async {}),
  '04_game_lobby_app_user': (student: false, steps: (_, _, _, _) async {}),
  '05a_searching': (
    student: true,
    steps: (tester, app, clock, l) async {
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 12));
    },
  ),
  '05b_nobody_free': (
    student: true,
    steps: (tester, app, clock, l) async {
      await tester.tap(find.text(l.gamePlayNow));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 31));
    },
  ),
  '05c_challenge_classmate': (
    student: true,
    steps: (tester, app, clock, l) async {
      await tester.tap(find.text(l.gameChallenge));
      await settle(tester);
      await tester.tap(find.widgetWithText(Pill, l.gameInvite).at(1));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 12));
    },
  ),
  '05d_incoming_challenge': (
    student: true,
    steps: (tester, app, clock, l) async {
      await tester.tap(find.bySemanticsLabel(l.tabHome).last);
      await settle(tester);
      await opponent(app).sendInvite(app.auth.profile!.id, 'g-1');
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 18));
    },
  ),
  '06a_question_open': (
    student: true,
    steps: (tester, app, clock, l) async {
      await toQuestionSix(tester, app, clock, l);
      await clock.pass(tester, const Duration(seconds: 3));
    },
  ),
  '06b_just_answered': (
    student: true,
    steps: (tester, app, clock, l) async {
      final matchId = await toQuestionSix(tester, app, clock, l);
      // Both right, the player first: the question is settled and the rope moves.
      await clock.pass(tester, const Duration(seconds: 2));
      await tester.tap(find.widgetWithText(ChoiceTile, '에'));
      await settle(tester);
      await clock.pass(tester, const Duration(seconds: 1));
      await opponent(app).submit(matchId, 5, 'a');
      await settle(tester);
      await clock.pass(tester, const Duration(milliseconds: 600));
    },
  ),
  '07a_win': (student: true, steps: winMatch),
  '07b_review': (
    student: true,
    steps: (tester, app, clock, l) async {
      await winMatch(tester, app, clock, l);
      await tester.tap(find.widgetWithText(SecondaryButton, l.gameSeeQuestions));
      await settle(tester);
    },
  ),
  '07c_daily_limit': (
    student: true,
    steps: (tester, app, clock, l) async {
      app.game.players[app.auth.profile!.id]!.rewardedWinsToday = 5;
      await winMatch(tester, app, clock, l);
    },
  ),
};

Future<void> show(WidgetTester tester, ({bool student, Steps steps}) scene, String theme, String language) async {
  final l = l10n(language);
  final base = scene.student ? studentProfile : appUserProfile;
  final profile = Profile(
    id: base.id,
    fullName: base.fullName,
    role: base.role,
    language: language,
    theme: theme,
    koreanLevel: base.koreanLevel,
    phone: base.phone,
  );
  final clock = GameClock();
  final app = TestApp(
    auth: FakeAuthRepository(signedIn: true, profile: profile),
    home: FakeHomeRepository(
      home: homeJson({
        'groups': [
          {'id': 'g-1', 'name': 'TOPIK II · Kechki'},
          {'id': 'g-2', 'name': 'Matematika · Shanba'},
        ],
      }),
    ),
    preferences: {'language': language, 'theme': theme},
  )..clock = clock.call;
  app.game
    ..now = clock.call
    ..groupBanks['g-2'] = ('Matematika', '');
  if (scene.student) {
    app.game.players[profile.id]!.rewardedWinsToday = 3;
    app.game.recent[profile.id] = [
      RecentMatch(id: 'r-1', finishedAt: DateTime.utc(2026, 11, 26, 10, 20), outcome: MatchOutcome.win, coins: 5, opponent: 'Jasur T.'),
      RecentMatch(id: 'r-2', finishedAt: DateTime.utc(2026, 11, 25, 14, 40), outcome: MatchOutcome.loss, coins: 0, opponent: 'Madina R.'),
      RecentMatch(id: 'r-3', finishedAt: DateTime.utc(2026, 11, 22, 9), outcome: MatchOutcome.draw, coins: 0, opponent: 'Otabek S.'),
      RecentMatch(id: 'r-4', finishedAt: DateTime.utc(2026, 11, 21, 9), outcome: MatchOutcome.win, coins: 5, opponent: 'Dilnoza A.'),
    ];
  }
  await app.pump(tester);
  await openGame(tester, l.tabGame);
  await settle(tester);
  await scene.steps(tester, app, clock, l);
  await settle(tester);
}

void main() {
  for (final scene in scenes.entries) {
    group(scene.key, () {
      for (final theme in themes) {
        for (final language in languages) {
          testWidgets('390x844 $theme $language', (tester) async {
            useScreen(tester, const Size(390, 844));
            await show(tester, scene.value, theme, language);
            expect(tester.takeException(), isNull);
            await expectLater(find.byType(StudentApp), matchesGoldenFile('${scene.key}/390x844_${theme}_$language.png'));
            await tester.pumpWidget(const SizedBox());
          });
        }
        testWidgets('412x915 $theme uz', (tester) async {
          useScreen(tester, const Size(412, 915));
          await show(tester, scene.value, theme, 'uz');
          expect(tester.takeException(), isNull);
          await expectLater(find.byType(StudentApp), matchesGoldenFile('${scene.key}/412x915_${theme}_uz.png'));
          await tester.pumpWidget(const SizedBox());
        });
        // 200% text: nothing is cut or overflows.
        testWidgets('390x844 $theme uz at 200% text', (tester) async {
          useScreen(tester, const Size(390, 844), textScale: 2);
          await show(tester, scene.value, theme, 'uz');
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        });
      }
    });
  }
}
