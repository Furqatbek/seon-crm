import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/shop_state.dart';
import '../../core/time.dart';
import '../../data/shop.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';
import 'product_page.dart';
import 'shop_tab.dart';

/// 11: the student's orders, each with where it stands. The list follows the
/// centre: Ready and Given appear without pulling to refresh.
class OrdersPage extends ConsumerWidget {
  const OrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final now = ref.watch(clockProvider)();
    return SubPage(
      title: l.myOrders,
      home: Routes.shop,
      child: AsyncList<List<ShopOrder>>(
        value: ref.watch(ordersProvider),
        onRefresh: () => ref.read(ordersProvider.notifier).refresh(),
        emptyIcon: Icons.shopping_bag_outlined,
        emptyTitle: l.ordersEmpty,
        builder: (orders) => ListView.separated(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: AppSpacing.x8),
          itemCount: orders.length,
          separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.x3),
          itemBuilder: (_, index) => OrderCard(key: ValueKey(orders[index].id), order: orders[index], now: now),
        ),
      ),
    );
  }
}

class OrderCard extends ConsumerStatefulWidget {
  const OrderCard({super.key, required this.order, required this.now});

  final ShopOrder order;
  final DateTime now;

  @override
  ConsumerState<OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends ConsumerState<OrderCard> {
  bool _busy = false;

  Future<void> _cancel() async {
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(ordersProvider.notifier).cancel(widget.order.id);
      messenger.showSnackBar(SnackBar(content: Text(l.orderCancelDone)));
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(shopFailureText(error, l))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final order = widget.order;
    final closedOn = order.handledAt == null ? null : dayMonth(tashkentDay(order.handledAt!), l);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox.square(
                      dimension: AppSizes.qrTab,
                      child: RewardPhoto(path: order.photoPath, radius: AppRadii.button),
                    ),
                    const SizedBox(width: AppSpacing.x3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(order.title(l.localeName), style: AppType.headline.copyWith(color: c.text)),
                          Text(
                            '${formatCoins(order.cost, l)} · ${relativeDay(order.createdAt, widget.now, l)}',
                            style: AppType.tabular(AppType.footnote.copyWith(color: c.textSecondary)),
                          ),
                          const SizedBox(height: AppSpacing.x1),
                          switch (order.status) {
                            OrderStatus.requested => Pill(label: l.orderRequested, tone: PillTone.warning),
                            OrderStatus.ready => const SizedBox(),
                            OrderStatus.given => _Closed(icon: Icons.check, color: c.success, text: closedOn == null ? l.orderGiven : l.givenOn(closedOn)),
                            OrderStatus.rejected => _Closed(icon: Icons.close, color: c.danger, text: l.orderRejected),
                            OrderStatus.cancelled => _Closed(icon: Icons.close, color: c.textSecondary, text: l.orderCancelled),
                          },
                          if (order.status == OrderStatus.rejected || order.status == OrderStatus.cancelled)
                            Text(
                              // The centre's reason, when it gave one.
                              order.note == null || order.note!.trim().isEmpty ? l.coinsReturned : '${order.note!.trim()} · ${l.coinsReturned}',
                              style: AppType.footnote.copyWith(color: c.textSecondary),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (order.status == OrderStatus.ready) ...[
                  const SizedBox(height: AppSpacing.x4),
                  const OrderSteps(reached: 1),
                  const SizedBox(height: AppSpacing.x4),
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.x3),
                    decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.button)),
                    child: Text(
                      l.pickupNow,
                      textAlign: TextAlign.center,
                      style: AppType.body.copyWith(color: c.text),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (order.status == OrderStatus.requested) ...[
            Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
            // Only while Requested: once it is Ready, the centre has it out for them.
            Semantics(
              button: true,
              enabled: !_busy,
              label: '${l.cancelOrder}: ${order.title(l.localeName)}',
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _busy ? null : _cancel,
                child: Container(
                  constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x3),
                  alignment: Alignment.center,
                  child: Opacity(
                    opacity: _busy ? AppSizes.disabledOpacity : 1,
                    child: Text(
                      l.cancel,
                      textAlign: TextAlign.center,
                      style: AppType.body.copyWith(color: c.danger, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Closed extends StatelessWidget {
  const _Closed({required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ExcludeSemantics(
        child: Icon(icon, color: color, size: AppSpacing.x5),
      ),
      const SizedBox(width: AppSpacing.x1),
      Expanded(
        child: Text(
          text,
          style: AppType.footnote.copyWith(color: color, fontWeight: FontWeight.w600),
        ),
      ),
    ],
  );
}

/// Requested → Ready for pickup → Given, up to the step reached (0, 1 or 2).
class OrderSteps extends StatelessWidget {
  const OrderSteps({super.key, required this.reached});

  final int reached;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final labels = [l.orderRequested, l.orderReady, l.orderGiven];

    Widget line(bool shown, bool done) => Expanded(
      child: Container(height: AppSizes.outline, color: !shown ? null : (done ? c.primaryFill : c.border)),
    );

    return Semantics(
      label: labels[reached],
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var step = 0; step < 3; step++)
            Expanded(
              child: Column(
                children: [
                  Row(
                    children: [
                      line(step > 0, step <= reached),
                      Container(
                        width: AppSpacing.x5,
                        height: AppSpacing.x5,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: step <= reached ? c.primaryFill : c.bg,
                          border: step <= reached ? null : Border.all(color: c.border, width: AppSizes.outline),
                        ),
                        child: step < reached
                            ? Icon(Icons.check, color: c.onPrimaryFill, size: AppSpacing.x3)
                            : step == reached
                            ? Container(
                                width: AppSizes.dot,
                                height: AppSizes.dot,
                                decoration: BoxDecoration(shape: BoxShape.circle, color: c.onPrimaryFill),
                              )
                            : null,
                      ),
                      line(step < 2, step < reached),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.x2),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x1),
                    child: Text(
                      labels[step],
                      textAlign: TextAlign.center,
                      style: AppType.caption.copyWith(
                        color: step == reached ? c.primary : (step < reached ? c.text : c.textSecondary),
                        fontWeight: step == reached ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
