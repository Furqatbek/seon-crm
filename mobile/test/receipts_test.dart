// Card payments and receipts in the app — docs/STUDENT_APP_SPEC.md → "Rules → Receipts".
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/data/receipts.dart';
import 'package:student/features/auth/auth_widgets.dart';
import 'package:student/features/more/money_pages.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/features/payments/receipts.dart';
import 'package:student/ui/widgets.dart';

import 'support/fake_receipts.dart';
import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

/// A student who owes 600 000 soʻm for December.
TestApp debtor() => TestApp(
  auth: FakeAuthRepository(signedIn: true, profile: studentProfile),
  home: FakeHomeRepository(
    home: homeJson({
      'balance': {'amount': -600000, 'oldest_unpaid_month': '2026-12-01', 'due_day': 5},
    }),
  ),
);

Future<void> openPayments(WidgetTester tester) async {
  await tester.tap(find.bySemanticsLabel(l.tabMore).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.widgetWithText(ListRow, l.payments));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ListRow, l.payments));
  await tester.pumpAndSettle();
}

Future<void> openPayByCard(WidgetTester tester, TestApp app) async {
  await app.pump(tester);
  await openPayments(tester);
  await tester.tap(find.widgetWithText(PrimaryButton, l.payByCard));
  await tester.pumpAndSettle();
}

Future<void> chooseFile(WidgetTester tester, TestApp app, PickedReceipt? file, {String? source}) async {
  app.receiptFile = file;
  await tester.ensureVisible(find.byType(UploadBox));
  await tester.tap(find.byType(UploadBox));
  await tester.pumpAndSettle();
  await tester.tap(find.text(source ?? l.receiptFromGallery));
  await tester.pumpAndSettle();
}

Future<void> send(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(PrimaryButton, l.receiptSend));
  await tester.pumpAndSettle();
}

void main() {
  group('a receipt\'s file', () {
    test('is known by its first bytes, whatever it is called', () {
      expect(sniffReceiptType(fileBytes('png')), 'png');
      expect(sniffReceiptType(fileBytes('jpg')), 'jpg');
      expect(sniffReceiptType(fileBytes('pdf')), 'pdf');
      expect(sniffReceiptType(fileBytes('exe')), isNull);
      expect(sniffReceiptType(Uint8List(0)), isNull);
    });

    test('a program renamed to .jpg is refused; so are 6 MB and an empty file', () {
      ReceiptFailure? refused(Uint8List bytes) {
        try {
          checkReceiptFile(bytes);
          return null;
        } on ReceiptException catch (error) {
          return error.failure;
        }
      }

      expect(refused(fileBytes('exe')), ReceiptFailure.fileType);
      expect(refused(fileBytes('jpg', length: 6 * 1024 * 1024)), ReceiptFailure.fileTooLarge);
      expect(refused(fileBytes('jpg', length: receiptMaxBytes)), isNull);
      expect(refused(fileBytes('jpg', length: receiptMaxBytes + 1)), ReceiptFailure.fileTooLarge);
      expect(refused(Uint8List(0)), ReceiptFailure.fileEmpty);
      expect(checkReceiptFile(fileBytes('pdf')), 'pdf');
    });

    test('sizes and card numbers are written as people read them', () {
      expect(fileSize(1258291, l), '1,2 MB');
      expect(fileSize(1258291, l10n('en')), '1.2 MB');
      expect(fileSize(348000, l), '340 KB');
      expect(groupCard('8600123456789012'), '8600 1234 5678 9012');
      expect(MoneyInputFormatter.group('0600000'), '600 000');
      expect(MoneyInputFormatter.group('1250000'), '1 250 000');
    });
  });

  group('Pay by card', () {
    testWidgets('what is due, the centre\'s card and the instructions; the amount is filled in', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      expect(find.byType(PayByCardPage), findsOneWidget);
      expect(find.text(l.amountDue), findsOneWidget);
      expect(find.text('600 000 soʻm'), findsOneWidget);
      expect(find.widgetWithText(Pill, 'Dekabr'), findsOneWidget);
      expect(find.text('Kapitalbank'), findsOneWidget);
      expect(find.text('8600 1234 5678 9012'), findsOneWidget);
      expect(find.text('SEON TOPIK MCHJ'), findsOneWidget);
      // Without the centre's own instructions: the two plain steps.
      expect(find.text('1. ${l.payStep1}\n2. ${l.payStep2}'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField).first).controller!.text, '600 000');
      // Today, in Tashkent.
      expect(find.text('26.11.2026'), findsOneWidget);
    });

    testWidgets('the centre\'s own instructions are shown in the app\'s language', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      app.receipts.info = samplePayInfo(instructions: const {'uz': 'Click yoki Payme orqali oʻtkazing.', 'en': 'Transfer with Click or Payme.'});
      await openPayByCard(tester, app);
      expect(find.text('Click yoki Payme orqali oʻtkazing.'), findsOneWidget);
      expect(find.text('Transfer with Click or Payme.'), findsNothing);
    });

    testWidgets('Copy puts the card number on the clipboard', (tester) async {
      useScreen(tester, phone);
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      final app = debtor();
      await openPayByCard(tester, app);
      await tester.tap(find.text(l.cardCopy));
      await tester.pumpAndSettle();
      expect(copied, '8600123456789012');
      expect(find.text(l.cardCopied), findsOneWidget);
    });

    testWidgets('a program renamed to .jpg is refused when it is chosen', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      await chooseFile(tester, app, PickedReceipt(name: 'chek.jpg', bytes: fileBytes('exe')));
      expect(find.text(l.receiptErrorType), findsOneWidget);
      expect(find.byType(ChosenFile), findsNothing);
      expect(find.byType(UploadBox), findsOneWidget);
      // Nothing to send.
      await send(tester);
      expect(app.receipts.drafts, isEmpty);
    });

    testWidgets('a 6 MB file is refused when it is chosen', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      await chooseFile(
        tester,
        app,
        PickedReceipt(
          name: 'katta.pdf',
          bytes: fileBytes('pdf', length: 6 * 1024 * 1024),
        ),
        source: l.receiptFromFile,
      );
      expect(app.receiptSource, ReceiptSource.file);
      expect(find.text(l.receiptErrorTooLarge), findsOneWidget);
      expect(find.byType(ChosenFile), findsNothing);
    });

    testWidgets('a chosen file shows its name and size and can be taken away', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      await chooseFile(tester, app, sampleReceiptFile(), source: l.receiptFromCamera);
      expect(app.receiptSource, ReceiptSource.camera);
      expect(find.text('chek_dekabr.jpg'), findsOneWidget);
      expect(find.text('1,2 MB'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(l.receiptRemoveFile));
      await tester.pumpAndSettle();
      expect(find.byType(ChosenFile), findsNothing);
      // Backing out of the picker leaves things as they were.
      await chooseFile(tester, app, null);
      expect(find.byType(UploadBox), findsOneWidget);
      expect(find.byType(ErrorLine), findsNothing);
    });

    testWidgets('Send uploads the receipt: amount, day, group and comment; then My receipts shows it being checked', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      await chooseFile(tester, app, sampleReceiptFile());
      await tester.enterText(find.byType(TextField).first, '550000');
      await tester.enterText(find.byType(TextField).last, 'Dekabr uchun');
      await tester.pumpAndSettle();
      await send(tester);

      final draft = app.receipts.drafts.single;
      expect((draft.amount, draft.paidOn, draft.groupId, draft.comment, draft.file.name), (550000, '2026-11-26', 'g-1', 'Dekabr uchun', 'chek_dekabr.jpg'));
      expect(find.byType(MyReceiptsPage), findsOneWidget);
      expect(find.text(l.receiptSent), findsOneWidget);
      expect(find.text('550 000 soʻm'), findsOneWidget);
      expect(find.widgetWithText(Pill, l.receiptPending), findsOneWidget);
    });

    testWidgets('an amount is needed; what the server refuses is said, and a refused file is not offered again', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      await chooseFile(tester, app, sampleReceiptFile());
      await tester.enterText(find.byType(TextField).first, '');
      await tester.pumpAndSettle();
      await send(tester);
      expect(find.text(l.receiptErrorAmount), findsOneWidget);
      expect(app.receipts.drafts, isEmpty);

      await tester.enterText(find.byType(TextField).first, '600000');
      app.receipts.failure = const ReceiptException(ReceiptFailure.fileType);
      await send(tester);
      expect(find.text(l.receiptErrorType), findsOneWidget);
      expect(find.byType(ChosenFile), findsNothing);
      expect(find.byType(PayByCardPage), findsOneWidget);
    });

    testWidgets('without a card, or anywhere to send receipts, the page says to pay at reception', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      app.receipts.info = samplePayInfo(card: false);
      await openPayByCard(tester, app);
      expect(find.text(l.payByCardOff), findsOneWidget);
      expect(find.byType(UploadBox), findsNothing);
    });
  });

  group('My receipts', () {
    testWidgets('every receipt with its month, amount and the centre\'s answer', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
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
      await app.pump(tester);
      await openPayments(tester);
      await tester.tap(find.text(l.myReceipts));
      await tester.pumpAndSettle();
      expect(find.byType(ReceiptCard), findsNWidgets(3));
      expect(find.text('Dekabr'), findsOneWidget);
      expect(find.widgetWithText(Pill, l.receiptPending), findsOneWidget);
      expect(find.widgetWithText(Pill, l.receiptApproved), findsOneWidget);
      expect(find.widgetWithText(Pill, l.receiptRejected('summa toʻliq emas')), findsOneWidget);
    });

    testWidgets('none yet says so', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await app.pump(tester);
      await openPayments(tester);
      await tester.tap(find.text(l.myReceipts));
      await tester.pumpAndSettle();
      expect(find.text(l.receiptsEmpty), findsOneWidget);
    });

    testWidgets('once the centre approves, the receipt says so and the balance is paid', (tester) async {
      useScreen(tester, phone);
      final app = debtor();
      await openPayByCard(tester, app);
      await chooseFile(tester, app, sampleReceiptFile());
      await send(tester);
      expect(find.widgetWithText(Pill, l.receiptPending), findsOneWidget);

      // A manager approves it in the CRM: exactly one payment of 600 000.
      app.receipts.approve('receipt-1');
      await tester.drag(find.byType(ReceiptCard), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(Pill, l.receiptApproved), findsOneWidget);

      // Back on Payments the debt is gone.
      await tester.tap(find.bySemanticsLabel(l.back));
      await tester.pumpAndSettle();
      expect(find.byType(PaymentsPage), findsOneWidget);
      await tester.drag(find.byType(BalanceCard), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byType(BalanceCard), matching: find.text(l.balancePaid)), findsOneWidget);
    });
  });
}
