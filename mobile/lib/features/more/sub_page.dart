import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/home.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';

/// A page under More: a back chevron, a large title and the content.
class SubPage extends StatelessWidget {
  const SubPage({super.key, required this.title, required this.child, this.grouped = false, this.padded = true});

  final String title;
  final Widget child;

  /// On the grey page of grouped lists.
  final bool grouped;

  /// The usual side padding around the content.
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return ColoredBox(
      color: grouped ? c.groupedBg : c.bg,
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Semantics(
                  button: true,
                  label: l.back,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => context.canPop() ? context.pop() : context.go(Routes.more),
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
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
              child: Semantics(
                header: true,
                child: Text(title, style: AppType.largeTitle.copyWith(color: c.text)),
              ),
            ),
            Expanded(
              child: padded
                  ? Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
                      child: child,
                    )
                  : child,
            ),
          ],
        ),
      ),
    );
  }
}

/// A list that is loading, failed, empty or there. Pull down to read it again.
class AsyncList<T> extends StatelessWidget {
  const AsyncList({
    super.key,
    required this.value,
    required this.onRefresh,
    required this.emptyIcon,
    required this.emptyTitle,
    required this.builder,
    this.isEmpty,
  });

  final AsyncValue<T> value;
  final Future<void> Function() onRefresh;
  final IconData emptyIcon;
  final String emptyTitle;

  /// The scrollable content for the data.
  final Widget Function(T data) builder;
  final bool Function(T data)? isEmpty;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final data = value.value;
    if (data == null && value.hasError) {
      return EmptyState(
        icon: Icons.wifi_off_outlined,
        title: value.error is OfflineException ? l.errorNetwork : l.errorGeneric,
        action: SecondaryButton(label: l.retry, onPressed: onRefresh),
      );
    }
    if (data == null) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Skeleton(height: AppSizes.row),
          SizedBox(height: AppSpacing.x3),
          Skeleton(height: AppSizes.row),
          SizedBox(height: AppSpacing.x3),
          Skeleton(height: AppSizes.row),
        ],
      );
    }
    final empty = isEmpty?.call(data) ?? (data is List && data.isEmpty);
    return RefreshIndicator(
      color: c.primary,
      backgroundColor: c.elevated,
      onRefresh: onRefresh,
      child: empty
          ? LayoutBuilder(
              builder: (context, box) => SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: SizedBox(
                  height: box.maxHeight,
                  child: EmptyState(icon: emptyIcon, title: emptyTitle),
                ),
              ),
            )
          : builder(data),
    );
  }
}

/// A group of rows on one card, with hairlines between them.
class RowGroup extends StatelessWidget {
  const RowGroup({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.x4),
      decoration: BoxDecoration(color: c.groupedCard, borderRadius: BorderRadius.circular(AppRadii.card)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (final (index, child) in children.indexed) ...[
            if (index > 0)
              Padding(
                padding: const EdgeInsetsDirectional.only(start: AppSpacing.x4 + AppSizes.icon + AppSpacing.x3),
                child: Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
              ),
            child,
          ],
        ],
      ),
    );
  }
}

/// One row of a grouped list: an icon, a label and, at the end, a value, a
/// tick or a chevron.
class ListRow extends StatelessWidget {
  const ListRow({
    super.key,
    required this.icon,
    required this.label,
    this.value,
    this.onTap,
    this.danger = false,
    this.selected,
    this.caption,
    this.keepValueTogether = false,
  });

  final IconData icon;
  final String label;

  /// Shown at the end, such as the chosen language.
  final String? value;
  final VoidCallback? onTap;
  final bool danger;

  /// A choice: true shows a tick. Null for an ordinary row.
  final bool? selected;

  /// The value is one thing, such as a phone number: it is never split across lines.
  final bool keepValueTogether;

  /// A second line, such as "Coming soon" on a row that is not open yet.
  final String? caption;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final enabled = onTap != null;
    final color = danger ? c.danger : (enabled ? c.text : c.textSecondary);
    final width = MediaQuery.sizeOf(context).width;
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final labels = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppType.body.copyWith(color: color)),
        if (caption != null) Text(caption!, style: AppType.caption.copyWith(color: c.textSecondary)),
      ],
    );
    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.row),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x2),
            child: Row(
              children: [
                ExcludeSemantics(
                  child: Icon(icon, color: danger ? c.danger : (enabled ? c.primary : c.textSecondary), size: AppSizes.icon),
                ),
                const SizedBox(width: AppSpacing.x3),
                if (value == null)
                  Expanded(child: labels)
                else if (keepValueTogether && largeText)
                  // No room for both on one line: the value goes under the label, still whole.
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        labels,
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: AlignmentDirectional.centerStart,
                          child: Text(value!.replaceAll(' ', '\u00A0'), style: AppType.body.copyWith(color: c.textSecondary)),
                        ),
                      ],
                    ),
                  )
                else if (keepValueTogether) ...[
                  // The value keeps its whole width; a long label wraps beside it.
                  Expanded(child: labels),
                  const SizedBox(width: AppSpacing.x3),
                  Text(value!.replaceAll(' ', '\u00A0'), style: AppType.body.copyWith(color: c.textSecondary)),
                ] else ...[
                  // The label takes what it needs, up to half the row; the value sits at the end.
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: width * 0.5),
                    child: labels,
                  ),
                  const SizedBox(width: AppSpacing.x3),
                  Expanded(
                    child: Text(
                      keepValueTogether ? value!.replaceAll(' ', '\u00A0') : value!,
                      textAlign: TextAlign.end,
                      style: AppType.body.copyWith(color: c.textSecondary),
                    ),
                  ),
                ],
                if (selected == true)
                  ExcludeSemantics(
                    child: Icon(Icons.check, color: c.primary, size: AppSizes.icon),
                  ),
                if (selected == null && enabled && !danger)
                  ExcludeSemantics(
                    child: Icon(Icons.chevron_right, color: c.textSecondary, size: AppSizes.icon),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
