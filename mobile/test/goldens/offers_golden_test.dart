// Golden screenshots of the offer: My voucher (24a), the free open lessons
// (24b) and a seat just booked (24c): light and dark, in uz, ru, en and ko at
// 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/home.dart';
import 'package:student/data/models.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/widgets.dart';

import '../support/fake_offers.dart';
import '../support/fakes.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

typedef Steps = Future<void> Function(WidgetTester tester, TestApp app, AppLocalizations l);

Future<void> openRow(WidgetTester tester, AppLocalizations l, String label) async {
  await tester.tap(find.bySemanticsLabel(l.tabMore).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.widgetWithText(ListRow, label));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ListRow, label));
  await tester.pumpAndSettle();
}

final scenes = <String, Steps>{
  '24a_my_voucher': (tester, app, l) => openRow(tester, l, l.myVoucher),
  '24b_open_lessons': (tester, app, l) => openRow(tester, l, l.openLessons),
  '24c_booked': (tester, app, l) async {
    await openRow(tester, l, l.openLessons);
    await tester.tap(find.widgetWithText(PrimaryButton, l.openLessonBook));
    await tester.pumpAndSettle();
  },
  '24d_my_booking': (tester, app, l) async {
    app.offers.bookNow('slot-sat', '2026-11-28');
    await openRow(tester, l, l.openLessons);
  },
};

Future<void> show(WidgetTester tester, Steps steps, String theme, String language) async {
  final l = l10n(language);
  final profile = Profile(
    id: appUserProfile.id,
    fullName: appUserProfile.fullName,
    role: appUserProfile.role,
    language: language,
    theme: theme,
    koreanLevel: appUserProfile.koreanLevel,
    phone: appUserProfile.phone,
  );
  final voucher = sampleVoucher();
  final app = TestApp(
    auth: FakeAuthRepository(signedIn: true, profile: profile),
    home: FakeHomeRepository(appUser: AppUserHome(lockedCoins: 85, voucher: voucher)),
    preferences: {'language': language, 'theme': theme},
  );
  app.offers.voucherValue = voucher;
  await app.pump(tester);
  await steps(tester, app, l);
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
