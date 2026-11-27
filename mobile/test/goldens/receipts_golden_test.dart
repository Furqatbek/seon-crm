// Golden screenshots of card payments: Pay by card (25a), with a receipt
// chosen (25b), and My receipts (25c): light and dark, in uz, ru, en and ko at
// 390×844, and in Uzbek at 412×915.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/models.dart';
import 'package:student/data/receipts.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/features/payments/receipts.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/widgets.dart';

import '../support/fake_receipts.dart';
import '../support/fakes.dart';
import '../support/harness.dart';

const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

typedef Steps = Future<void> Function(WidgetTester tester, TestApp app, AppLocalizations l);

Future<void> openPayments(WidgetTester tester, AppLocalizations l) async {
  await tester.tap(find.bySemanticsLabel(l.tabMore).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.widgetWithText(ListRow, l.payments));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ListRow, l.payments));
  await tester.pumpAndSettle();
}

Future<void> openPayByCard(WidgetTester tester, AppLocalizations l) async {
  await openPayments(tester, l);
  await tester.tap(find.widgetWithText(PrimaryButton, l.payByCard));
  await tester.pumpAndSettle();
}

final scenes = <String, Steps>{
  '25a_pay_by_card': (tester, app, l) => openPayByCard(tester, l),
  '25b_receipt_chosen': (tester, app, l) async {
    await openPayByCard(tester, l);
    app.receiptFile = sampleReceiptFile();
    // With large text the upload box is further down the page.
    await tester.scrollUntilVisible(
      find.byType(UploadBox),
      200,
      scrollable: find.descendant(of: find.byType(PayByCardPage), matching: find.byType(Scrollable)).first,
    );
    await tester.ensureVisible(find.byType(UploadBox));
    await tester.tap(find.byType(UploadBox));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l.receiptFromGallery));
    await tester.pumpAndSettle();
  },
  '25c_my_receipts': (tester, app, l) async {
    app.receipts.sent.addAll([
      Receipt(id: 'r-3', amount: 600000, paidOn: DateTime.utc(2026, 12, 1), status: ReceiptStatus.pending, createdAt: DateTime.utc(2026, 12, 1, 9)),
      Receipt(id: 'r-2', amount: 600000, paidOn: DateTime.utc(2026, 11, 3), status: ReceiptStatus.approved, createdAt: DateTime.utc(2026, 11, 3, 9)),
      Receipt(
        id: 'r-1',
        amount: 550000,
        paidOn: DateTime.utc(2026, 10, 4),
        status: ReceiptStatus.rejected,
        rejectReason: 'summa toʻliq emas',
        createdAt: DateTime.utc(2026, 10, 4, 9),
      ),
    ]);
    await openPayments(tester, l);
    await tester.tap(find.text(l.myReceipts));
    await tester.pumpAndSettle();
  },
};

Future<void> show(WidgetTester tester, Steps steps, String theme, String language) async {
  final l = l10n(language);
  final profile = Profile(
    id: studentProfile.id,
    fullName: studentProfile.fullName,
    role: studentProfile.role,
    language: language,
    theme: theme,
    koreanLevel: studentProfile.koreanLevel,
    phone: studentProfile.phone,
  );
  final app = TestApp(
    auth: FakeAuthRepository(signedIn: true, profile: profile),
    home: FakeHomeRepository(
      home: homeJson({
        'balance': {'amount': -600000, 'oldest_unpaid_month': '2026-12-01', 'due_day': 5},
      }),
    ),
    preferences: {'language': language, 'theme': theme},
  );
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
