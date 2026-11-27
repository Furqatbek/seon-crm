// Vouchers and free open lessons in the app — docs/STUDENT_APP_SPEC.md →
// "Rules → Vouchers" and "Rules → Free open lessons".
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/data/home.dart';
import 'package:student/data/offers.dart';
import 'package:student/features/home/app_user_home.dart';
import 'package:student/features/more/sub_page.dart';
import 'package:student/features/offers/offers.dart';
import 'package:student/ui/widgets.dart';

import 'support/fake_offers.dart';
import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

TestApp appUserApp({HomeVoucher? voucher}) {
  final app = TestApp(
    auth: FakeAuthRepository(signedIn: true, profile: appUserProfile),
    home: FakeHomeRepository(appUser: AppUserHome(lockedCoins: 34, voucher: voucher)),
  );
  app.offers.voucherValue = voucher;
  return app;
}

Future<void> openRow(WidgetTester tester, String label) async {
  await tester.tap(find.bySemanticsLabel(l.tabMore).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.widgetWithText(ListRow, label));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ListRow, label));
  await tester.pumpAndSettle();
}

Future<void> tapButton(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  group('My voucher', () {
    testWidgets('what it gives, its code, until when, and what to do with it', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp(voucher: sampleVoucher());
      await app.pump(tester);
      await openRow(tester, l.myVoucher);
      expect(find.byType(VoucherTicket), findsOneWidget);
      expect(find.text('Birinchi oyga 20% chegirma'), findsOneWidget);
      expect(find.text('KOR-7F3K9'), findsOneWidget);
      expect(find.text(keepTogether('7-dekabrgacha')), findsOneWidget);
      expect(find.text(l.voucherTellCode), findsOneWidget);
      expect(find.text(l.voucherOnePerPerson), findsOneWidget);
    });

    testWidgets('Copy puts the code on the clipboard and says so', (tester) async {
      useScreen(tester, phone);
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      final app = appUserApp(voucher: sampleVoucher());
      await app.pump(tester);
      await openRow(tester, l.myVoucher);
      await tester.tap(find.bySemanticsLabel(l.voucherCopy));
      await tester.pumpAndSettle();
      expect(copied, 'KOR-7F3K9');
      expect(find.text(l.voucherCopied), findsOneWidget);
    });

    testWidgets('each kind is put in words; a used or expired voucher says so', (tester) async {
      useScreen(tester, phone);
      for (final (voucher, offer, state) in [
        (sampleVoucher(kind: 'fixed', value: 100000), 'Birinchi oyga 100 000 soʻm chegirma', keepTogether('7-dekabrgacha')),
        (sampleVoucher(kind: 'trial_week', value: 7), l.voucherTrialWeek, keepTogether('7-dekabrgacha')),
        (sampleVoucher(status: 'redeemed'), 'Birinchi oyga 20% chegirma', l.voucherUsed),
        (sampleVoucher(status: 'expired'), 'Birinchi oyga 20% chegirma', l.voucherExpired),
        // Past its date, even before the server's hourly job has said so.
        (sampleVoucher(expiresAt: DateTime.utc(2026, 11, 25)), 'Birinchi oyga 20% chegirma', l.voucherExpired),
      ]) {
        await tester.pumpWidget(
          themed(
            Padding(
              padding: const EdgeInsets.all(16),
              child: VoucherTicket(
                voucher: voucher.expiresAt.isBefore(testNow) ? sampleVoucher(status: 'expired', expiresAt: voucher.expiresAt) : voucher,
              ),
            ),
          ),
        );
        expect(find.text(offer), findsWidgets);
        expect(find.text(state), findsOneWidget);
        // Only a voucher that can be used tells the person to say its code.
        expect(find.text(l.voucherTellCode), voucher.status == 'issued' && voucher.expiresAt.isAfter(testNow) ? findsOneWidget : findsNothing);
      }
    });

    testWidgets('without one, the page says how to get it', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      await app.pump(tester);
      await openRow(tester, l.myVoucher);
      expect(find.text(l.voucherEmpty), findsOneWidget);
      expect(find.byType(VoucherTicket), findsNothing);
    });
  });

  group('Open lessons', () {
    testWidgets('the next four weeks for the person\'s level, with the seats left', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      expect(find.byType(OpenLessonsPage), findsOneWidget);
      // A TOPIK I person: the four Saturdays; the TOPIK II lesson is a tap away.
      expect(find.byType(SessionCard, skipOffstage: false), findsNWidgets(4));
      expect(find.text('Shanba, 28-noyabr'), findsOneWidget);
      expect(find.text('11:00–12:30'), findsWidgets);
      expect(find.text('TOPIK I · 101-xona · Malika Tursunova'), findsWidgets);
      expect(find.text(l.openLessonSeatsLeft(6)), findsWidgets);
      await tester.tap(find.text(l.levelTopik2));
      await tester.pumpAndSettle();
      expect(find.byType(SessionCard, skipOffstage: false), findsOneWidget);
      expect(find.text('18:30–19:30'), findsOneWidget);
      expect(find.text(l.openLessonSeatsLeft(3)), findsOneWidget);
    });

    testWidgets('a full lesson cannot be booked', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      app.offers.sessions = [app.offers.sessions[2]];
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      expect(find.text(l.openLessonFull), findsOneWidget);
      expect(find.text(l.openLessonBook), findsNothing);
    });

    testWidgets('Book takes a seat: the sheet confirms it, then the booking shows with Cancel', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      await tapButton(tester, find.widgetWithText(PrimaryButton, l.openLessonBook));
      expect(find.byType(BookedSheet), findsOneWidget);
      expect(find.text(l.openLessonBooked), findsOneWidget);
      expect(find.descendant(of: find.byType(BookedSheet), matching: find.text('Shanba, 28-noyabr · 11:00–12:30')), findsOneWidget);
      expect(find.descendant(of: find.byType(BookedSheet), matching: find.text(l.openLessonCancelHint)), findsOneWidget);
      await tester.tap(find.widgetWithText(PrimaryButton, l.done));
      await tester.pumpAndSettle();

      expect(app.offers.booking?.date, '2026-11-28');
      expect(find.byType(BookingCard), findsOneWidget);
      expect(find.text(l.openLessonSeatsLeft(5)), findsNothing);
      // One active booking: no other lesson offers Book, and the page says why.
      expect(find.text(l.openLessonBook), findsNothing);
      expect(find.text(l.openLessonOneBooking), findsOneWidget);
      expect(find.widgetWithText(Pill, l.openLessonYours), findsOneWidget);
    });

    testWidgets('Cancel frees the seat and Book is back', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      app.offers.bookNow('slot-sat', '2026-11-28');
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      await tapButton(tester, find.widgetWithText(SecondaryButton, l.openLessonCancel));
      expect(app.offers.booking, isNull);
      expect(find.text(l.openLessonCancelled), findsOneWidget);
      expect(find.byType(BookingCard), findsNothing);
      expect(find.text(l.openLessonBook), findsWidgets);
      expect(app.offers.sessions.first.seatsLeft, 6);
    });

    testWidgets('inside the last two hours there is no Cancel, and the server refuses one', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      final booking = app.offers.bookNow('slot-sat', '2026-11-28');
      // 09:30 on the day: the lesson starts at 11:00.
      app.now = DateTime.utc(2026, 11, 28, 4, 30);
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      expect(find.byType(BookingCard), findsOneWidget);
      expect(find.text(l.openLessonCancel), findsNothing);
      expect(find.text(l.openLessonCancelClosed), findsOneWidget);
      await expectLater(app.offers.cancel(booking.id), throwsA(isA<OfferException>().having((error) => error.failure, 'failure', OfferFailure.tooLate)));
      expect(app.offers.booking, isNotNull);
      // Two hours and a minute before, it still could be.
      app.now = DateTime.utc(2026, 11, 28, 3, 59);
      await app.offers.cancel(booking.id);
      expect(app.offers.booking, isNull);
    });

    testWidgets('a second booking is refused by the server, whatever the screen showed', (tester) async {
      final offers = FakeOfferRepository(now: () => testNow);
      await offers.book('slot-sat', '2026-11-28');
      await expectLater(
        offers.book('slot-sat', '2026-12-05'),
        throwsA(isA<OfferException>().having((error) => error.failure, 'failure', OfferFailure.alreadyBooked)),
      );
      await expectLater(
        offers.book('slot-sat', '2026-11-28'),
        throwsA(isA<OfferException>().having((error) => error.failure, 'failure', OfferFailure.alreadyBooked)),
      );
    });

    testWidgets('the last seat taken by someone else meanwhile: the person is told, and the list is read again', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      // Someone else takes every seat of the first Saturday.
      final first = app.offers.sessions.first;
      app.offers.sessions[0] = OpenLessonSession(
        slotId: first.slotId,
        date: first.date,
        title: first.title,
        level: first.level,
        startsAt: first.startsAt,
        durationMin: first.durationMin,
        room: first.room,
        teacher: first.teacher,
        seats: 10,
        seatsLeft: 0,
      );
      await tapButton(tester, find.widgetWithText(PrimaryButton, l.openLessonBook));
      expect(find.text(l.openLessonErrorFull), findsOneWidget);
      expect(find.byType(BookedSheet), findsNothing);
      expect(app.offers.booking, isNull);
      expect(find.text(l.openLessonFull), findsWidgets);
    });

    testWidgets('no lessons in the next four weeks says so', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      app.offers.sessions = [];
      await app.pump(tester);
      await openRow(tester, l.openLessons);
      expect(find.text(l.openLessonsEmpty), findsOneWidget);
    });
  });

  group('Home for an App user', () {
    testWidgets('the voucher card opens My voucher', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp(voucher: sampleVoucher());
      await app.pump(tester);
      expect(find.byType(VoucherCard), findsOneWidget);
      await tapButton(tester, find.byType(VoucherCard));
      expect(find.byType(VoucherPage), findsOneWidget);
      expect(find.byType(VoucherTicket), findsOneWidget);
    });

    testWidgets('the next free open lesson, with Book leading to the lessons', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      await app.pump(tester);
      final card = find.byType(OpenLessonCard);
      expect(find.descendant(of: card, matching: find.text('Shanba, 28-noyabr · 11:00–12:30')), findsOneWidget);
      await tapButton(tester, find.widgetWithText(PrimaryButton, l.bookOpenLesson));
      expect(find.byType(OpenLessonsPage), findsOneWidget);
    });

    testWidgets('with a booking, the card shows it instead', (tester) async {
      useScreen(tester, phone);
      final app = appUserApp();
      app.offers.bookNow('slot-sat', '2026-12-05');
      await app.pump(tester);
      final card = find.byType(OpenLessonCard);
      expect(find.descendant(of: card, matching: find.text(l.openLessonYours)), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Shanba, 5-dekabr · 11:00–12:30')), findsOneWidget);
      // Cancelling is on the lessons page, not on Home.
      expect(find.descendant(of: card, matching: find.text(l.openLessonCancel)), findsNothing);
      expect(find.text(l.bookOpenLesson), findsNothing);
    });
  });
}
