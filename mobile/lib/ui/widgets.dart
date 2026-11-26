import 'package:material_ui/material_ui.dart';

import '../core/format.dart';
import '../l10n/app_localizations.dart';
import 'tokens.dart';

// The shared widgets every screen is built from. Colours, radii, sizes and
// text styles come from tokens.dart only.

/// A card: radius 20 with a 1 pt hairline on the surface colour.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(AppSpacing.x4), this.onTap, this.semanticLabel});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final card = DecoratedBox(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Padding(padding: padding, child: child),
    );
    if (onTap == null) return Semantics(container: true, label: semanticLabel, child: card);
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: card),
    );
  }
}

/// "5-dekabr" and "3-oʻrin" are one word each: a line never breaks at their hyphen.
String keepTogether(String text) => text.replaceAll('-', '\u2011');

/// A label, a big value and a line under it: Rank, Coins, Balance, Attendance.
class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.caption, this.valueColor, this.captionColor, this.onTap});

  final String label;
  final String value;
  final String? caption;
  final Color? valueColor;
  final Color? captionColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: AppType.footnote.copyWith(color: c.textSecondary)),
          const SizedBox(height: AppSpacing.x1),
          Text(keepTogether(value), style: AppType.title.copyWith(color: valueColor ?? c.text)),
          if (caption != null) ...[
            const SizedBox(height: AppSpacing.x1),
            Text(keepTogether(caption!), style: AppType.footnote.copyWith(color: captionColor ?? c.textSecondary)),
          ],
        ],
      ),
    );
  }
}

enum PillTone { neutral, primary, success, warning, danger }

/// A fully rounded label. `selected` fills it with the primary colour, as the
/// level chosen at sign-up; with `onTap` it is a choice the user can make.
class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, this.tone = PillTone.neutral, this.selected = false, this.outlined = false, this.onTap});

  final String label;
  final PillTone tone;
  final bool selected;
  final bool outlined;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final toneColor = switch (tone) {
      PillTone.neutral => c.text,
      PillTone.primary => c.primary,
      PillTone.success => c.success,
      PillTone.warning => c.warning,
      PillTone.danger => c.danger,
    };
    final choice = onTap != null;
    final pill = Container(
      constraints: BoxConstraints(minHeight: choice ? AppSizes.tapTarget : AppSpacing.x8),
      padding: EdgeInsets.symmetric(horizontal: choice ? AppSpacing.x4 : AppSpacing.x3, vertical: AppSpacing.x1),
      decoration: BoxDecoration(
        color: selected ? c.primaryFill : (outlined ? c.bg : c.surface),
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: outlined && !selected ? Border.all(color: c.border, width: AppSizes.hairline) : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              label,
              style: (choice ? AppType.body : AppType.footnote).copyWith(
                color: selected ? c.onPrimaryFill : toneColor,
                fontWeight: selected || !choice ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
        ],
      ),
    );
    if (!choice) return pill;
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: pill),
    );
  }
}

/// Whole soʻm, written for the interface language. Never a raw number.
class MoneyText extends StatelessWidget {
  const MoneyText(this.amount, {super.key, this.style});

  final int amount;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) =>
      Text(formatMoney(amount, AppLocalizations.of(context)), style: AppType.tabular(style ?? DefaultTextStyle.of(context).style));
}

/// A number of coins: tanga, монеты, coins, 코인.
class CoinsText extends StatelessWidget {
  const CoinsText(this.coins, {super.key, this.style});

  final int coins;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) =>
      Text(formatCoins(coins, AppLocalizations.of(context)), style: AppType.tabular(style ?? DefaultTextStyle.of(context).style));
}

/// Nothing to show yet: an icon, a title, a line of explanation and, when
/// there is something to do about it, one action.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.x8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(
              child: Container(
                width: AppSizes.qrTab,
                height: AppSizes.qrTab,
                decoration: BoxDecoration(
                  color: c.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: c.border, width: AppSizes.hairline),
                ),
                child: Icon(icon, color: c.primary, size: AppSizes.icon),
              ),
            ),
            const SizedBox(height: AppSpacing.x4),
            Text(
              title,
              textAlign: TextAlign.center,
              style: AppType.headline.copyWith(color: c.text),
            ),
            if (message != null) ...[
              const SizedBox(height: AppSpacing.x2),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: AppType.body.copyWith(color: c.textSecondary),
              ),
            ],
            if (action != null) ...[const SizedBox(height: AppSpacing.x6), action!],
          ],
        ),
      ),
    );
  }
}

/// A grey block standing in for content that is loading.
class Skeleton extends StatelessWidget {
  const Skeleton({super.key, this.width, this.height = AppSpacing.x5, this.radius = AppSpacing.x2});

  /// As big as a card.
  const Skeleton.card({super.key, this.width, this.height = AppSizes.skeletonCard}) : radius = AppRadii.card;

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return ExcludeSemantics(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(radius)),
      ),
    );
  }
}

/// The one main action of a screen: violet, 52 pt tall, radius 14, with the
/// violet glow in the dark theme. `busy` shows a spinner and ignores taps.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.busy = false});

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
        child: Opacity(
          opacity: onPressed == null ? AppSizes.disabledOpacity : 1,
          child: Container(
            constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight, minWidth: double.infinity),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x3),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.primaryFill, borderRadius: BorderRadius.circular(AppRadii.button), boxShadow: c.glow),
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
      ),
    );
  }
}

/// The second action: the same shape with a hairline and violet text.
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({super.key, required this.label, required this.onPressed, this.destructive = false});

  final String label;
  final VoidCallback? onPressed;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Semantics(
      button: true,
      enabled: onPressed != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight, minWidth: double.infinity),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x3),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: c.bg,
            borderRadius: BorderRadius.circular(AppRadii.button),
            border: Border.all(color: c.border, width: AppSizes.hairline),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: AppType.headline.copyWith(color: destructive ? c.danger : c.primary),
          ),
        ),
      ),
    );
  }
}

/// A text-only action, such as "Forgot your password?".
class LinkButton extends StatelessWidget {
  const LinkButton({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Semantics(
      button: true,
      enabled: onPressed != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
          child: Center(
            widthFactor: 1,
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: AppType.body.copyWith(color: onPressed == null ? c.textSecondary : c.primary, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ),
    );
  }
}

/// The violet-to-cyan outline. Only where the spec allows the gradient: the
/// Home hero card, timers, the game rope and progress rings.
class GradientOutline extends StatelessWidget {
  const GradientOutline({super.key, required this.child, this.radius = AppRadii.card, this.width = AppSizes.outline, this.glow = true});

  final Widget child;
  final double radius;
  final double width;

  /// The violet glow of the dark theme, for the hero card.
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(gradient: appGradient, borderRadius: BorderRadius.circular(radius), boxShadow: glow ? c.glow : null),
      child: Padding(
        padding: EdgeInsets.all(width),
        child: DecoratedBox(
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(radius - width)),
          child: child,
        ),
      ),
    );
  }
}
