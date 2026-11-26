import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/home_state.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';

/// The bell, with the number of unread notifications kept live.
class BellButton extends ConsumerWidget {
  const BellButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    return Semantics(
      button: true,
      label: l.notifications,
      value: l.unreadCount(unread),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => context.push(Routes.notifications),
        child: ExcludeSemantics(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: AppSizes.roundButton,
                height: AppSizes.roundButton,
                decoration: BoxDecoration(color: c.surface, shape: BoxShape.circle),
                child: Icon(Icons.notifications_none, color: c.text, size: AppSizes.icon),
              ),
              if (unread > 0)
                PositionedDirectional(
                  top: -AppSpacing.x1,
                  end: -AppSpacing.x1,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: AppSizes.counter, minHeight: AppSizes.counter),
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x1),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: c.primaryFill,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                      border: Border.all(color: c.bg, width: AppSizes.outline),
                    ),
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      textScaler: TextScaler.noScaling,
                      style: AppType.caption.copyWith(color: c.onPrimaryFill, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Hello, Aziza" with the bell beside it.
class HomeHeader extends StatelessWidget {
  const HomeHeader({super.key, required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(l.greeting(name), style: AppType.largeTitle.copyWith(color: c.text)),
          ),
        ),
        const SizedBox(width: AppSpacing.x3),
        const BellButton(),
      ],
    );
  }
}

/// A strip across the top: no connection, or the page could not be updated.
class StatusBanner extends StatelessWidget {
  const StatusBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        color: c.warningTint,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page, vertical: AppSpacing.x3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ExcludeSemantics(
              child: Icon(Icons.wifi_off_outlined, color: c.warning, size: AppSpacing.x5),
            ),
            const SizedBox(width: AppSpacing.x3),
            Expanded(
              child: Text(
                message,
                style: AppType.footnote.copyWith(color: c.warning, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Two cards side by side; one under the other when the text is large, so
/// nothing is squeezed or cut.
class CardPair extends StatelessWidget {
  const CardPair({super.key, required this.first, required this.second});

  final Widget first;
  final Widget second;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.textScalerOf(context).scale(1) > 1.3) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          first,
          const SizedBox(height: AppSpacing.x3),
          second,
        ],
      );
    }
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: first),
          const SizedBox(width: AppSpacing.x3),
          Expanded(child: second),
        ],
      ),
    );
  }
}
