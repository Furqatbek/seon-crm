// Mock exams in the app — docs/STUDENT_APP_SPEC.md → "Rules → Mock exams".
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/core/exam_state.dart';
import 'package:student/data/exams.dart';
import 'package:student/features/exams/exam_screen.dart';
import 'package:student/features/exams/exams_side.dart';
import 'package:student/features/game/game_widgets.dart';
import 'package:student/ui/widgets.dart';

import 'support/fake_exams.dart';
import 'support/fakes.dart';
import 'support/game_play.dart';
import 'support/harness.dart';

final l = l10n('uz');

/// A short exam: 3 listening questions in 10 minutes (the first two share a
/// recording), 2 reading questions in 15, one play of each recording.
FakeExam shortExam({int plays = 1, Map<int, int> thresholds = const {1: 2, 2: 4}}) => sampleExam(
  id: 'short',
  title: 'TOPIK I — Qisqa',
  listening: 3,
  reading: 2,
  listeningTime: const Duration(minutes: 10),
  readingTime: const Duration(minutes: 15),
  audioMaxPlays: plays,
  thresholds: thresholds,
);

TestApp examApp(GameClock clock, {bool student = true, FakeExam? exam}) {
  final app = gameApp(clock, auth: FakeAuthRepository(signedIn: true, profile: student ? studentProfile : appUserProfile));
  app.exams
    ..now = clock.call
    ..exams.clear()
    ..exams.add(exam ?? shortExam());
  return app;
}

/// The Game tab's exam list.
Future<void> openExams(WidgetTester tester, TestApp app) async {
  await app.pump(tester);
  await openGame(tester, l.tabGame);
  await settle(tester);
  await tester.tap(find.text(l.gameExams));
  await settle(tester);
  // The test student's own level is TOPIK II; the exams here are TOPIK I.
  await tester.tap(find.text(l.levelTopik1));
  await settle(tester);
}

/// From the list into the attempt's first question.
Future<void> startExam(WidgetTester tester, TestApp app) async {
  await openExams(tester, app);
  await tester.tap(find.text('TOPIK I — Qisqa'));
  await settle(tester);
  await tester.tap(find.widgetWithText(PrimaryButton, l.examStart));
  await settle(tester);
}

Future<void> tapText(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text).first);
  await tester.tap(find.text(text).first);
  await settle(tester);
}

String ring(WidgetTester tester) => tester.widget<TimerRing>(find.byType(TimerRing)).label;
FakeAttempt attemptOf(TestApp app) => app.exams.attempts.values.last;

/// Hands the open section in through the question list.
Future<void> submitSection(WidgetTester tester) async {
  await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
  await settle(tester);
  await tester.tap(find.widgetWithText(PrimaryButton, l.examSubmitSection).last);
  await settle(tester);
}

void main() {
  setUp(() => GameClock.current = null);

  group('the list and the intro', () {
    testWidgets('exams of the person\'s level, with coins to win, past results and the retake', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = gameApp(clock);
      app.exams
        ..now = clock.call
        ..exams.add(sampleExam(id: 'exam-2', title: 'TOPIK I — Mock 2'))
        ..addFinished(studentProfile.id, 'exam-2', correctListening: 20, correctReading: 28);
      await openExams(tester, app);

      expect(find.text('TOPIK I — Mock 3'), findsOneWidget);
      expect(find.text(l.examMeta(30, 40, 100)), findsOneWidget);
      expect(find.text(l.examUpToCoins('70 tanga')), findsOneWidget);
      expect(find.text(l.examDone(48, 70)), findsOneWidget);
      expect(find.text(l.examRetake), findsOneWidget);
      // The other level's exams are a tap away.
      expect(find.text('TOPIK II — Mock 1'), findsNothing);
      await tester.tap(find.text(l.levelTopik2));
      await settle(tester);
      expect(find.text('TOPIK II — Mock 1'), findsOneWidget);
      expect(find.text('TOPIK I — Mock 3'), findsNothing);
    });

    testWidgets('the intro says the rules; Start begins the attempt with listening', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock, exam: shortExam(plays: 2));
      await openExams(tester, app);
      await tester.tap(find.text('TOPIK I — Qisqa'));
      await settle(tester);
      expect(find.byType(ExamIntroScreen), findsOneWidget);
      expect(find.text(l.examSectionMeta(3, 10)), findsOneWidget);
      expect(find.text(l.examSectionMeta(2, 15)), findsOneWidget);
      expect(find.text(l.examRulePlays(2)), findsOneWidget);
      expect(find.text(l.examRuleClock), findsOneWidget);
      expect(find.text(l.examRuleCoins('1 tanga')), findsOneWidget);
      expect(find.text(l.examPractice), findsOneWidget);

      await tester.tap(find.widgetWithText(PrimaryButton, l.examStart));
      await settle(tester);
      expect(find.byType(ExamPlayView), findsOneWidget);
      expect(find.text(l.examListening), findsOneWidget);
      expect(find.text('1/3'), findsOneWidget);
      // Back from the attempt leads to the list, not to the intro.
      expect(find.byType(ExamIntroScreen), findsNothing);
    });

    testWidgets('an App user is told the coins stay locked', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock(), student: false);
      await openExams(tester, app);
      await tester.tap(find.text('TOPIK I — Qisqa'));
      await settle(tester);
      expect(find.text(l.examRuleLocked), findsOneWidget);
    });

    testWidgets('an exam that was closed meanwhile says so', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock());
      await openExams(tester, app);
      await tester.tap(find.text('TOPIK I — Qisqa'));
      await settle(tester);
      app.exams.exams.single.published = false;
      await tester.tap(find.widgetWithText(PrimaryButton, l.examStart));
      await settle(tester);
      expect(find.text(l.examNotOpen), findsOneWidget);
      expect(find.byType(ExamIntroScreen), findsOneWidget);
    });
  });

  group('timers', () {
    testWidgets('the ring counts down to the server\'s deadline', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      // 600 ms went by getting here.
      expect(ring(tester), '10:00');
      await clock.pass(tester, const Duration(seconds: 61));
      expect(ring(tester), '8:59');
      final fraction = tester.widget<TimerRing>(find.byType(TimerRing)).fraction;
      expect(fraction, closeTo(538.4 / 600, 0.01));
    });

    testWidgets('a phone whose clock is wrong still shows the server\'s time left', (tester) async {
      final server = DateTime.utc(2026, 11, 27, 9);
      var phone = DateTime.utc(2026, 11, 27, 9, 7);
      final exams = FakeExamServer(now: () => server)..exams.add(shortExam());
      final repository = FakeExamRepository(exams, 'p-1');
      final session = ExamSession(attemptId: exams.start('p-1', 'short'), repository: repository, now: () => phone, audio: FakeExamAudio());
      await session.refresh();
      // Seven minutes ahead of the server: the ten minutes are still whole.
      expect(session.timeLeft, const Duration(minutes: 10));
      phone = phone.add(const Duration(seconds: 30));
      expect(session.timeLeft, const Duration(minutes: 9, seconds: 30));
      session.dispose();
    });

    testWidgets('when listening\'s time runs out, reading opens by itself with its own time', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await tapText(tester, '아니요, 책이 없습니다.');
      await clock.pass(tester, const Duration(minutes: 10));
      await settle(tester);
      expect(find.text(l.examReading), findsOneWidget);
      expect(find.text('1/2'), findsOneWidget);
      // Reading's deadline was set at the start: fifteen minutes after listening's.
      expect(ring(tester), anyOf('14:59', '14:58'));
      expect(attemptOf(app).current, ExamSectionKind.reading);
    });

    testWidgets('when reading\'s time runs out the attempt is handed in: the result shows', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await tapText(tester, '아니요, 책이 없습니다.');
      await clock.pass(tester, const Duration(minutes: 25));
      await settle(tester);
      expect(find.byType(ExamResultView), findsOneWidget);
      expect(find.text('1/3'), findsOneWidget);
      expect(attemptOf(app).expired, isTrue);
      expect(app.exams.earned[studentProfile.id], 1);
    });

    testWidgets('an answer tapped after the deadline is not kept: the next section shows instead', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      // The phone's timer has not fired yet, but the server's time is up.
      clock.t = clock.t.add(const Duration(minutes: 10, seconds: 1));
      await tester.tap(find.text('아니요, 책이 없습니다.'));
      await settle(tester);
      expect(attemptOf(app).answers, isEmpty);
      expect(find.text(l.examReading), findsOneWidget);
    });

    testWidgets('leaving and coming back resumes where the attempt is by then', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await tapText(tester, '아니요, 책이 없습니다.');
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      // Back to the list: the exam is in progress there.
      await tester.binding.handlePopRoute();
      await settle(tester);
      expect(find.text(l.examContinue), findsOneWidget);
      await clock.pass(tester, const Duration(minutes: 3));
      await tester.tap(find.text(l.examContinue));
      await settle(tester);
      // Straight back in at the first question still open, with the time that is left.
      expect(find.byType(ExamPlayView), findsOneWidget);
      expect(find.text('2/3'), findsOneWidget);
      expect(ring(tester), anyOf('6:58', '6:57'));
      expect(app.exams.attempts.length, 1);
    });

    testWidgets('the app coming back to the front asks the server', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      // The phone slept through the listening section: no timer fired.
      clock.t = clock.t.add(const Duration(minutes: 11));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await settle(tester);
      expect(find.text(l.examReading), findsOneWidget);
    });

    testWidgets('without a connection it says so and keeps trying', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      app.examRepository.goOffline();
      await tester.tap(find.text('아니요, 책이 없습니다.'));
      await settle(tester);
      expect(find.text(l.gameReconnecting), findsOneWidget);
      // Not saved: not shown as chosen.
      expect(attemptOf(app).answers, isEmpty);
      app.examRepository.failure = null;
      await tapText(tester, '아니요, 책이 없습니다.');
      expect(find.text(l.gameReconnecting), findsNothing);
      expect(attemptOf(app).answers.values.single, 'b');
    });
  });

  group('the play counter', () {
    testWidgets('plays left come from the server; a recording that is playing cannot be started again', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock, exam: shortExam(plays: 2));
      await startExam(tester, app);
      expect(find.text(l.examPlaysLeft(2)), findsOneWidget);

      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      expect(app.audio.played, ['https://media.test/exam/short-a1.mp3']);
      expect(find.text(l.examPlaying), findsOneWidget);
      expect(attemptOf(app).plays['short-a1'], 1);
      // Playing: tapping again starts nothing and counts nothing.
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      expect(app.audio.played.length, 1);
      expect(attemptOf(app).plays['short-a1'], 1);

      app.audio.end();
      await settle(tester);
      expect(find.text(l.examPlaysLeft(1)), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      app.audio.end();
      await settle(tester);
      expect(find.text(l.examNoPlaysLeft), findsOneWidget);
      // None left: the button does nothing, and the server would refuse anyway.
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      expect(app.audio.played.length, 2);
      expect(app.exams.recordPlay(studentProfile.id, attemptOf(app).id, 'short-l1').allowed, isFalse);
    });

    testWidgets('two questions that share a recording share its count', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      // On to the second question while it plays: the same recording goes on.
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      expect(app.audio.stops, 0);
      expect(find.text(l.examPlaying), findsOneWidget);
      app.audio.end();
      await settle(tester);
      expect(find.text(l.examNoPlaysLeft), findsOneWidget);
      // The third question has its own recording, not played yet.
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      expect(find.text(l.examPlaysLeft(1)), findsOneWidget);
    });

    testWidgets('moving to a question with another recording stops the one playing', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      expect(app.audio.stops, 1);
      expect(find.text(l.examPlaying), findsNothing);
    });

    testWidgets('a recording that cannot be reached costs no play', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      app.examRepository.goOffline();
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      expect(find.text(l.examAudioFailed), findsOneWidget);
      expect(attemptOf(app).plays, isEmpty);
      expect(app.audio.played, isEmpty);
    });

    testWidgets('there is nothing to drag: the recording has no seek control', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock());
      await startExam(tester, app);
      expect(find.byType(Slider), findsNothing);
      expect(find.descendant(of: find.byType(AudioCard), matching: find.byType(GestureDetector)), findsOneWidget);
    });
  });

  group('the question grid', () {
    GridCell cell(WidgetTester tester, int number) =>
        tester.widget<GridCell>(find.byWidgetPredicate((widget) => widget is GridCell && widget.number == number));

    testWidgets('answered, flagged and open questions, and the one on screen', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await tapText(tester, '아니요, 책이 없습니다.');
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      await tester.tap(find.text(l.examFlag));
      await settle(tester);
      expect(find.text(l.examUnflag), findsOneWidget);
      expect(attemptOf(app).flags['short-l2'], isTrue);

      await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
      await settle(tester);
      expect(find.byType(GridCell), findsNWidgets(3));
      expect((cell(tester, 1).answered, cell(tester, 1).flagged, cell(tester, 1).current), (true, false, false));
      expect((cell(tester, 2).answered, cell(tester, 2).flagged, cell(tester, 2).current), (false, true, true));
      expect((cell(tester, 3).answered, cell(tester, 3).flagged, cell(tester, 3).current), (false, false, false));
      expect(find.text(l.examUnansweredCount(2)), findsOneWidget);
      expect(find.bySemanticsLabel('${l.examQuestionNumber(2)}, ${l.examUnanswered}, ${l.examFlagged}'), findsOneWidget);

      // Tapping a number shows that question.
      await tester.tap(find.byWidgetPredicate((widget) => widget is GridCell && widget.number == 3));
      await settle(tester);
      expect(find.byType(QuestionGridSheet), findsNothing);
      expect(find.text('3/3'), findsOneWidget);
    });

    testWidgets('a flag stays when the answer changes, and clears on a second tap', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock());
      await startExam(tester, app);
      await tester.tap(find.text(l.examFlag));
      await settle(tester);
      await tapText(tester, '네, 학생입니다.');
      await tapText(tester, '아니요, 책이 없습니다.');
      expect(attemptOf(app).answers['short-l1'], 'b');
      expect(attemptOf(app).flags['short-l1'], isTrue);
      await tester.tap(find.text(l.examUnflag));
      await settle(tester);
      expect(attemptOf(app).flags['short-l1'], isFalse);
      expect(attemptOf(app).answers['short-l1'], 'b');
    });

    testWidgets('every cell is at least 44 points and the grid fits a narrow phone at 200% text', (tester) async {
      useScreen(tester, const Size(390, 844), textScale: 2);
      final clock = GameClock();
      final app = examApp(
        clock,
        exam: sampleExam(id: 'short', title: 'TOPIK I — Qisqa'),
      );
      await startExam(tester, app);
      await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
      await settle(tester);
      expect(tester.takeException(), isNull);
      expect(find.byType(GridCell), findsNWidgets(30));
      for (final element in find.byType(GridCell).evaluate()) {
        expect(element.size!.width, greaterThanOrEqualTo(44));
        expect(element.size!.height, greaterThanOrEqualTo(44));
      }
    });

    testWidgets('Submit section in the grid hands listening in: reading starts with its full time', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      await startExam(tester, app);
      await clock.pass(tester, const Duration(minutes: 2));
      await submitSection(tester);
      expect(find.text(l.examReading), findsOneWidget);
      expect(ring(tester), anyOf('15:00', '14:59'));
      // The last question's button leads to the same list.
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      await tester.tap(find.widgetWithText(PrimaryButton, l.examSubmitSection));
      await settle(tester);
      expect(find.byType(QuestionGridSheet), findsOneWidget);
    });
  });

  group('the result', () {
    /// Listening: the first two right. Reading: the first right.
    Future<void> sit(WidgetTester tester) async {
      await tapText(tester, '아니요, 책이 없습니다.');
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      await tapText(tester, '아니요, 책이 없습니다.');
      await tester.tap(find.text(l.examNext));
      await settle(tester);
      await tapText(tester, '네, 학생입니다.');
      await submitSection(tester);
      await tapText(tester, '친구와 자전거를 탔습니다.');
      await submitSection(tester);
    }

    testWidgets('a student: each section, the total, the estimate with its label, and the coins earned', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock());
      await startExam(tester, app);
      await sit(tester);

      expect(find.byType(ExamResultView), findsOneWidget);
      expect(find.text('2/3'), findsOneWidget);
      expect(find.text('1/2'), findsOneWidget);
      expect(find.bySemanticsLabel('${l.examTotal}: 3/5'), findsOneWidget);
      expect(find.textContaining(l.examEstimateLabel, findRichText: true), findsOneWidget);
      expect(find.text(l.examEstimateNote), findsOneWidget);
      expect(find.text('+3 tanga'), findsOneWidget);
      expect(app.exams.earned[studentProfile.id], 3);
      expect(app.exams.locked, isEmpty);
      // No offer for the centre's own student.
      expect(find.text(l.examOfferTitle), findsNothing);
      expect(find.text(l.voucherTitle), findsNothing);
      expect(app.offers.voucherValue, isNull);
      expect(find.text(l.bookOpenLesson), findsNothing);
    });

    testWidgets('an App user: the coins are locked, and the offer to join is shown', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock(), student: false);
      await startExam(tester, app);
      await sit(tester);

      expect(find.text(l.examCoinsLocked('3 tanga')), findsOneWidget);
      expect(find.text('+3 tanga'), findsNothing);
      expect(app.exams.locked[appUserProfile.id], 3);
      expect(app.exams.earned, isEmpty);
      // Their first finished exam brought the voucher: the offer card shows it with its code.
      expect(find.text(l.voucherTitle), findsOneWidget);
      expect(find.text('Birinchi oyga 20% chegirma'), findsOneWidget);
      expect(find.text('KOR-7F3K9'), findsOneWidget);
      expect(find.widgetWithText(PrimaryButton, l.bookOpenLesson), findsOneWidget);
      expect(find.text(l.later), findsOneWidget);
    });

    testWidgets('no thresholds, no estimate', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock(), exam: shortExam(thresholds: const {}));
      await startExam(tester, app);
      await sit(tester);
      expect(find.textContaining(l.examEstimateLabel, findRichText: true), findsNothing);
      expect(find.text(l.examEstimateNote), findsNothing);
    });

    testWidgets('a retake gives no coins and says so', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock());
      await startExam(tester, app);
      await sit(tester);
      await tester.tap(find.widgetWithText(PrimaryButton, l.done));
      await settle(tester);
      // Back in the list: the result, and the retake.
      expect(find.text(l.examDone(3, 5)), findsOneWidget);
      await tester.tap(find.text(l.examRetake));
      await settle(tester);
      expect(find.text(l.examRuleNoCoins), findsOneWidget);
      await tester.tap(find.widgetWithText(PrimaryButton, l.examStart));
      await settle(tester);
      await sit(tester);
      expect(find.text(l.examNoCoinsRetake), findsOneWidget);
      expect(app.exams.earned[studentProfile.id], 3);
    });

    testWidgets('the review: the right answers, the person\'s own, explanations and what the recording said', (tester) async {
      useScreen(tester, const Size(390, 844));
      final app = examApp(GameClock());
      await startExam(tester, app);
      // Nothing during the attempt says which choice is right, or what the recording says.
      expect(find.text(l.examRightAnswer), findsNothing);
      expect(find.textContaining('책이 있습니까'), findsNothing);
      await sit(tester);
      await tester.tap(find.widgetWithText(SecondaryButton, l.examReview));
      await settle(tester);

      expect(find.byType(ExamReviewScreen), findsOneWidget);
      expect(find.text(l.examTranscript), findsOneWidget);
      expect(find.textContaining('책이 있습니까'), findsOneWidget);
      expect(find.text('질문은 책에 대한 것입니다.'), findsOneWidget);
      expect(find.text('${l.examYourAnswer} · ${l.examRightAnswer}'), findsNWidgets(2));
      // The third listening question was answered wrong; the last reading one not at all.
      await tester.scrollUntilVisible(find.text(l.examNotAnswered), 300, scrollable: find.byType(Scrollable).last);
      expect(find.text(l.examNotAnswered), findsOneWidget);
    });

    testWidgets('a finished exam in the list opens its last result', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock);
      app.exams.addFinished(studentProfile.id, 'short', correctListening: 3, correctReading: 1);
      await openExams(tester, app);
      await tester.tap(find.text('TOPIK I — Qisqa'));
      await settle(tester);
      expect(find.byType(ExamResultView), findsOneWidget);
      expect(find.bySemanticsLabel('${l.examTotal}: 4/5'), findsOneWidget);
    });
  });

  group('picture choices', () {
    testWidgets('are numbered, and choosing one is sent like any answer', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(
        clock,
        exam: sampleExam(id: 'short', title: 'TOPIK I — Qisqa'),
      );
      await startExam(tester, app);
      await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
      await settle(tester);
      await tester.tap(find.byWidgetPredicate((widget) => widget is GridCell && widget.number == 12));
      await settle(tester);
      expect(find.text('12/30'), findsOneWidget);
      expect(find.bySemanticsLabel(l.examChoice(2)), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.examChoice(2)));
      await settle(tester);
      expect(attemptOf(app).answers['short-l12'], 'b');
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });
  });

  group('Home for an App user', () {
    testWidgets('the hero card names the next unfinished exam and opens it', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock, student: false);
      app.exams.exams.insert(0, sampleExam(id: 'done', title: 'TOPIK I — Mock 1', listening: 3, reading: 2));
      app.exams.addFinished(appUserProfile.id, 'done', correctListening: 2, correctReading: 1);
      await app.pump(tester);
      await settle(tester);

      // The first was finished: the second is next.
      expect(find.text('TOPIK I — Qisqa'), findsOneWidget);
      expect(find.text(l.examMeta(3, 2, 25)), findsOneWidget);
      await tester.tap(find.text(l.examStart), warnIfMissed: false);
      await settle(tester);
      expect(find.byType(ExamIntroScreen), findsOneWidget);
      await tester.tap(find.widgetWithText(PrimaryButton, l.examStart));
      await settle(tester);
      expect(find.byType(ExamPlayView), findsOneWidget);

      // Back on Home it is in progress: the card leads straight back in.
      await tester.binding.handlePopRoute();
      await settle(tester);
      expect(find.text(l.examContinue), findsOneWidget);
      await tester.tap(find.text(l.examContinue), warnIfMissed: false);
      await settle(tester);
      expect(find.byType(ExamPlayView), findsOneWidget);
    });

    testWidgets('with every exam finished it says so and leads to the list', (tester) async {
      useScreen(tester, const Size(390, 844));
      final clock = GameClock();
      final app = examApp(clock, student: false);
      app.exams.addFinished(appUserProfile.id, 'short', correctListening: 2, correctReading: 1);
      await app.pump(tester);
      await settle(tester);
      expect(find.text(l.examHeroAllDone), findsOneWidget);
      expect(find.text(l.examStart), findsNothing);
      await tester.tap(find.text(l.examHeroAllDone));
      await settle(tester);
      expect(find.byType(ExamsSide), findsOneWidget);
      expect(find.text(l.examDone(3, 5)), findsOneWidget);
    });
  });
}
