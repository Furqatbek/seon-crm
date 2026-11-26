import 'package:flutter_test/flutter_test.dart';
import 'package:student/data/game.dart';
import 'package:student/features/game/match_screen.dart';

import 'fake_game.dart';
import 'fakes.dart';
import 'harness.dart';

/// A clock the test moves, shared by the app and the game server: time passes
/// only when [pass] is called, and the app's timers run with it.
class GameClock {
  GameClock([DateTime? start]) : t = start ?? testNow {
    current = this;
  }

  /// The clock of the test that is running.
  static GameClock? current;

  DateTime t;

  DateTime call() => t;

  /// Time passes, a tenth of a second at a time.
  Future<void> pass(WidgetTester tester, Duration time) async {
    for (var left = time.inMilliseconds; left > 0; left -= 100) {
      t = t.add(Duration(milliseconds: left < 100 ? left : 100));
      await tester.pump(Duration(milliseconds: left < 100 ? left : 100));
    }
    await tester.pump();
  }
}

/// A test app whose clock, and whose game server's clock, the test moves.
TestApp gameApp(GameClock clock, {FakeAuthRepository? auth}) {
  final app = TestApp(auth: auth ?? FakeAuthRepository(signedIn: true, profile: studentProfile))..clock = clock.call;
  app.game.now = clock.call;
  return app;
}

/// The other player's side of the server.
FakeGameRepository opponent(TestApp app, [String id = 'p-jasur']) => FakeGameRepository(app.game, id);

/// Opens the Game tab.
Future<void> openGame(WidgetTester tester, String tabLabel) async {
  await tester.tap(find.bySemanticsLabel(tabLabel).last);
  await tester.pump();
}

/// Lets a tap land and a page slide in: 600 ms pass, on the test's clock too.
/// (The game's screens tick for ever, so there is no waiting for them to go quiet.)
Future<void> settle(WidgetTester tester) async {
  final clock = GameClock.current;
  if (clock != null) return clock.pass(tester, const Duration(milliseconds: 600));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// What a player does with one question.
enum Move { right, wrong, none }

String _choice(TestApp app, int index, Move move) {
  final question = app.game.questions[index];
  return move == Move.right ? question.correct : question.choices.firstWhere((choice) => choice.id != question.correct).id;
}

/// Plays the question on screen: the player taps a choice in the app `mineAfter`
/// into it, the opponent answers through their own connection `theirsAfter` into
/// it, the ten seconds run out if someone did not answer, and the pause before
/// the next question passes.
Future<void> playQuestion(
  WidgetTester tester,
  TestApp app,
  GameClock clock,
  FakeGameRepository other,
  String matchId, {
  required Move mine,
  required Move theirs,
  Duration mineAfter = const Duration(seconds: 2),
  Duration theirsAfter = const Duration(seconds: 4),
}) async {
  final index = (await other.matchState(matchId)).currentIndex;
  final question = app.game.questions[index];
  var elapsed = Duration.zero;
  final steps = [if (mine != Move.none) (at: mineAfter, me: true), if (theirs != Move.none) (at: theirsAfter, me: false)]..sort((a, b) => a.at.compareTo(b.at));
  for (final step in steps) {
    await clock.pass(tester, step.at - elapsed);
    elapsed = step.at;
    if (step.me) {
      final text = question.choices.firstWhere((choice) => choice.id == _choice(app, index, mine)).text;
      await tester.tap(find.widgetWithText(ChoiceTile, text));
    } else {
      await other.submit(matchId, index, _choice(app, index, theirs));
    }
    await tester.pump();
    await tester.pump();
  }
  if (mine == Move.none || theirs == Move.none) await clock.pass(tester, const Duration(seconds: 10, milliseconds: 400) - elapsed);
  // The pause before the next question, and a little more for it to be asked for.
  await clock.pass(tester, const Duration(milliseconds: 2400));
}

/// Play now in the app against `other`, up to the first question on screen. Returns the match's id.
Future<String> startMatch(WidgetTester tester, TestApp app, GameClock clock, FakeGameRepository other, String playLabel) async {
  await other.joinQueue(null);
  await tester.tap(find.text(playLabel));
  await settle(tester);
  final matchId = (await other.lobby(null)).activeMatchId!;
  // 3, 2, 1: 600 ms of it went by while the screen opened.
  await clock.pass(tester, const Duration(milliseconds: 2700));
  return matchId;
}

MatchOutcome outcomeOf(MatchState state) => state.result!.outcome;
