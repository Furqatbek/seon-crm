import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';

// The five tabs. Each has a Student version and an App user version, chosen
// from the profile's role. Until its phase is built, a version says what will
// be there.

/// Shows the version of a tab for whoever is signed in; a skeleton while the
/// profile is being read.
class RoleView extends ConsumerWidget {
  const RoleView({super.key, required this.title, required this.student, required this.appUser});

  final String title;
  final Widget student;
  final Widget appUser;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final auth = ref.watch(authProvider);
    final Widget body;
    if (!auth.profileLoaded) {
      body = const Padding(
        padding: EdgeInsets.all(AppSpacing.page),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Skeleton.card(),
            SizedBox(height: AppSpacing.x3),
            Skeleton.card(),
            SizedBox(height: AppSpacing.x3),
            Skeleton.card(),
          ],
        ),
      );
    } else {
      body = auth.profile?.role == AccountRole.student ? student : appUser;
    }
    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, 0),
            child: Semantics(
              header: true,
              child: Text(title, style: AppType.largeTitle.copyWith(color: c.text)),
            ),
          ),
          Expanded(child: body),
        ],
      ),
    );
  }
}

class _Soon extends StatelessWidget {
  const _Soon({required this.icon, required this.message, this.action});

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => EmptyState(icon: icon, title: AppLocalizations.of(context).soonTitle, message: message, action: action);
}

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return RoleView(
      title: l.tabHome,
      student: _Soon(icon: Icons.home_outlined, message: l.homeStudentSoon),
      appUser: _Soon(icon: Icons.home_outlined, message: l.homeAppUserSoon),
    );
  }
}

class GameTab extends StatelessWidget {
  const GameTab({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return RoleView(
      title: l.tabGame,
      student: _Soon(icon: Icons.sports_esports_outlined, message: l.gameStudentSoon),
      appUser: _Soon(icon: Icons.sports_esports_outlined, message: l.gameAppUserSoon),
    );
  }
}

class QrTab extends StatelessWidget {
  const QrTab({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return RoleView(
      title: l.tabQr,
      student: _Soon(icon: Icons.qr_code_2, message: l.qrStudentSoon),
      appUser: _Soon(icon: Icons.lock_outline, message: l.qrAppUserSoon),
    );
  }
}

class ShopTab extends StatelessWidget {
  const ShopTab({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return RoleView(
      title: l.tabShop,
      student: _Soon(icon: Icons.shopping_bag_outlined, message: l.shopStudentSoon),
      appUser: _Soon(icon: Icons.shopping_bag_outlined, message: l.shopAppUserSoon),
    );
  }
}

/// Until the More pages are built, this tab holds the one thing a signed-in
/// person must always be able to do: log out.
class MoreTab extends ConsumerWidget {
  const MoreTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final logOut = SecondaryButton(label: l.logOut, destructive: true, onPressed: () => ref.read(authProvider.notifier).signOut());
    return RoleView(
      title: l.tabMore,
      student: _Soon(icon: Icons.person_outline, message: l.moreStudentSoon, action: logOut),
      appUser: _Soon(icon: Icons.person_outline, message: l.moreAppUserSoon, action: logOut),
    );
  }
}

/// Where a tapped notification lands until the notifications list is built.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l.notifications, style: AppType.headline.copyWith(color: c.text)),
      ),
      body: EmptyState(icon: Icons.notifications_none, title: l.soonTitle, message: l.notificationsSoon),
    );
  }
}
