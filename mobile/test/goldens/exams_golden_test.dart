// Golden screenshots of the mock exams: the list (20a), the intro (20b),
// listening (21), reading (22a), the question grid (22b) and the result for a
// student (23a) and an App user (23b): light and dark, in uz, ru, en and ko
// at 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/models.dart';
import 'package:student/features/exams/exam_screen.dart';
import 'package:student/l10n/app_localizations.dart';

import '../support/fake_exams.dart';
import '../support/fakes.dart';
import '../support/game_play.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

typedef Steps = Future<void> Function(WidgetTester tester, TestApp app, GameClock clock, AppLocalizations l);

/// An attempt of Mock 3 made on the server before the app opens: the first
/// `listening` questions answered, then, with `reading` given, listening
/// handed in and that many reading questions answered.
FakeAttempt attemptInProgress(TestApp app, GameClock clock, {required int listening, int? reading, Duration spent = Duration.zero}) {
  final me = app.auth.profile!.id;
  final server = app.exams;
  final id = server.start(me, 'exam-3');
  final attempt = server.attempts[id]!;
  for (var i = 1; i <= listening; i++) {
    server.answer(me, id, 'exam-3-l$i', i % 4 == 0 ? 'a' : 'b', false);
  }
  if (reading != null) {
    server.submitSection(me, id);
    for (var i = 1; i <= reading; i++) {
      server.answer(me, id, 'exam-3-r$i', i % 5 == 0 ? 'a' : 'c', false);
    }
  }
  clock.t = clock.t.add(spent);
  return attempt;
}

/// The list read again, as after coming back to the tab.
Future<void> reread(WidgetTester tester, AppLocalizations l) async {
  await tester.tap(find.text(l.gameDuel));
  await settle(tester);
  await tester.tap(find.text(l.gameExams));
  await settle(tester);
  await tester.tap(find.text(l.levelTopik1));
  await settle(tester);
}

Future<void> openMock3(WidgetTester tester) async {
  await tester.tap(find.text('TOPIK I — Mock 3'));
  await settle(tester);
}

/// Reading at question 18 with 41:05 left, 7 and 9 flagged, 9 and 14 open.
FakeAttempt readingAt18(TestApp app, GameClock clock) {
  final me = app.auth.profile!.id;
  final attempt = attemptInProgress(app, clock, listening: 30, reading: 17, spent: const Duration(minutes: 18, seconds: 50, milliseconds: 400));
  app.exams
    ..answer(me, attempt.id, 'exam-3-r7', 'c', true)
    ..answer(me, attempt.id, 'exam-3-r9', null, true)
    ..answer(me, attempt.id, 'exam-3-r14', null, false);
  return attempt;
}

final scenes = <String, ({bool student, Steps steps})>{
  '20a_exams_list': (student: true, steps: (_, _, _, _) async {}),
  '20b_exam_intro': (student: true, steps: (tester, _, _, _) => openMock3(tester)),
  '21_listening': (
    student: true,
    steps: (tester, app, clock, l) async {
      // Eleven answered and 23:41 left: back in at question 12, its recording played once.
      attemptInProgress(app, clock, listening: 11, spent: const Duration(minutes: 16, seconds: 15, milliseconds: 400));
      await reread(tester, l);
      await openMock3(tester);
      await tester.tap(find.bySemanticsLabel(l.examPlay));
      await settle(tester);
      app.audio.end();
      await tester.tap(find.bySemanticsLabel(l.examChoice(2)));
      await settle(tester);
    },
  ),
  '22a_reading': (
    student: true,
    steps: (tester, app, clock, l) async {
      readingAt18(app, clock);
      await reread(tester, l);
      await openMock3(tester);
      // The first open question is 9: on to 18, as in the design.
      await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
      await settle(tester);
      await tester.tap(find.byWidgetPredicate((widget) => widget is GridCell && widget.number == 18));
      await settle(tester);
      await tester.ensureVisible(find.text('친구와 자전거를 탔습니다.'));
      await tester.tap(find.text('친구와 자전거를 탔습니다.'), warnIfMissed: false);
      await settle(tester);
    },
  ),
  '22b_question_grid': (
    student: true,
    steps: (tester, app, clock, l) async {
      readingAt18(app, clock);
      await reread(tester, l);
      await openMock3(tester);
      await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
      await settle(tester);
      await tester.tap(find.byWidgetPredicate((widget) => widget is GridCell && widget.number == 18));
      await settle(tester);
      await tester.ensureVisible(find.text('친구와 자전거를 탔습니다.'));
      await tester.tap(find.text('친구와 자전거를 탔습니다.'), warnIfMissed: false);
      await settle(tester);
      await tester.tap(find.bySemanticsLabel(l.examOpenGrid));
      await settle(tester);
    },
  ),
  '23a_exam_result_student': (
    student: true,
    steps: (tester, app, clock, l) async {
      await tester.tap(find.text('TOPIK I — Mock 2'));
      await settle(tester);
    },
  ),
  '23b_exam_result_app_user': (
    student: false,
    steps: (tester, app, clock, l) async {
      await tester.tap(find.text('TOPIK I — Mock 2'));
      await settle(tester);
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
    preferences: {'language': language, 'theme': theme},
  )..clock = clock.call;
  app.game.now = clock.call;
  app.exams
    ..now = clock.call
    ..exams.addAll([sampleExam(id: 'exam-2', title: 'TOPIK I — Mock 2'), sampleExam(id: 'exam-1', title: 'TOPIK I — Mock 1')]);
  // Mock 2: 22 and 29 right, 51 coins; Mock 1 before it.
  final last = app.exams.addFinished(profile.id, 'exam-2', correctListening: 22, correctReading: 29)
    ..coins = 51
    ..coinsLocked = !scene.student;
  app.exams.addFinished(profile.id, 'exam-1', correctListening: 19, correctReading: 25).submittedAt = last.submittedAt!.subtract(const Duration(days: 7));
  await app.pump(tester);
  await openGame(tester, l.tabGame);
  await settle(tester);
  await tester.tap(find.text(l.gameExams));
  await settle(tester);
  await tester.tap(find.text(l.levelTopik1));
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
