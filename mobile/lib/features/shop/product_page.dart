import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/shop_state.dart';
import '../../core/state.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../data/shop.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';
import 'shop_tab.dart';

/// What to tell the person when the server refused.
String shopFailureText(Object error, AppLocalizations l) => switch (error) {
  ShopException(failure: ShopFailure.notEnoughCoins) => l.shopErrorCoins,
  ShopException(failure: ShopFailure.soldOut) => l.shopErrorSoldOut,
  ShopException(failure: ShopFailure.notOnOffer) => l.shopErrorNotOnOffer,
  ShopException(failure: ShopFailure.chooseVariant) => l.chooseVariant,
  ShopException(failure: ShopFailure.tooLate) => l.shopErrorTooLate,
  ShopException(failure: ShopFailure.notAllowed) => l.shopJoinBanner,
  OfflineException() => l.errorNetwork,
  _ => l.errorGeneric,
};

/// 10a: one reward, its variants and their stock, and Order.
class ProductPage extends ConsumerStatefulWidget {
  const ProductPage({super.key, required this.id});

  final String id;

  @override
  ConsumerState<ProductPage> createState() => _ProductPageState();
}

class _ProductPageState extends ConsumerState<ProductPage> {
  String? _variantId;

  Future<void> _order(ShopItem item, ShopVariant? variant, int balance) async {
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ordered = await showModalBottomSheet<bool>(
      context: context,
      // Over the tab bar, as in the designs.
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ConfirmOrderSheet(item: item, variant: variant, balance: balance),
    );
    if (ordered != true || !mounted) return;
    // On to the order itself, where it can be followed and cancelled.
    context.go(Routes.orders);
    messenger.showSnackBar(SnackBar(content: Text(l.orderPlaced)));
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final language = l.localeName;
    final items = ref.watch(shopItemsProvider);
    final student = ref.watch(authProvider.select((auth) => auth.profile?.role == AccountRole.student));
    final balance = student ? ref.watch(studentHomeProvider).home?.coins : null;
    final item = items.value?.where((item) => item.id == widget.id).firstOrNull;

    final Widget body;
    Widget? action;
    if (item == null) {
      body = items.isLoading
          ? const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card())
          : EmptyState(
              icon: Icons.card_giftcard,
              title: items.hasError ? (items.error is OfflineException ? l.errorNetwork : l.errorGeneric) : l.productGone,
              action: items.hasError ? SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(shopItemsProvider)) : null,
            );
    } else {
      // A variant that was archived or sold out since it was chosen is no longer the choice.
      final variant = item.variants.where((variant) => variant.id == _variantId && !variant.soldOut).firstOrNull;
      final left = item.variants.isEmpty ? item.stock : variant?.stock;
      final short = balance == null ? 0 : item.cost - balance;
      final needsChoice = item.variants.isNotEmpty && variant == null;

      body = ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x6),
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: RewardPhoto(path: item.photoPath, radius: AppRadii.card),
          ),
          const SizedBox(height: AppSpacing.x4),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.x3,
            children: [
              Semantics(
                header: true,
                child: Text(item.name, style: AppType.title.copyWith(color: c.text)),
              ),
              CoinsText(item.cost, style: AppType.headline.copyWith(color: c.text)),
            ],
          ),
          if (item.description != null && item.description!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.x2),
            Text(item.description!, style: AppType.body.copyWith(color: c.textSecondary)),
          ],
          if (item.variants.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.x5),
            Text(
              l.shopVariant,
              style: AppType.footnote.copyWith(color: c.text, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.x2),
            Wrap(
              spacing: AppSpacing.x2,
              runSpacing: AppSpacing.x2,
              children: [
                for (final option in item.variants)
                  option.soldOut
                      // Out of stock: shown, not a choice.
                      ? Semantics(
                          label: '${option.label(language)}: ${l.soldOut}',
                          excludeSemantics: true,
                          child: Opacity(
                            opacity: AppSizes.disabledOpacity,
                            child: IgnorePointer(
                              child: Pill(label: option.label(language), outlined: true, onTap: () {}),
                            ),
                          ),
                        )
                      : Pill(
                          label: option.label(language),
                          outlined: true,
                          selected: option.id == variant?.id,
                          onTap: () => setState(() => _variantId = option.id),
                        ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.x2),
          if (item.soldOut)
            Text(
              l.soldOut,
              style: AppType.footnote.copyWith(color: c.danger, fontWeight: FontWeight.w600),
            )
          else if (needsChoice)
            Text(l.chooseVariant, style: AppType.footnote.copyWith(color: c.textSecondary))
          else if (left != null)
            Text(
              variant == null ? l.unitsLeft(left) : '${variant.label(language)}: ${l.unitsLeft(left)}',
              style: AppType.footnote.copyWith(color: c.warning, fontWeight: FontWeight.w600),
            ),
        ],
      );

      if (student && balance != null) {
        final canOrder = !item.soldOut && !needsChoice && short <= 0;
        action = Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (short > 0 && !item.soldOut)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.x2),
                child: Text(
                  l.moreCoinsNeeded(formatCoins(short, l)),
                  textAlign: TextAlign.center,
                  style: AppType.footnote.copyWith(color: c.textSecondary),
                ),
              ),
            Opacity(
              opacity: canOrder ? 1 : AppSizes.disabledOpacity,
              child: PrimaryButton(label: l.orderAction, onPressed: canOrder ? () => _order(item, variant, balance) : null),
            ),
          ],
        );
      } else if (!student) {
        // An App user looks; ordering opens when they join the centre.
        action = Text(
          l.shopJoinBanner,
          textAlign: TextAlign.center,
          style: AppType.footnote.copyWith(color: c.textSecondary),
        );
      }
    }

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: BackChevron(home: Routes.shop),
            ),
            Expanded(child: body),
            if (action != null) Padding(padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x4), child: action),
          ],
        ),
      ),
    );
  }
}

/// 10b: what is ordered, and the balance before and after.
class ConfirmOrderSheet extends ConsumerStatefulWidget {
  const ConfirmOrderSheet({super.key, required this.item, required this.variant, required this.balance});

  final ShopItem item;
  final ShopVariant? variant;
  final int balance;

  @override
  ConsumerState<ConfirmOrderSheet> createState() => _ConfirmOrderSheetState();
}

class _ConfirmOrderSheetState extends ConsumerState<ConfirmOrderSheet> {
  bool _busy = false;
  Object? _error;

  /// One key for this sheet: a second tap, or a retry after a lost answer, is the same order.
  late final String _requestKey = 'app:${ref.read(authProvider).profile?.id}:${DateTime.now().microsecondsSinceEpoch}';

  Future<void> _confirm() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ordersProvider.notifier).order(rewardId: widget.item.id, variantId: widget.variant?.id, requestKey: _requestKey);
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final item = widget.item;
    final variant = widget.variant;

    Widget amount(String label, int coins) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppType.footnote.copyWith(color: c.textSecondary)),
        CoinsText(coins, style: AppType.title.copyWith(color: c.text)),
      ],
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
              child: Text(l.confirmOrderTitle, style: AppType.title.copyWith(color: c.text)),
            ),
            const SizedBox(height: AppSpacing.x4),
            Row(
              children: [
                SizedBox.square(
                  dimension: AppSizes.qrTab,
                  child: RewardPhoto(path: item.photoPath, radius: AppRadii.button),
                ),
                const SizedBox(width: AppSpacing.x3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.name, style: AppType.headline.copyWith(color: c.text)),
                      if (variant != null) Text('${l.shopVariant}: ${variant.label(l.localeName)}', style: AppType.footnote.copyWith(color: c.textSecondary)),
                      CoinsText(
                        item.cost,
                        style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.x4),
            Container(
              padding: const EdgeInsets.all(AppSpacing.x4),
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.card)),
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: AppSpacing.x3,
                runSpacing: AppSpacing.x2,
                children: [
                  amount(l.balanceNow, widget.balance),
                  ExcludeSemantics(
                    child: Icon(Icons.arrow_forward, color: c.textSecondary, size: AppSizes.icon),
                  ),
                  amount(l.balanceAfter, widget.balance - item.cost),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.x3),
            Row(
              children: [
                ExcludeSemantics(
                  child: Icon(Icons.info_outline, color: c.textSecondary, size: AppSpacing.x5),
                ),
                const SizedBox(width: AppSpacing.x2),
                Expanded(
                  child: Text(l.pickupNote, style: AppType.footnote.copyWith(color: c.textSecondary)),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.x3),
              Semantics(
                liveRegion: true,
                child: Text(shopFailureText(_error!, l), style: AppType.footnote.copyWith(color: c.danger)),
              ),
            ],
            const SizedBox(height: AppSpacing.x4),
            PrimaryButton(label: l.confirm, busy: _busy, onPressed: _confirm),
            const SizedBox(height: AppSpacing.x3),
            SecondaryButton(label: l.cancel, onPressed: _busy ? null : () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
  }
}
