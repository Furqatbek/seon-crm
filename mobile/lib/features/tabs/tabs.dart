import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state.dart';
import '../../data/models.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../home/app_user_home.dart';
import '../home/student_home.dart';

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

/// Home has no page title of its own: each version greets the person by name.
class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (!auth.profileLoaded) return const SafeArea(bottom: false, child: HomeSkeleton());
    return auth.profile?.role == AccountRole.student ? const StudentHomeView() : const AppUserHomeView();
  }
}
