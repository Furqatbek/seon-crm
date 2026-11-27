import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/code_screen.dart';
import '../features/auth/linked_screen.dart';
import '../features/auth/sign_in_screens.dart';
import '../features/auth/sign_up_screen.dart';
import '../features/auth/welcome_screen.dart';
import '../features/exams/exam_screen.dart';
import '../features/exams/exams_side.dart';
import '../features/game/finding.dart';
import '../features/game/game_tab.dart';
import '../features/game/match_screen.dart';
import '../features/more/edit_profile.dart';
import '../features/more/leaderboard.dart';
import '../features/more/money_pages.dart';
import '../features/more/more_tab.dart';
import '../features/more/schedule.dart';
import '../features/more/simple_pages.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/offers/offers.dart';
import '../features/payments/receipts.dart';
import '../features/qr/qr_tab.dart';
import '../features/shell/app_shell.dart';
import '../features/shop/orders_page.dart';
import '../features/shop/product_page.dart';
import '../features/shop/shop_tab.dart';
import '../features/tabs/tabs.dart';
import '../push/notification_routes.dart';
import 'state.dart';

/// Screens for someone who is not signed in.
const _signedOutOnly = {Routes.welcome, Routes.signUp, Routes.signIn, Routes.forgot};

/// Screens open to anyone: the code screen signs the person in while it is
/// still showing, and the privacy policy is read before there is an account.
const _open = {Routes.code, Routes.privacy};

/// Where to send someone who asked for `path`, or null to let them through:
/// signed out, everything but the sign-in flow leads to Welcome; signed in,
/// the sign-in flow leads to Home.
String? redirectFor({required bool signedIn, required String path}) {
  if (_open.contains(path)) return null;
  if (!signedIn) return _signedOutOnly.contains(path) ? null : Routes.welcome;
  return _signedOutOnly.contains(path) ? Routes.home : null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final signedIn = ValueNotifier(ref.read(authProvider).signedIn);
  ref.listen(authProvider, (_, next) => signedIn.value = next.signedIn);
  ref.onDispose(signedIn.dispose);

  // Pages that cover the tab bar open on this navigator.
  final root = GlobalKey<NavigatorState>();
  final router = GoRouter(
    navigatorKey: root,
    initialLocation: Routes.home,
    refreshListenable: signedIn,
    redirect: (context, state) => redirectFor(signedIn: signedIn.value, path: state.matchedLocation),
    routes: [
      GoRoute(path: Routes.welcome, builder: (_, _) => const WelcomeScreen()),
      GoRoute(path: Routes.signUp, builder: (_, _) => const SignUpScreen()),
      GoRoute(
        path: Routes.code,
        // Opened without a phone (a restored route): back to the start.
        redirect: (_, state) => state.extra is CodeRequest ? null : Routes.welcome,
        builder: (_, state) => CodeScreen(request: state.extra! as CodeRequest),
      ),
      GoRoute(path: Routes.signIn, builder: (_, _) => const SignInScreen()),
      GoRoute(path: Routes.forgot, builder: (_, _) => const ForgotPasswordScreen()),
      GoRoute(path: Routes.newPassword, builder: (_, _) => const NewPasswordScreen()),
      GoRoute(path: Routes.linked, builder: (_, _) => const LinkedScreen()),
      GoRoute(path: Routes.privacy, builder: (_, _) => const PrivacyScreen()),
      GoRoute(path: Routes.notifications, builder: (_, _) => const NotificationsScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.home, builder: (_, _) => const HomeTab())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.game,
                builder: (_, state) => GameTab(exams: state.uri.queryParameters['side'] == 'exams'),
                // Looking for an opponent and the match itself cover the tab bar.
                routes: [
                  GoRoute(
                    path: 'search',
                    parentNavigatorKey: root,
                    builder: (_, state) => FindingScreen(groupId: state.uri.queryParameters['group']),
                  ),
                  GoRoute(
                    path: 'classmates',
                    parentNavigatorKey: root,
                    redirect: (_, state) => state.uri.queryParameters['group'] == null ? Routes.game : null,
                    builder: (_, state) => ClassmatesScreen(groupId: state.uri.queryParameters['group']!),
                  ),
                  // A mock exam: its intro, the attempt with its result, and the review.
                  GoRoute(
                    path: 'exam/:id',
                    parentNavigatorKey: root,
                    builder: (_, state) => ExamIntroScreen(examId: state.pathParameters['id']!),
                  ),
                  GoRoute(
                    path: 'attempt/:id',
                    parentNavigatorKey: root,
                    builder: (_, state) => ExamScreen(key: ValueKey(state.pathParameters['id']), attemptId: state.pathParameters['id']!),
                    routes: [
                      GoRoute(
                        path: 'review',
                        parentNavigatorKey: root,
                        builder: (_, state) => ExamReviewScreen(attemptId: state.pathParameters['id']!),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'match/:id',
                    parentNavigatorKey: root,
                    builder: (_, state) => MatchScreen(
                      key: ValueKey(state.pathParameters['id']),
                      matchId: state.pathParameters['id']!,
                      groupId: state.uri.queryParameters['group'],
                    ),
                    routes: [
                      GoRoute(
                        path: 'review',
                        parentNavigatorKey: root,
                        builder: (_, state) => MatchReviewScreen(matchId: state.pathParameters['id']!),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.qr, builder: (_, _) => const QrTab())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.shop,
                builder: (_, _) => const ShopTab(),
                routes: [
                  GoRoute(path: 'orders', builder: (_, _) => const OrdersPage()),
                  GoRoute(
                    path: 'product/:id',
                    parentNavigatorKey: root,
                    builder: (_, state) => ProductPage(id: state.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.more,
                builder: (_, _) => const MoreTab(),
                routes: [
                  GoRoute(
                    path: 'profile',
                    builder: (_, _) => const EditProfilePage(),
                    routes: [
                      GoRoute(path: 'phone', builder: (_, _) => const ChangePhonePage()),
                      GoRoute(path: 'password', builder: (_, _) => const ChangePasswordPage()),
                    ],
                  ),
                  GoRoute(path: 'leaderboard', builder: (_, _) => const LeaderboardPage()),
                  GoRoute(path: 'schedule', builder: (_, _) => const SchedulePage()),
                  GoRoute(
                    path: 'payments',
                    builder: (_, _) => const PaymentsPage(),
                    routes: [
                      // 25a: a page of its own, without the tab bar.
                      GoRoute(
                        path: 'card',
                        parentNavigatorKey: root,
                        builder: (_, _) => const Scaffold(body: SafeArea(top: false, child: PayByCardPage())),
                      ),
                      GoRoute(path: 'receipts', builder: (_, _) => const MyReceiptsPage()),
                    ],
                  ),
                  GoRoute(path: 'coins', builder: (_, _) => const CoinHistoryPage()),
                  GoRoute(path: 'voucher', builder: (_, _) => const VoucherPage()),
                  GoRoute(path: 'open-lessons', builder: (_, _) => const OpenLessonsPage()),
                  GoRoute(path: 'language', builder: (_, _) => const LanguagePage()),
                  GoRoute(path: 'appearance', builder: (_, _) => const AppearancePage()),
                  GoRoute(path: 'about', builder: (_, _) => const CentreTextPage(about: true)),
                  GoRoute(path: 'privacy', builder: (_, _) => const CentreTextPage(about: false)),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
