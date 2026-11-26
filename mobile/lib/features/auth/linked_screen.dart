import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';

/// The groups of the student who has just been linked.
final linkedGroupsProvider = FutureProvider.autoDispose<List<String>>((ref) => ref.watch(authRepositoryProvider).groupNames());

/// 01d: "Your account is linked to the centre", with the group's name.
class LinkedScreen extends ConsumerWidget {
  const LinkedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final groups = ref.watch(linkedGroupsProvider).value ?? const <String>[];
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ExcludeSemantics(
                          child: Container(
                            width: AppSizes.badge,
                            height: AppSizes.badge,
                            decoration: BoxDecoration(color: c.primaryFill, shape: BoxShape.circle, boxShadow: c.glow),
                            child: Icon(Icons.check_rounded, color: c.onPrimaryFill, size: AppSpacing.x10),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.x8),
                        Text(
                          l.linkedTitle,
                          textAlign: TextAlign.center,
                          style: AppType.largeTitle.copyWith(color: c.text),
                        ),
                        if (groups.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.x4),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: AppSpacing.x2,
                            runSpacing: AppSpacing.x2,
                            children: [for (final group in groups) Pill(label: group)],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              PrimaryButton(label: l.start, onPressed: () => context.go(Routes.home)),
            ],
          ),
        ),
      ),
    );
  }
}

/// The privacy policy the sign-up consent line links to, from the centre's settings.
final privacyPolicyProvider = FutureProvider.autoDispose<String?>((ref) {
  final language = ref.watch(settingsProvider.select((settings) => settings.language));
  return ref.watch(authRepositoryProvider).privacyPolicy(language);
});

class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final policy = ref.watch(privacyPolicyProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(l.privacyPolicy, style: AppType.headline.copyWith(color: c.text)),
      ),
      body: SafeArea(
        child: policy.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(AppSpacing.page),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Skeleton(width: 240),
                SizedBox(height: AppSpacing.x3),
                Skeleton(),
                SizedBox(height: AppSpacing.x3),
                Skeleton(width: 180),
              ],
            ),
          ),
          error: (_, _) => EmptyState(icon: Icons.wifi_off_outlined, title: l.errorNetwork),
          data: (text) => text == null
              ? EmptyState(icon: Icons.description_outlined, title: l.privacyEmpty)
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(AppSpacing.page),
                  child: Text(text, style: AppType.body.copyWith(color: c.text)),
                ),
        ),
      ),
    );
  }
}
