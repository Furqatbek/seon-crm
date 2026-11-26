import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/shop_state.dart';
import '../../core/state.dart';
import '../../data/models.dart';
import '../../data/shop.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';

/// A reward's photo, or a quiet placeholder without one.
class RewardPhoto extends ConsumerWidget {
  const RewardPhoto({super.key, required this.path, this.radius = 0});

  final String? path;
  final double radius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final url = path == null ? null : ref.watch(rewardPhotoProvider(path!)).value;
    final placeholder = ColoredBox(
      color: c.surface,
      child: Center(
        child: Icon(Icons.card_giftcard, color: c.border, size: AppSpacing.x8),
      ),
    );
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: url == null
            ? placeholder
            : CachedNetworkImage(imageUrl: url, cacheKey: path, fit: BoxFit.cover, placeholder: (_, _) => placeholder, errorWidget: (_, _, _) => placeholder),
      ),
    );
  }
}

/// A number of coins after the coin mark, or a lock for coins that cannot be spent yet.
class CoinAmount extends StatelessWidget {
  const CoinAmount(this.text, {super.key, this.locked = false, this.style});

  final String text;
  final bool locked;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final textStyle = style ?? AppType.headline.copyWith(color: c.text);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(
          child: Icon(locked ? Icons.lock_outline : Icons.paid_outlined, color: locked ? c.textSecondary : c.warning, size: AppSpacing.x5),
        ),
        const SizedBox(width: AppSpacing.x1),
        Flexible(child: Text(text, style: AppType.tabular(textStyle))),
      ],
    );
  }
}

/// 09a and 09b: what the centre offers for coins. A student orders; an App
/// user looks, with their locked coins and the way in.
class ShopTab extends ConsumerWidget {
  const ShopTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authProvider);
    final student = auth.profile?.role == AccountRole.student;
    final int? balance = !auth.profileLoaded
        ? null
        : student
        ? ref.watch(studentHomeProvider).home?.coins
        : ref.watch(appUserHomeProvider).value?.lockedCoins;
    final items = ref.watch(shopItemsProvider);
    final open = student ? (ref.watch(ordersProvider).value ?? const <ShopOrder>[]).where((order) => order.open).length : 0;

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x2),
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: AppSpacing.x3,
              runSpacing: AppSpacing.x2,
              children: [
                Semantics(
                  header: true,
                  child: Text(l.tabShop, style: AppType.largeTitle.copyWith(color: c.text)),
                ),
                if (balance != null)
                  Semantics(
                    label: student ? null : l.lockedCoins,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x2),
                      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.pill)),
                      // A student's coins are theirs to spend; an App user's are locked until they join.
                      child: CoinAmount(student ? formatCoins(balance, l) : '$balance', locked: !student),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: !auth.profileLoaded
                ? const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card())
                : Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
                    child: AsyncList<List<ShopItem>>(
                      value: items,
                      onRefresh: () async {
                        if (student) {
                          await ref.read(ordersProvider.notifier).refresh();
                        } else {
                          ref.invalidate(appUserHomeProvider);
                        }
                        await ref.refresh(shopItemsProvider.future).then((_) {}, onError: (_) {});
                      },
                      emptyIcon: Icons.shopping_bag_outlined,
                      emptyTitle: l.shopEmpty,
                      // The way to the orders and the way in are there even with nothing on offer.
                      isEmpty: (_) => false,
                      builder: (items) => ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.only(bottom: AppSpacing.x8),
                        children: [
                          if (student) _OrdersLink(open: open) else const _JoinBanner(),
                          const SizedBox(height: AppSpacing.x3),
                          if (items.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: AppSpacing.x10),
                              child: EmptyState(icon: Icons.shopping_bag_outlined, title: l.shopEmpty),
                            ),
                          for (var index = 0; index < items.length; index += 2)
                            Padding(
                              padding: const EdgeInsets.only(bottom: AppSpacing.x3),
                              child: IntrinsicHeight(
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Expanded(
                                      child: _ItemCard(item: items[index], balance: student ? balance : null),
                                    ),
                                    const SizedBox(width: AppSpacing.x3),
                                    Expanded(
                                      child: index + 1 < items.length ? _ItemCard(item: items[index + 1], balance: student ? balance : null) : const SizedBox(),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// "My orders", with how many are still on their way.
class _OrdersLink extends StatelessWidget {
  const _OrdersLink({required this.open});

  final int open;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Semantics(
        button: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => context.go(Routes.orders),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    l.myOrders,
                    style: AppType.body.copyWith(color: c.primary, fontWeight: FontWeight.w600),
                  ),
                ),
                if (open > 0) ...[
                  const SizedBox(width: AppSpacing.x2),
                  Container(
                    constraints: const BoxConstraints(minWidth: AppSizes.counter, minHeight: AppSizes.counter),
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x1),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: c.primaryFill, borderRadius: BorderRadius.circular(AppRadii.pill)),
                    child: Text(
                      '$open',
                      style: AppType.caption.copyWith(color: c.onPrimaryFill, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
                const SizedBox(width: AppSpacing.x1),
                ExcludeSemantics(
                  child: Icon(Icons.chevron_right, color: c.primary, size: AppSizes.icon),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// For an App user: coins are spent after joining the centre.
class _JoinBanner extends StatelessWidget {
  const _JoinBanner();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsetsDirectional.only(start: AppSpacing.x4, top: AppSpacing.x1, bottom: AppSpacing.x1, end: AppSpacing.x1),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.x2),
            child: Text(l.shopJoinBanner, style: AppType.footnote.copyWith(color: c.text)),
          ),
          LinkButton(label: l.freeLesson, onPressed: () => context.go(Routes.openLessons)),
        ],
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item, required this.balance});

  final ShopItem item;

  /// The student's coins; null for someone who only looks.
  final int? balance;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final short = balance == null ? 0 : item.cost - balance!;
    return Semantics(
      button: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => context.push(Routes.product(item.id)),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: c.bg,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: c.border, width: AppSizes.hairline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    RewardPhoto(path: item.photoPath),
                    if (item.soldOut)
                      PositionedDirectional(
                        top: AppSpacing.x2,
                        start: AppSpacing.x2,
                        end: AppSpacing.x2,
                        child: Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: Pill(label: l.soldOut, outlined: true),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.x3),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.name,
                      style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: AppSpacing.x1),
                    Semantics(
                      label: formatCoins(item.cost, l),
                      excludeSemantics: true,
                      child: CoinAmount(
                        '${item.cost}',
                        style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (short > 0 && !item.soldOut) Text(l.moreCoinsNeeded(formatCoins(short, l)), style: AppType.caption.copyWith(color: c.textSecondary)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
