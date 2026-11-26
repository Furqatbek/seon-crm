// Golden screenshots of the Shop (09a, 09b), the product page and the confirm
// sheet (10a, 10b) and My orders (11): light and dark, in uz, ru, en and ko at
// 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/models.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/widgets.dart';

import '../support/fakes.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

/// What to do after opening the Shop tab.
typedef Steps = Future<void> Function(WidgetTester tester, AppLocalizations l);

Future<void> openShirt(WidgetTester tester, AppLocalizations l) async {
  await tester.scrollUntilVisible(find.text('Brendli futbolka'), 200, scrollable: find.byType(Scrollable).last);
  await tester.ensureVisible(find.text('Brendli futbolka'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Brendli futbolka'));
  await tester.pumpAndSettle();
  // At large text sizes the sizes are further down a list that builds as it scrolls.
  await tester.scrollUntilVisible(find.widgetWithText(Pill, 'M'), 200, scrollable: find.byType(Scrollable).last);
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(Pill, 'M'));
  await tester.pumpAndSettle();
}

final scenes = <String, ({bool student, Steps steps})>{
  '09a_shop_student': (student: true, steps: (_, _) async {}),
  '09b_shop_app_user': (student: false, steps: (_, _) async {}),
  '10a_product': (student: true, steps: openShirt),
  '10b_confirm_order': (
    student: true,
    steps: (tester, l) async {
      await openShirt(tester, l);
      await tester.tap(find.widgetWithText(PrimaryButton, l.orderAction));
      await tester.pumpAndSettle();
    },
  ),
  '11_my_orders': (
    student: true,
    steps: (tester, l) async {
      await tester.tap(find.text(l.myOrders));
      await tester.pumpAndSettle();
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
  final app = TestApp(
    auth: FakeAuthRepository(signedIn: true, profile: profile),
    preferences: {'language': language, 'theme': theme},
  );
  await app.pump(tester);
  await tester.tap(find.bySemanticsLabel(l.tabShop).last);
  await tester.pumpAndSettle();
  await scene.steps(tester, l);
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
