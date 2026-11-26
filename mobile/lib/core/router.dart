import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/code_screen.dart';
import '../features/auth/linked_screen.dart';
import '../features/auth/sign_in_screens.dart';
import '../features/auth/sign_up_screen.dart';
import '../features/auth/welcome_screen.dart';
import '../features/shell/app_shell.dart';
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

  final router = GoRouter(
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
            routes: [GoRoute(path: Routes.game, builder: (_, _) => const GameTab())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.qr, builder: (_, _) => const QrTab())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.shop, builder: (_, _) => const ShopTab())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.more, builder: (_, _) => const MoreTab())],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
