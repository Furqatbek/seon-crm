import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/home_state.dart';
import '../../core/more_state.dart';
import '../../core/state.dart';
import '../../data/auth_failure.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../auth/sign_up_screen.dart' show levelName;
import '../auth/welcome_screen.dart' show languageName;
import 'sub_page.dart';

String themeName(AppLocalizations l, String theme) => switch (theme) {
  'light' => l.themeLight,
  'dark' => l.themeDark,
  _ => l.themeSystem,
};

/// The signed-in person's photo, or their initials.
class ProfileAvatar extends ConsumerWidget {
  const ProfileAvatar({super.key, this.size = AppSizes.avatar});

  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(authProvider).profile;
    final url = ref.watch(avatarUrlProvider).value;
    return Avatar(
      initials: profile?.initials ?? '',
      size: size,
      image: url == null ? null : CachedNetworkImageProvider(url, cacheKey: profile?.avatarPath),
    );
  }
}

/// 12a and 12b: the More tab. A linked student gets the centre's pages; an
/// app user gets the voucher and open lessons instead.
class MoreTab extends ConsumerWidget {
  const MoreTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authProvider);
    final profile = auth.profile;
    final settings = ref.watch(settingsProvider);
    final student = profile?.role == AccountRole.student;
    final groups = student ? (ref.watch(studentHomeProvider).home?.groups ?? const []) : const [];

    if (!auth.profileLoaded) {
      return ColoredBox(
        color: c.groupedBg,
        child: const SafeArea(
          bottom: false,
          child: Padding(
            padding: EdgeInsets.all(AppSpacing.page),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Skeleton.card(),
                SizedBox(height: AppSpacing.x4),
                Skeleton.card(),
                SizedBox(height: AppSpacing.x4),
                Skeleton.card(),
              ],
            ),
          ),
        ),
      );
    }

    void open(String route) => context.push(route);

    return ColoredBox(
      color: c.groupedBg,
      child: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x8),
          children: [
            // The hero: photo, name, and the groups or the level.
            Row(
              children: [
                const ProfileAvatar(),
                const SizedBox(width: AppSpacing.x4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        child: Text(profile?.fullName ?? '', style: AppType.title.copyWith(color: c.text)),
                      ),
                      const SizedBox(height: AppSpacing.x2),
                      Wrap(
                        spacing: AppSpacing.x2,
                        runSpacing: AppSpacing.x2,
                        children: [
                          if (student)
                            for (final group in groups) Pill(label: group.name, outlined: true)
                          else if (profile?.koreanLevel != null)
                            Pill(label: l.levelPill(levelName(l, profile!.koreanLevel!)), outlined: true),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.x5),
            RowGroup(
              children: [ListRow(icon: Icons.person_outline, label: l.editProfile, onTap: () => open(Routes.editProfile))],
            ),
            if (student)
              RowGroup(
                children: [
                  ListRow(icon: Icons.emoji_events_outlined, label: l.leaderboard, onTap: () => open(Routes.leaderboard)),
                  ListRow(icon: Icons.calendar_today_outlined, label: l.schedule, onTap: () => open(Routes.schedule)),
                  ListRow(icon: Icons.account_balance_wallet_outlined, label: l.payments, onTap: () => open(Routes.payments)),
                  ListRow(icon: Icons.toll_outlined, label: l.coinHistory, onTap: () => open(Routes.coinHistory)),
                ],
              )
            else
              RowGroup(
                children: [
                  ListRow(icon: Icons.card_giftcard_outlined, label: l.myVoucher, onTap: () => open(Routes.voucher)),
                  ListRow(icon: Icons.event_available_outlined, label: l.openLessons, onTap: () => open(Routes.openLessons)),
                ],
              ),
            RowGroup(
              children: [
                ListRow(icon: Icons.language, label: l.language, value: languageName(l, settings.language), onTap: () => open(Routes.language)),
                ListRow(icon: Icons.brightness_6_outlined, label: l.appearance, value: themeName(l, settings.theme), onTap: () => open(Routes.appearance)),
                ListRow(icon: Icons.shield_outlined, label: l.privacyPolicy, onTap: () => open(Routes.morePrivacy)),
                ListRow(icon: Icons.info_outline, label: l.aboutCentre, onTap: () => open(Routes.about)),
              ],
            ),
            RowGroup(
              children: [
                ListRow(
                  icon: Icons.delete_outline,
                  label: l.deleteAccount,
                  danger: true,
                  onTap: () => showDeleteAccountSheet(context, student: student),
                ),
                ListRow(icon: Icons.logout, label: l.logOut, danger: true, onTap: () => ref.read(authProvider.notifier).signOut()),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 18h: what is deleted and what the centre keeps, then Delete.
Future<void> showDeleteAccountSheet(BuildContext context, {required bool student}) {
  return showModalBottomSheet<void>(
    context: context,
    // Over the tab bar, as in the designs.
    useRootNavigator: true,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => DeleteAccountSheet(student: student),
  );
}

class DeleteAccountSheet extends ConsumerStatefulWidget {
  const DeleteAccountSheet({super.key, required this.student});

  final bool student;

  @override
  ConsumerState<DeleteAccountSheet> createState() => _DeleteAccountSheetState();
}

class _DeleteAccountSheetState extends ConsumerState<DeleteAccountSheet> {
  bool _busy = false;
  bool _failed = false;

  Future<void> _delete() async {
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await ref.read(authProvider.notifier).deleteAccount();
      // Signed out: the router is already leading to Welcome.
      if (mounted) Navigator.of(context).pop();
    } on AuthFailureException {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: AppSpacing.x4, bottom: AppSpacing.x2),
      child: Text(
        text,
        style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
      ),
    );
    Widget item(String text, {bool kept = false}) => ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
      child: Row(
        children: [
          ExcludeSemantics(
            child: Icon(kept ? Icons.lock_outline : Icons.remove_circle_outline, color: kept ? c.textSecondary : c.danger, size: AppSpacing.x5),
          ),
          const SizedBox(width: AppSpacing.x3),
          Expanded(
            child: Text(text, style: AppType.body.copyWith(color: c.text)),
          ),
        ],
      ),
    );
    Widget box({required List<Widget> children, bool filled = false}) => Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x1),
      decoration: BoxDecoration(
        color: filled ? c.surface : null,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: filled ? null : Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Column(children: children),
    );

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(l.deleteAccount, style: AppType.title.copyWith(color: c.text)),
            ),
            heading(l.deleteWillBeDeleted),
            box(children: [item(l.deleteLogin), item(l.deleteCoins), item(l.deleteResults), item(l.deleteBookings)]),
            // The centre's business records concern a student only.
            if (widget.student) ...[
              heading(l.deleteKept),
              box(filled: true, children: [item(l.deletePaymentRecords, kept: true)]),
            ],
            const SizedBox(height: AppSpacing.x5),
            if (_failed) ...[Text(l.deleteFailed, style: AppType.footnote.copyWith(color: c.danger)), const SizedBox(height: AppSpacing.x3)],
            DangerButton(label: l.deleteAction, onPressed: _delete, busy: _busy),
            const SizedBox(height: AppSpacing.x3),
            SecondaryButton(label: l.cancel, onPressed: _busy ? null : () => Navigator.of(context).pop()),
          ],
        ),
      ),
    );
  }
}

/// The one action that cannot be undone: red, in the shape of a primary button.
class DangerButton extends StatelessWidget {
  const DangerButton({super.key, required this.label, required this.onPressed, this.busy = false});

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final enabled = onPressed != null && !busy;
    return Semantics(
      button: true,
      enabled: enabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled ? onPressed : null,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight, minWidth: double.infinity),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x3),
          alignment: Alignment.center,
          decoration: BoxDecoration(color: AppColors.light.danger, borderRadius: BorderRadius.circular(AppRadii.button)),
          child: busy
              ? SizedBox(
                  width: AppSpacing.x5,
                  height: AppSpacing.x5,
                  child: CircularProgressIndicator(strokeWidth: AppSizes.outline, color: c.onPrimaryFill),
                )
              : Text(
                  label,
                  textAlign: TextAlign.center,
                  style: AppType.headline.copyWith(color: c.onPrimaryFill),
                ),
        ),
      ),
    );
  }
}
