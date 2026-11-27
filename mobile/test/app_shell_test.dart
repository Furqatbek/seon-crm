// The five-tab shell, language and appearance, the push token and what a
// tapped notification opens.
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/core/router.dart';
import 'package:student/core/state.dart';
import 'package:student/data/models.dart';
import 'package:student/features/auth/welcome_screen.dart';
import 'package:student/features/notifications/notifications_screen.dart';
import 'package:student/features/more/money_pages.dart';
import 'package:student/features/shop/orders_page.dart';
import 'package:student/features/tabs/tabs.dart';
import 'package:student/push/notification_routes.dart';
import 'package:student/ui/theme.dart';
import 'package:student/ui/tokens.dart';
import 'package:student/ui/widgets.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

final l = l10n('uz');
const phone = Size(390, 844);

ProviderContainer containerOf(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(StudentApp)));

FakeAuthRepository signedIn(Profile profile) => FakeAuthRepository(signedIn: true, profile: profile);

void main() {
  group('tab shell', () {
    testWidgets('opens on Home with five tabs: Home, Game, the raised QR, Shop and More', (tester) async {
      useScreen(tester, phone);
      await TestApp(auth: signedIn(studentProfile)).pump(tester);
      expect(find.byType(HomeTab), findsOneWidget);
      for (final label in [l.tabHome, l.tabGame, l.tabQr, l.tabShop, l.tabMore]) {
        expect(find.bySemanticsLabel(label), findsWidgets);
      }
      // The QR button stands above the bar's top edge.
      final qr = tester.getRect(find.byIcon(Icons.qr_code_2).last);
      final home = tester.getRect(find.byIcon(Icons.home_outlined).last);
      expect(qr.top, lessThan(home.top));
      expect(qr.center.dx, closeTo(phone.width / 2, 1));
    });

    testWidgets('each tab shows the Student version to a linked student', (tester) async {
      useScreen(tester, phone);
      await TestApp(auth: signedIn(studentProfile)).pump(tester);
      final expected = {l.tabGame: l.gamePlayNow, l.tabQr: l.qrShowAtReception, l.tabShop: l.myOrders};
      for (final tab in expected.entries) {
        await tester.tap(find.bySemanticsLabel(tab.key).last);
        await tester.pumpAndSettle();
        expect(find.text(tab.value), findsOneWidget, reason: tab.key);
      }
    });

    testWidgets('each tab shows the App user version to someone who is not linked', (tester) async {
      useScreen(tester, phone);
      await TestApp(auth: signedIn(appUserProfile)).pump(tester);
      final expected = {l.tabGame: l.gameNoCoinsAppUser, l.tabQr: l.qrLockedTitle, l.tabShop: l.shopJoinBanner};
      for (final tab in expected.entries) {
        await tester.tap(find.bySemanticsLabel(tab.key).last);
        await tester.pumpAndSettle();
        expect(find.text(tab.value), findsOneWidget, reason: tab.key);
        expect(find.byType(EmptyState), findsNothing);
      }
    });

    testWidgets('an account linked by staff meanwhile shows the Student version when the app comes back to the front', (tester) async {
      useScreen(tester, phone);
      final auth = signedIn(appUserProfile);
      await TestApp(auth: auth).pump(tester);
      await tester.tap(find.bySemanticsLabel(l.tabQr).last);
      await tester.pumpAndSettle();
      expect(find.text(l.qrLockedTitle), findsOneWidget);
      // Staff enrol the person; the phone was in a pocket.
      auth.profile = studentProfile;
      for (final state in [
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
        AppLifecycleState.hidden,
        AppLifecycleState.inactive,
        AppLifecycleState.resumed,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
      }
      await tester.pumpAndSettle();
      expect(find.text(l.qrLockedTitle), findsNothing);
    });

    testWidgets('signed out, every screen of the app leads to Welcome', (tester) async {
      useScreen(tester, phone);
      await TestApp().pump(tester);
      expect(find.byType(WelcomeScreen), findsOneWidget);
      containerOf(tester).read(routerProvider).go(Routes.shop);
      await tester.pumpAndSettle();
      expect(find.byType(WelcomeScreen), findsOneWidget);
    });

    test('the router sends signed-out people to Welcome and signed-in people past the sign-in flow', () {
      for (final path in [Routes.home, Routes.game, Routes.qr, Routes.shop, Routes.more, Routes.linked, Routes.newPassword, Routes.notifications]) {
        expect(redirectFor(signedIn: false, path: path), Routes.welcome, reason: path);
        expect(redirectFor(signedIn: true, path: path), isNull, reason: path);
      }
      for (final path in [Routes.welcome, Routes.signUp, Routes.signIn, Routes.forgot]) {
        expect(redirectFor(signedIn: false, path: path), isNull, reason: path);
        expect(redirectFor(signedIn: true, path: path), Routes.home, reason: path);
      }
      // The code screen signs the person in while it is showing; the policy is for everyone.
      for (final path in [Routes.code, Routes.privacy]) {
        expect(redirectFor(signedIn: false, path: path), isNull);
        expect(redirectFor(signedIn: true, path: path), isNull);
      }
    });

    testWidgets('the session persists: a signed-in person opens straight on Home', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(appUserProfile));
      await app.pump(tester);
      expect(find.byType(WelcomeScreen), findsNothing);
      expect(find.byType(HomeTab), findsOneWidget);
      expect(app.auth.calls, isEmpty);
    });

    testWidgets('nothing overflows at 200% text size, on either phone, in any language', (tester) async {
      for (final size in const [Size(390, 844), Size(412, 915)]) {
        for (final language in supportedLanguages) {
          useScreen(tester, size, textScale: 2);
          await TestApp(auth: signedIn(studentProfile), preferences: {'language': language}).pump(tester);
          expect(tester.takeException(), isNull, reason: '$size $language shell');
          await tester.pumpWidget(const SizedBox());
          await TestApp(preferences: {'language': language}).pump(tester);
          expect(tester.takeException(), isNull, reason: '$size $language welcome');
          await tester.tap(find.byType(PrimaryButton));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: '$size $language sign-up');
          await tester.pumpWidget(const SizedBox());
        }
      }
    });
  });

  group('language', () {
    testWidgets('the first launch takes the phone\'s language when it is one of the four', (tester) async {
      useScreen(tester, phone);
      await TestApp(deviceLanguage: 'ko').pump(tester);
      expect(find.text(l10n('ko').createAccount), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await TestApp(deviceLanguage: 'ru').pump(tester);
      expect(find.text(l10n('ru').createAccount), findsOneWidget);
    });

    testWidgets('any other phone language starts in Uzbek', (tester) async {
      useScreen(tester, phone);
      await TestApp(deviceLanguage: 'de').pump(tester);
      expect(find.text(l.createAccount), findsOneWidget);
    });

    testWidgets('a language chosen before wins over the phone\'s', (tester) async {
      useScreen(tester, phone);
      await TestApp(deviceLanguage: 'ko', preferences: {'language': 'en'}).pump(tester);
      expect(find.text(l10n('en').createAccount), findsOneWidget);
    });

    testWidgets('choosing a language on Welcome switches at once and is remembered', (tester) async {
      useScreen(tester, phone);
      final app = TestApp();
      await app.pump(tester);
      await tester.tap(find.bySemanticsLabel(l.chooseLanguage));
      await tester.pumpAndSettle();
      for (final name in [l.languageUz, l.languageRu, l.languageEn, l.languageKo]) {
        expect(find.text(name), findsOneWidget);
      }
      await tester.tap(find.text(l.languageKo));
      await tester.pumpAndSettle();
      expect(find.text(l10n('ko').createAccount), findsOneWidget);
      expect(find.text('KO'), findsOneWidget);
      expect(app.saved.getString('language'), 'ko');
    });

    testWidgets('signed in, the language is saved to the profile too', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(studentProfile));
      await app.pump(tester);
      await containerOf(tester).read(settingsProvider.notifier).setLanguage('ru');
      await tester.pumpAndSettle();
      expect(find.text(l10n('ru').tabHome), findsWidgets);
      expect(app.auth.savedLanguage, 'ru');
    });

    test('every language has every text', () {
      // gen-l10n fails the build on a missing key; this checks the four are really different.
      final home = {for (final code in supportedLanguages) l10n(code).tabHome};
      expect(home.length, 4);
    });
  });

  group('appearance', () {
    testWidgets('System follows the phone; Light and Dark force a theme', (tester) async {
      useScreen(tester, phone);
      Brightness shown() => Theme.of(tester.element(find.byType(WelcomeScreen))).brightness;

      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      await TestApp().pump(tester);
      expect(shown(), Brightness.dark);
      await tester.pumpWidget(const SizedBox());

      await TestApp(preferences: {'theme': 'light'}).pump(tester);
      expect(shown(), Brightness.light);
      await tester.pumpWidget(const SizedBox());

      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      await TestApp(preferences: {'theme': 'dark'}).pump(tester);
      expect(shown(), Brightness.dark);
    });

    testWidgets('a change is saved on the phone and to the profile', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(studentProfile));
      await app.pump(tester);
      await containerOf(tester).read(settingsProvider.notifier).setTheme('dark');
      await tester.pumpAndSettle();
      expect(Theme.of(tester.element(find.byType(HomeTab))).brightness, Brightness.dark);
      expect(app.saved.getString('theme'), 'dark');
      expect(app.auth.savedTheme, 'dark');
    });

    testWidgets('after signing in, the appearance saved in the profile is used', (tester) async {
      useScreen(tester, phone);
      const dark = Profile(id: 'p', fullName: 'Aziza', role: AccountRole.student, language: 'uz', theme: 'dark');
      final app = TestApp(auth: signedIn(dark));
      await app.pump(tester);
      expect(Theme.of(tester.element(find.byType(HomeTab))).brightness, Brightness.dark);
      expect(app.saved.getString('theme'), 'dark');
    });

    test('text colours keep at least 4.5:1 against their background, in both themes', () {
      double luminance(Color color) {
        double channel(double value) => value <= 0.03928 ? value / 12.92 : math.pow((value + 0.055) / 1.055, 2.4).toDouble();
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
      }

      double contrast(Color a, Color b) {
        final la = luminance(a), lb = luminance(b);
        return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
      }

      for (final c in [AppColors.light, AppColors.dark]) {
        for (final text in [c.text, c.textSecondary, c.primary, c.accentText, c.success, c.warning, c.danger]) {
          expect(contrast(text, c.bg), greaterThanOrEqualTo(4.5), reason: '$text on bg');
        }
        expect(contrast(c.onPrimaryFill, c.primaryFill), greaterThanOrEqualTo(4.5));
        // Text on cards and fields.
        for (final text in [c.text, c.textSecondary]) {
          expect(contrast(text, c.surface), greaterThanOrEqualTo(4.5), reason: '$text on surface');
        }
      }
    });

    test('the glow belongs to the dark theme only', () {
      expect(AppColors.light.glow, isEmpty);
      expect(AppColors.dark.glow, isNotEmpty);
      expect(appTheme(Brightness.dark).extension<AppColors>(), AppColors.dark);
      expect(appTheme(Brightness.light).extension<AppColors>(), AppColors.light);
    });
  });

  group('push', () {
    testWidgets('the token is saved to device_tokens after sign-in, with the platform and app version', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: FakeAuthRepository(profile: appUserProfile));
      await app.pump(tester);
      expect(app.tokens.saved, isEmpty);

      await tester.tap(find.widgetWithText(SecondaryButton, l.signIn));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '901234567');
      await tester.enterText(find.byType(TextField).at(1), 'parol1234');
      await tester.tap(find.widgetWithText(PrimaryButton, l.signIn));
      await tester.pumpAndSettle();

      expect(app.tokens.saved, {'device-token-1': (platform: 'android', appVersion: '1.0.0')});
    });

    testWidgets('a replaced token is saved while signed in', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(studentProfile));
      await app.pump(tester);
      app.push.refreshed.add('device-token-2');
      await tester.pumpAndSettle();
      expect(app.tokens.saved.keys, containsAll(['device-token-1', 'device-token-2']));
    });

    testWidgets('Log out removes the token before the session ends, and leads to Welcome', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(studentProfile));
      await app.pump(tester);
      expect(app.tokens.saved.keys, ['device-token-1']);

      await tester.tap(find.bySemanticsLabel(l.tabMore).last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(l.logOut));
      await tester.tap(find.text(l.logOut));
      await tester.pumpAndSettle();

      expect(app.tokens.removed, ['device-token-1']);
      expect(app.tokens.saved, isEmpty);
      expect(app.auth.calls, ['signOut']);
      expect(find.byType(WelcomeScreen), findsOneWidget);
    });

    testWidgets('without push (no Firebase yet) signing in and out still works', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(studentProfile), push: FakePush(deviceToken: null));
      await app.pump(tester);
      expect(app.tokens.saved, isEmpty);
      await containerOf(tester).read(authProvider.notifier).signOut();
      await tester.pumpAndSettle();
      expect(find.byType(WelcomeScreen), findsOneWidget);
    });

    testWidgets('tapping a notification opens its screen', (tester) async {
      useScreen(tester, phone);
      final app = TestApp(auth: signedIn(studentProfile));
      await app.pump(tester);
      app.push.taps.add({'type': 'reward_update'});
      await tester.pumpAndSettle();
      expect(find.byType(OrdersPage), findsOneWidget);
      app.push.taps.add({'type': 'lesson_reminder'});
      await tester.pumpAndSettle();
      expect(find.byType(HomeTab), findsOneWidget);
      app.push.taps.add({'type': 'custom'});
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsScreen), findsOneWidget);
    });

    testWidgets('a notification that started the app opens its screen', (tester) async {
      useScreen(tester, phone);
      await TestApp(
        auth: signedIn(studentProfile),
        push: FakePush(launch: {'type': 'points_weekly', 'screen': 'coins'}),
      ).pump(tester);
      expect(find.byType(CoinHistoryPage), findsOneWidget);
    });

    testWidgets('signed out, a tapped notification leads to Welcome', (tester) async {
      useScreen(tester, phone);
      final app = TestApp();
      await app.pump(tester);
      app.push.taps.add({'type': 'reward_update'});
      await tester.pumpAndSettle();
      expect(find.byType(WelcomeScreen), findsOneWidget);
    });

    test('every notification type has a screen', () {
      expect(routeForNotification({'type': 'lesson_reminder'}), Routes.home);
      expect(routeForNotification({'type': 'account_linked', 'screen': 'home'}), Routes.home);
      expect(routeForNotification({'type': 'reward_update'}), Routes.orders);
      expect(routeForNotification({'type': 'points_deduction'}), Routes.coinHistory);
      expect(routeForNotification({'type': 'receipt_rejected'}), Routes.payments);
      expect(routeForNotification({'type': 'voucher_expiring'}), Routes.voucher);
      // The screen the server names wins over the type.
      expect(routeForNotification({'type': 'points_weekly', 'screen': 'shop'}), Routes.shop);
      expect(routeForNotification({'type': 'something_new'}), Routes.notifications);
      expect(routeForNotification({}), Routes.notifications);
    });
  });

  group('shared widgets', () {
    testWidgets('MoneyText and CoinsText write numbers for the language', (tester) async {
      await tester.pumpWidget(themed(const Column(children: [MoneyText(1250000), CoinsText(128)]), language: 'ru'));
      expect(find.text('1 250 000 сум'), findsOneWidget);
      expect(find.text('128 монет'), findsOneWidget);
    });

    testWidgets('PrimaryButton and SecondaryButton are 52 pt tall and call back once per tap', (tester) async {
      var primary = 0, secondary = 0;
      await tester.pumpWidget(
        themed(
          Column(
            children: [
              PrimaryButton(label: 'Davom etish', onPressed: () => primary++),
              SecondaryButton(label: 'Kirish', onPressed: () => secondary++),
            ],
          ),
        ),
      );
      expect(tester.getSize(find.byType(PrimaryButton)).height, 52);
      expect(tester.getSize(find.byType(SecondaryButton)).height, 52);
      await tester.tap(find.byType(PrimaryButton));
      await tester.tap(find.byType(SecondaryButton));
      expect([primary, secondary], [1, 1]);
    });

    testWidgets('a busy PrimaryButton ignores taps', (tester) async {
      var taps = 0;
      await tester.pumpWidget(themed(PrimaryButton(label: 'Saqlash', busy: true, onPressed: () => taps++)));
      await tester.tap(find.byType(PrimaryButton));
      expect(taps, 0);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('AppCard, StatCard, Pill, EmptyState and Skeleton take their shapes from the tokens', (tester) async {
      await tester.pumpWidget(
        themed(
          const SingleChildScrollView(
            child: Column(
              children: [
                AppCard(child: Text('card')),
                StatCard(label: 'Tangalar', value: '128 tanga', caption: '+12 shu hafta'),
                Pill(label: 'TOPIK II · Kechki'),
                Skeleton.card(),
                SizedBox(
                  height: 300,
                  child: EmptyState(icon: Icons.home_outlined, title: 'Tez orada', message: 'Hozircha boʻsh'),
                ),
              ],
            ),
          ),
        ),
      );
      final card =
          tester.widget<DecoratedBox>(find.descendant(of: find.byType(AppCard).first, matching: find.byType(DecoratedBox)).first).decoration as BoxDecoration;
      expect(card.borderRadius, BorderRadius.circular(AppRadii.card));
      expect(card.color, AppColors.light.groupedCard);
      expect((card.border! as Border).top.width, AppSizes.hairline);
      expect(find.text('128 tanga'), findsOneWidget);
      expect(find.text('Tez orada'), findsOneWidget);
      expect(tester.getSize(find.byType(Skeleton)).height, AppSizes.skeletonCard);
    });
  });
}
