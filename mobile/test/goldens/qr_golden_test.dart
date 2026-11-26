// Golden screenshots of the QR tab (08a arrived today, 08b not arrived yet,
// 08c the App user's locked state): light and dark, in uz, ru, en and ko at
// 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/checkin.dart';
import 'package:student/data/models.dart';

import '../support/fakes.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

final scenes = <String, ({bool student, bool arrived})>{
  '08a_qr_arrived': (student: true, arrived: true),
  '08b_qr_not_arrived': (student: true, arrived: false),
  '08c_qr_app_user': (student: false, arrived: false),
};

Future<void> show(WidgetTester tester, ({bool student, bool arrived}) scene, String theme, String language) async {
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
    preferences: {'language': language, 'theme': theme},
  );
  // Twelve seconds into a code's thirty.
  app.now = DateTime.utc(2026, 11, 26, 10, 45, 12);
  // 14:52 in Tashkent.
  if (scene.arrived) app.checkin.visits = [Visit(arrived: true, at: DateTime.utc(2026, 11, 26, 9, 52))];
  await app.pump(tester);
  await tester.tap(find.bySemanticsLabel(l.tabQr).last);
  await tester.pumpAndSettle();
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
