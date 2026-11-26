import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';

/// The five tabs: Home, Game, the raised QR button, Shop and More.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  static const qrIndex = 2;

  void _open(int index) => shell.goBranch(index, initialLocation: index == shell.currentIndex);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final current = shell.currentIndex;
    return Scaffold(
      body: shell,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          color: c.surface,
          border: Border(
            top: BorderSide(color: c.border, width: AppSizes.hairline),
          ),
        ),
        child: SafeArea(
          top: false,
          // The bar keeps its size at large text sizes, as phone tab bars do; each tab is named to screen readers.
          child: MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1,
            child: SizedBox(
              height: AppSizes.tabBarHeight,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.topCenter,
                children: [
                  Row(
                    children: [
                      _Tab(icon: Icons.home_outlined, label: l.tabHome, selected: current == 0, onTap: () => _open(0)),
                      _Tab(icon: Icons.sports_esports_outlined, label: l.tabGame, selected: current == 1, onTap: () => _open(1)),
                      // Room for the raised button.
                      const Expanded(child: SizedBox()),
                      _Tab(icon: Icons.shopping_bag_outlined, label: l.tabShop, selected: current == 3, onTap: () => _open(3)),
                      _Tab(icon: Icons.menu, label: l.tabMore, selected: current == 4, onTap: () => _open(4)),
                    ],
                  ),
                  Positioned(
                    top: -AppSpacing.x5,
                    child: Semantics(
                      button: true,
                      selected: current == qrIndex,
                      label: l.tabQr,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => _open(qrIndex),
                        // A ring in the bar's colour lifts the button off the hairline.
                        child: Container(
                          padding: const EdgeInsets.all(AppSpacing.x1),
                          decoration: BoxDecoration(color: c.surface, shape: BoxShape.circle),
                          child: Container(
                            width: AppSizes.qrTab,
                            height: AppSizes.qrTab,
                            decoration: BoxDecoration(color: c.primaryFill, shape: BoxShape.circle, boxShadow: c.glow),
                            child: ExcludeSemantics(
                              child: Icon(Icons.qr_code_2, color: c.onPrimaryFill, size: AppSpacing.x8),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.icon, required this.label, required this.selected, required this.onTap});

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final color = selected ? c.primary : c.textSecondary;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: ExcludeSemantics(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: color, size: AppSizes.icon),
                const SizedBox(height: AppSpacing.x1),
                // One line, shrinking to fit at large text sizes instead of overflowing.
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x1),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      label,
                      maxLines: 1,
                      style: AppType.caption.copyWith(color: color, fontWeight: selected ? FontWeight.w600 : FontWeight.w400),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
