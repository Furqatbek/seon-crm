// Golden screenshots of More (12), Leaderboard (14), Schedule (15), Payments
// and Coin history (16) and the Delete account sheet (18h): light and dark,
// in uz, ru, en and ko at 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/models.dart';
import 'package:student/features/more/sub_page.dart';

import '../support/fakes.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

/// A scene: who is signed in, and the rows to open from the More tab, by their
/// text in the scene's language.
class Scene {
  const Scene(this.steps, {this.student = true});

  final List<String Function(dynamic l)> steps;
  final bool student;
}

final scenes = <String, Scene>{
  '12a_more_student': const Scene([]),
  '12b_more_app_user': const Scene([], student: false),
  '13_edit_profile': Scene([(l) => l.editProfile]),
  '14a_leaderboard_group': Scene([(l) => l.leaderboard]),
  '14b_leaderboard_centre': Scene([(l) => l.leaderboard, (l) => l.scopeCentre]),
  '15_schedule': Scene([(l) => l.schedule]),
  '16a_payments': Scene([(l) => l.payments]),
  '16b_coin_history': Scene([(l) => l.coinHistory]),
  '17a_language': Scene([(l) => l.language]),
  '17b_appearance': Scene([(l) => l.appearance]),
  '18h_delete_account': Scene([(l) => l.deleteAccount]),
};

Future<void> show(WidgetTester tester, Scene scene, String theme, String language) async {
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
  );
  await app.pump(tester);
  await tester.tap(find.bySemanticsLabel(l.tabMore).last);
  await tester.pumpAndSettle();
  for (final step in scene.steps) {
    final String text = step(l);
    final row = find.widgetWithText(ListRow, text);
    var target = row.evaluate().isNotEmpty ? row : find.text(text);
    // At large text sizes the row may be further down a list that builds as it scrolls.
    if (target.evaluate().isEmpty) {
      await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
      target = row;
    }
    await tester.ensureVisible(target.first);
    await tester.pumpAndSettle();
    await tester.tap(target.first);
    await tester.pumpAndSettle();
  }
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
