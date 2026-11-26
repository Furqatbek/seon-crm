import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/home_state.dart';
import '../../core/time.dart';
import '../../data/home.dart';
import '../../data/notifications.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';

/// The day a notification is filed under.
enum DayGroup { today, yesterday, earlier }

DayGroup dayGroupOf(DateTime createdAt, DateTime now) {
  final days = tashkentDay(now).difference(tashkentDay(createdAt)).inDays;
  return days <= 0 ? DayGroup.today : (days == 1 ? DayGroup.yesterday : DayGroup.earlier);
}

/// Grouped by day, and within a day the unread first, then the newest.
Map<DayGroup, List<AppNotification>> groupNotifications(List<AppNotification> items, DateTime now) {
  final groups = <DayGroup, List<AppNotification>>{};
  for (final item in items) {
    groups.putIfAbsent(dayGroupOf(item.createdAt, now), () => []).add(item);
  }
  for (final list in groups.values) {
    list.sort((a, b) => a.unread != b.unread ? (a.unread ? -1 : 1) : b.createdAt.compareTo(a.createdAt));
  }
  return {
    for (final group in DayGroup.values)
      if (groups[group] != null) group: groups[group]!,
  };
}

IconData notificationIcon(AppNotification notification) => switch (notification.type) {
  'points_weekly' || 'points_deduction' || 'points_month_result' => Icons.toll_outlined,
  'reward_update' => Icons.shopping_bag_outlined,
  'lesson_reminder' || 'open_lesson_reminder' => Icons.calendar_today_outlined,
  'payment_due' || 'payment_overdue' || 'receipt_approved' || 'receipt_rejected' => Icons.account_balance_wallet_outlined,
  'voucher_expiring' => Icons.card_giftcard_outlined,
  'account_linked' => Icons.link,
  _ => notification.data['screen'] == 'game' ? Icons.sports_esports_outlined : Icons.notifications_none,
};

/// 03: notifications grouped by day. Opening one marks it read and leads to its screen.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final notifications = ref.watch(notificationsProvider);
    final items = notifications.value;
    final now = ref.watch(clockProvider)();
    final anyUnread = items?.any((item) => item.unread) ?? false;

    Future<void> openOne(AppNotification notification) async {
      await ref.read(notificationsProvider.notifier).markRead(notification);
      if (!context.mounted) return;
      final route = routeForNotification({'type': notification.type, ...notification.data});
      // One that has no screen of its own is simply read.
      if (route != Routes.notifications) context.go(route);
    }

    final Widget body;
    if (items == null && notifications.hasError) {
      body = EmptyState(
        icon: Icons.wifi_off_outlined,
        title: notifications.error is OfflineException ? l.errorNetwork : l.errorGeneric,
        action: SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(notificationsProvider)),
      );
    } else if (items == null) {
      body = const Padding(
        padding: EdgeInsets.all(AppSpacing.page),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Skeleton(height: AppSizes.buttonHeight),
            SizedBox(height: AppSpacing.x3),
            Skeleton(height: AppSizes.buttonHeight),
            SizedBox(height: AppSpacing.x3),
            Skeleton(height: AppSizes.buttonHeight),
          ],
        ),
      );
    } else if (items.isEmpty) {
      body = EmptyState(icon: Icons.notifications_none, title: l.notificationsEmpty);
    } else {
      final groups = groupNotifications(items, now);
      body = RefreshIndicator(
        color: c.primary,
        backgroundColor: c.elevated,
        onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x8),
          children: [
            for (final group in groups.entries) ...[
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.x5, bottom: AppSpacing.x2),
                child: Semantics(
                  header: true,
                  child: Text(switch (group.key) {
                    DayGroup.today => l.today,
                    DayGroup.yesterday => l.yesterday,
                    DayGroup.earlier => l.earlier,
                  }, style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600)),
                ),
              ),
              for (final (index, item) in group.value.indexed) ...[
                if (index > 0) Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
                NotificationRow(notification: item, now: now, onTap: () => openOne(item)),
              ],
            ],
          ],
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: Row(
                children: [
                  Semantics(
                    button: true,
                    label: l.back,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => context.canPop() ? context.pop() : context.go(Routes.home),
                      child: SizedBox(
                        width: AppSizes.tapTarget,
                        height: AppSizes.tapTarget,
                        child: Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: ExcludeSemantics(
                            child: Icon(Icons.arrow_back_ios_new, color: c.primary, size: AppSpacing.x5),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (anyUnread)
                    Flexible(
                      flex: 6,
                      child: LinkButton(label: l.markAllRead, onPressed: () => ref.read(notificationsProvider.notifier).markAllRead()),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, 0),
              child: Semantics(
                header: true,
                child: Text(l.notifications, style: AppType.largeTitle.copyWith(color: c.text)),
              ),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

/// One notification: its icon, what it says (bold while unread), when, and a
/// dot while unread.
class NotificationRow extends StatelessWidget {
  const NotificationRow({super.key, required this.notification, required this.now, required this.onTap});

  final AppNotification notification;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final unread = notification.unread;
    // The time for today and yesterday, the date for anything older.
    final when = dayGroupOf(notification.createdAt, now) == DayGroup.earlier
        ? dayMonth(tashkentDay(notification.createdAt), l)
        : clockTime(notification.createdAt);
    return Semantics(
      button: true,
      label: unread ? l.unread : null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.x3),
          child: Row(
            children: [
              ExcludeSemantics(
                child: Container(
                  width: AppSizes.roundButton,
                  height: AppSizes.roundButton,
                  decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
                  child: Icon(notificationIcon(notification), color: c.primary, size: AppSpacing.x5),
                ),
              ),
              const SizedBox(width: AppSpacing.x3),
              Expanded(
                child: Text(
                  notification.text,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.body.copyWith(color: c.text, fontWeight: unread ? FontWeight.w600 : FontWeight.w400),
                ),
              ),
              const SizedBox(width: AppSpacing.x3),
              Text(when, style: AppType.footnote.copyWith(color: c.textSecondary)),
              const SizedBox(width: AppSpacing.x2),
              // The dot's place is kept, so the times line up.
              ExcludeSemantics(
                child: Container(
                  width: AppSizes.dot,
                  height: AppSizes.dot,
                  decoration: BoxDecoration(color: unread ? c.primaryFill : null, shape: BoxShape.circle),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
