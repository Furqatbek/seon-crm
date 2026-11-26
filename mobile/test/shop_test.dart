// The Shop — docs/STUDENT_APP_SPEC.md → "App behaviour → Shop".
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/data/shop.dart';
import 'package:student/features/shop/orders_page.dart';
import 'package:student/features/shop/product_page.dart';
import 'package:student/features/shop/shop_tab.dart';
import 'package:student/ui/widgets.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

FakeAuthRepository student() => FakeAuthRepository(signedIn: true, profile: studentProfile);
FakeAuthRepository appUser() => FakeAuthRepository(signedIn: true, profile: appUserProfile);

Future<TestApp> openShop(WidgetTester tester, FakeAuthRepository auth) async {
  useScreen(tester, phone);
  final app = TestApp(auth: auth);
  await app.pump(tester);
  await tester.tap(find.bySemanticsLabel(l.tabShop).last);
  await tester.pumpAndSettle();
  return app;
}

Future<void> openItem(WidgetTester tester, String name) async {
  await tester.scrollUntilVisible(find.text(name), 200, scrollable: find.byType(Scrollable).last);
  await tester.ensureVisible(find.text(name));
  await tester.pumpAndSettle();
  await tester.tap(find.text(name));
  await tester.pumpAndSettle();
}

ShopVariant sizeOf(TestApp app, String name) =>
    app.shop.shopItems.firstWhere((item) => item.id == 'r-shirt').variants.firstWhere((variant) => variant.names['uz'] == name);

void main() {
  group('the grid', () {
    testWidgets('a student sees prices, stock, their coins and how many more they need', (tester) async {
      await openShop(tester, student());
      expect(find.byType(ShopTab), findsOneWidget);
      expect(find.text('128 tanga'), findsOneWidget);
      // Two orders are still on their way.
      expect(find.text(l.myOrders), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
      expect(find.text('Ruchka toʻplami'), findsOneWidget);
      expect(find.text('25'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Kino chiptasi'), 200, scrollable: find.byType(Scrollable).last);
      await tester.drag(find.byType(Scrollable).last, const Offset(0, -200));
      await tester.pumpAndSettle();
      // 150 coins with 128: 22 more. Sold out says so instead.
      expect(find.text(l.moreCoinsNeeded('22 tanga')), findsOneWidget);
      expect(find.text(l.soldOut), findsOneWidget);
      expect(find.text(l.moreCoinsNeeded('72 tanga')), findsNothing);
    });

    testWidgets('an App user browses only: the banner, the locked balance, no orders and no Order button', (tester) async {
      final app = await openShop(tester, appUser());
      expect(find.text(l.shopJoinBanner), findsOneWidget);
      expect(find.text(l.freeLesson), findsOneWidget);
      expect(find.text('34'), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      expect(find.text(l.myOrders), findsNothing);
      expect(find.textContaining('kerak'), findsNothing);

      await openItem(tester, 'Ruchka toʻplami');
      expect(find.byType(ProductPage), findsOneWidget);
      expect(find.text(l.orderAction), findsNothing);
      expect(find.text(l.shopJoinBanner), findsOneWidget);
      // And the server would refuse them anyway.
      await expectLater(
        app.shop.order(rewardId: 'r-pens', requestKey: 'k'),
        throwsA(isA<ShopException>().having((error) => error.failure, 'failure', ShopFailure.notAllowed)),
      );
      expect(app.shop.shopOrders, hasLength(3));
    });

    testWidgets('with nothing on offer it says so', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student());
      app.shop.shopItems = [];
      await app.pump(tester);
      await tester.tap(find.bySemanticsLabel(l.tabShop).last);
      await tester.pumpAndSettle();
      expect(find.text(l.shopEmpty), findsOneWidget);
      expect(find.text(l.myOrders), findsOneWidget);
    });
  });

  group('ordering', () {
    testWidgets('a variant is chosen first; one that is sold out cannot be', (tester) async {
      await openShop(tester, student());
      await openItem(tester, 'Brendli futbolka');
      expect(find.text('100 tanga'), findsOneWidget);
      expect(find.text(l.chooseVariant), findsOneWidget);

      // Nothing chosen: Order does nothing.
      await tester.tap(find.widgetWithText(PrimaryButton, l.orderAction));
      await tester.pumpAndSettle();
      expect(find.byType(ConfirmOrderSheet), findsNothing);

      // L is sold out.
      await tester.tap(find.widgetWithText(Pill, 'L'), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.text(l.chooseVariant), findsOneWidget);

      await tester.tap(find.widgetWithText(Pill, 'M'));
      await tester.pumpAndSettle();
      expect(find.text('M: ${l.unitsLeft(3)}'), findsOneWidget);
      await tester.tap(find.widgetWithText(Pill, 'XL'));
      await tester.pumpAndSettle();
      expect(find.text('XL: ${l.unitsLeft(2)}'), findsOneWidget);
    });

    testWidgets('the sheet shows the balance before and after; confirming holds the coins and one unit', (tester) async {
      final app = await openShop(tester, student());
      await openItem(tester, 'Brendli futbolka');
      await tester.tap(find.widgetWithText(Pill, 'M'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(PrimaryButton, l.orderAction));
      await tester.pumpAndSettle();

      final sheet = find.byType(ConfirmOrderSheet);
      expect(find.descendant(of: sheet, matching: find.text('${l.shopVariant}: M')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text(l.balanceNow)), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text('128 tanga')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text(l.balanceAfter)), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text('28 tanga')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text(l.pickupNote)), findsOneWidget);

      await tester.tap(find.widgetWithText(PrimaryButton, l.confirm));
      await tester.pumpAndSettle();

      // On My orders, with the new order first.
      expect(find.byType(OrdersPage), findsOneWidget);
      expect(find.text(l.orderPlaced), findsOneWidget);
      expect(app.shop.shopOrders.first.title('uz'), 'Brendli futbolka (M)');
      expect(app.shop.shopOrders.first.status, OrderStatus.requested);
      expect(app.home.home['coins'], 28);
      expect(sizeOf(app, 'M').stock, 2);

      // Back in the shop the balance has followed.
      await tester.pump(const Duration(seconds: 5));
      await tester.tap(find.bySemanticsLabel(l.back));
      await tester.pumpAndSettle();
      expect(find.text('28 tanga'), findsOneWidget);
      await tester.drag(find.byType(Scrollable).last, const Offset(0, 600));
      await tester.pumpAndSettle();
      expect(find.text('3'), findsOneWidget);
    });

    testWidgets('Cancel in the sheet orders nothing', (tester) async {
      final app = await openShop(tester, student());
      await openItem(tester, 'Ruchka toʻplami');
      await tester.tap(find.widgetWithText(PrimaryButton, l.orderAction));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(SecondaryButton, l.cancel));
      await tester.pumpAndSettle();
      expect(find.byType(ProductPage), findsOneWidget);
      expect(app.shop.shopOrders, hasLength(3));
      expect(app.home.home['coins'], 128);
    });

    testWidgets('when the last unit went to someone else, the sheet says so and nothing is taken', (tester) async {
      final app = await openShop(tester, student());
      await openItem(tester, 'Brendli futbolka');
      await tester.tap(find.widgetWithText(Pill, 'M'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(PrimaryButton, l.orderAction));
      await tester.pumpAndSettle();
      // Meanwhile the server ran out.
      app.shop.failure = const ShopException(ShopFailure.soldOut);
      await tester.tap(find.widgetWithText(PrimaryButton, l.confirm));
      await tester.pumpAndSettle();
      expect(find.byType(ConfirmOrderSheet), findsOneWidget);
      expect(find.text(l.shopErrorSoldOut), findsOneWidget);
      expect(app.home.home['coins'], 128);
    });

    testWidgets('an item that costs more than their coins cannot be ordered', (tester) async {
      await openShop(tester, student());
      await openItem(tester, 'Kino chiptasi');
      expect(find.text(l.moreCoinsNeeded('22 tanga')), findsOneWidget);
      await tester.tap(find.widgetWithText(PrimaryButton, l.orderAction));
      await tester.pumpAndSettle();
      expect(find.byType(ConfirmOrderSheet), findsNothing);
    });
  });

  group('My orders', () {
    Future<TestApp> openOrders(WidgetTester tester) async {
      final app = await openShop(tester, student());
      await tester.tap(find.text(l.myOrders));
      await tester.pumpAndSettle();
      return app;
    }

    testWidgets('each order shows where it stands; only a Requested one can be cancelled', (tester) async {
      await openOrders(tester);
      expect(find.byType(OrderCard), findsNWidgets(3));
      expect(find.text('Brendli futbolka (M)'), findsOneWidget);
      expect(find.widgetWithText(Pill, l.orderRequested), findsOneWidget);
      expect(find.byType(OrderSteps), findsOneWidget);
      expect(find.text(l.pickupNow), findsOneWidget);
      expect(find.text(l.givenOn('2-noyabr')), findsOneWidget);
      expect(find.text(l.cancel), findsOneWidget);
    });

    testWidgets('Cancel returns the coins and the unit of stock', (tester) async {
      final app = await openOrders(tester);
      final before = (app.home.home['coins'] as int);
      await tester.tap(find.text(l.cancel));
      await tester.pumpAndSettle();
      expect(app.shop.shopOrders.first.status, OrderStatus.cancelled);
      expect(app.home.home['coins'], before + 25);
      expect(find.text(l.orderCancelDone), findsOneWidget);
      expect(find.text(l.orderCancelled), findsOneWidget);
      expect(find.text(l.cancel), findsNothing);
    });

    testWidgets('an order the centre made Ready a moment ago can no longer be cancelled', (tester) async {
      final app = await openOrders(tester);
      // The app has not heard yet: the server refuses.
      app.shop.failure = const ShopException(ShopFailure.tooLate);
      await tester.tap(find.text(l.cancel));
      await tester.pumpAndSettle();
      expect(find.text(l.shopErrorTooLate), findsOneWidget);
      expect(app.home.home['coins'], 128);
    });

    testWidgets('the list follows the centre: Ready, then Given, and a rejection with its reason', (tester) async {
      final app = await openOrders(tester);
      app.shop.markReady('o-3');
      await tester.pumpAndSettle();
      expect(find.byType(OrderSteps), findsNWidgets(2));
      expect(find.text(l.cancel), findsNothing);

      app.shop.give('o-3');
      await tester.pumpAndSettle();
      expect(find.byType(OrderSteps), findsOneWidget);
      expect(find.text(l.givenOn('26-noyabr')), findsOneWidget);

      app.shop.reject('o-2', 'Bu oʻlcham qolmadi');
      await tester.pumpAndSettle();
      expect(find.byType(OrderSteps), findsNothing);
      expect(find.text(l.orderRejected), findsOneWidget);
      expect(find.text('Bu oʻlcham qolmadi · ${l.coinsReturned}'), findsOneWidget);
      expect(app.home.home['coins'], 228);
    });

    testWidgets('with no orders it says so', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: student());
      app.shop.shopOrders = [];
      await app.pump(tester);
      await tester.tap(find.bySemanticsLabel(l.tabShop).last);
      await tester.pumpAndSettle();
      await tester.tap(find.text(l.myOrders));
      await tester.pumpAndSettle();
      expect(find.text(l.ordersEmpty), findsOneWidget);
    });
  });

  test('the server\'s refusals are read from their codes', () {
    expect(ShopException.fromCode('ER001')?.failure, ShopFailure.notEnoughCoins);
    expect(ShopException.fromCode('ER002')?.failure, ShopFailure.soldOut);
    expect(ShopException.fromCode('ER006')?.failure, ShopFailure.chooseVariant);
    expect(ShopException.fromCode('ER007')?.failure, ShopFailure.tooLate);
    expect(ShopException.fromCode('42501')?.failure, ShopFailure.notAllowed);
    expect(ShopException.fromCode('XX000'), isNull);
  });
}
