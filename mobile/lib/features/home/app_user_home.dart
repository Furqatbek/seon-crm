import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../core/time.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../auth/sign_up_screen.dart' show levelName;
import 'home_widgets.dart';

/// 02d: the App user Home: the next mock exam, locked coins, the free open
/// lesson and the voucher when there is one.
class AppUserHomeView extends ConsumerWidget {
  const AppUserHomeView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final profile = ref.watch(authProvider).profile;
    final home = ref.watch(appUserHomeProvider);
    final offline = home.hasError && home.error is OfflineException;
    final data = home.value;

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (home.hasError) StatusBanner(message: offline ? l.offlineBanner : l.loadFailedBanner),
          Expanded(
            child: RefreshIndicator(
              color: c.primary,
              backgroundColor: c.elevated,
              onRefresh: () => ref.refresh(appUserHomeProvider.future).then((_) {}, onError: (_) {}),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x8),
                children: [
                  HomeHeader(name: (profile?.fullName ?? '').trim().split(RegExp(r'\s+')).first),
                  if (profile?.koreanLevel != null) ...[
                    const SizedBox(height: AppSpacing.x2),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Pill(label: l.levelPill(levelName(l, profile!.koreanLevel!)), outlined: true),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.x4),
                  MockExamHeroCard(level: profile?.koreanLevel, onTap: () => context.go(Routes.game)),
                  const SizedBox(height: AppSpacing.x3),
                  if (data == null && !home.hasError) const Skeleton.card() else LockedCoinsCard(coins: data?.lockedCoins ?? 0),
                  if (data?.voucher != null) ...[const SizedBox(height: AppSpacing.x3), VoucherCard(voucher: data!.voucher!)],
                  const SizedBox(height: AppSpacing.x3),
                  OpenLessonCard(onBook: () => context.go(Routes.openLessons)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The hero card: the next unfinished mock exam for the person's level. The
/// exams arrive with a later phase; until then it says so and leads to the Game tab.
class MockExamHeroCard extends StatelessWidget {
  const MockExamHeroCard({super.key, required this.level, this.onTap});

  final KoreanLevel? level;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Semantics(
      button: onTap != null,
      container: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: GradientOutline(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.x5),
            child: Row(
              children: [
                ExcludeSemantics(
                  child: Container(
                    width: AppSizes.roundButton,
                    height: AppSizes.roundButton,
                    decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
                    child: Icon(Icons.menu_book_outlined, color: c.primary, size: AppSizes.icon),
                  ),
                ),
                const SizedBox(width: AppSpacing.x4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.mockExamTitle, style: AppType.footnote.copyWith(color: c.textSecondary)),
                      const SizedBox(height: AppSpacing.x1),
                      // Beginners practise with the TOPIK I exams.
                      Text(level == KoreanLevel.topik2 ? l.levelTopik2 : l.levelTopik1, style: AppType.title.copyWith(color: c.text)),
                      const SizedBox(height: AppSpacing.x1),
                      Text(l.mockExamSoon, style: AppType.footnote.copyWith(color: c.textSecondary)),
                    ],
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

/// Exam coins waiting until the person joins the centre.
class LockedCoinsCard extends StatelessWidget {
  const LockedCoinsCard({super.key, required this.coins});

  final int coins;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return AppCard(
      child: Row(
        children: [
          ExcludeSemantics(
            child: Container(
              width: AppSizes.roundButton,
              height: AppSizes.roundButton,
              decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
              child: Icon(Icons.lock_outline, color: c.primary, size: AppSizes.icon),
            ),
          ),
          const SizedBox(width: AppSpacing.x4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.lockedCoins, style: AppType.footnote.copyWith(color: c.textSecondary)),
                const SizedBox(height: AppSpacing.x1),
                Text(formatCoins(coins, l), style: AppType.title.copyWith(color: c.text)),
                const SizedBox(height: AppSpacing.x1),
                Text(l.lockedCoinsHint, style: AppType.footnote.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// What a voucher gives, in words.
String voucherOffer(HomeVoucher voucher, AppLocalizations l) => switch (voucher.kind) {
  'percent' => l.voucherPercent(voucher.value),
  'fixed' => l.voucherFixed(formatMoney(voucher.value, l)),
  _ => l.voucherTrialWeek,
};

/// "A gift for you!": the voucher and the day it runs out.
class VoucherCard extends StatelessWidget {
  const VoucherCard({super.key, required this.voucher});

  final HomeVoucher voucher;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.voucherTitle, style: AppType.headline.copyWith(color: c.text)),
          const SizedBox(height: AppSpacing.x1),
          Text(voucherOffer(voucher, l), style: AppType.body.copyWith(color: c.text)),
          const SizedBox(height: AppSpacing.x1),
          Text(l.validUntil(dayMonth(tashkentDay(voucher.expiresAt), l)), style: AppType.footnote.copyWith(color: c.textSecondary)),
        ],
      ),
    );
  }
}

/// The free open lesson. Booking arrives with a later phase.
class OpenLessonCard extends StatelessWidget {
  const OpenLessonCard({super.key, required this.onBook});

  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.openLessonTitle, style: AppType.headline.copyWith(color: c.text)),
          const SizedBox(height: AppSpacing.x1),
          Text(l.openLessonSoon, style: AppType.body.copyWith(color: c.textSecondary)),
          const SizedBox(height: AppSpacing.x4),
          PrimaryButton(label: l.bookOpenLesson, onPressed: onBook),
        ],
      ),
    );
  }
}
