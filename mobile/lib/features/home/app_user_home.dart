import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/exam_state.dart';
import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/offer_state.dart';
import '../../core/state.dart';
import '../../core/time.dart';
import '../../data/exams.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../data/offers.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../auth/sign_up_screen.dart' show levelName;
import '../exams/exams_side.dart';
import '../offers/offers.dart';
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
    final exams = ref.watch(examListProvider).value;
    final next = exams == null ? null : nextUnfinishedExam(exams, examLevelOf(profile?.koreanLevel));

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
              onRefresh: () {
                ref.invalidate(examListProvider);
                ref.invalidate(openLessonsProvider);
                return ref.refresh(appUserHomeProvider.future).then((_) {}, onError: (_) {});
              },
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
                  MockExamHeroCard(
                    level: profile?.koreanLevel,
                    exams: exams,
                    // Straight into the next exam; with none left, to the list.
                    onTap: () => next == null ? context.go(Routes.gameExams) : openExamRoute(context, ref, examRouteOf(next)),
                  ),
                  const SizedBox(height: AppSpacing.x3),
                  if (data == null && !home.hasError) const Skeleton.card() else LockedCoinsCard(coins: data?.lockedCoins ?? 0),
                  if (data?.voucher != null) ...[
                    const SizedBox(height: AppSpacing.x3),
                    VoucherCard(voucher: data!.voucher!, onTap: () => context.go(Routes.voucher)),
                  ],
                  const SizedBox(height: AppSpacing.x3),
                  OpenLessonCard(lessons: ref.watch(openLessonsProvider).value, now: ref.watch(clockProvider)(), onOpen: () => context.go(Routes.openLessons)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The hero card: the next unfinished mock exam for the person's level, with
/// Start (or Continue when one is in progress). With nothing left to take it
/// says so and leads to the list.
class MockExamHeroCard extends StatelessWidget {
  const MockExamHeroCard({super.key, required this.level, required this.exams, this.onTap});

  final KoreanLevel? level;

  /// The published exams; null while they are being read or when they could not be.
  final List<ExamSummary>? exams;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final examLevel = examLevelOf(level);
    final next = exams == null ? null : nextUnfinishedExam(exams!, examLevel);
    final String? note = next != null
        ? l.examMeta(
            next.section(ExamSectionKind.listening)?.questionCount ?? 0,
            next.section(ExamSectionKind.reading)?.questionCount ?? 0,
            next.time.inMinutes,
          )
        : (exams == null ? null : (exams!.any((exam) => exam.level == examLevel) ? l.examHeroAllDone : l.examsEmpty));
    return Semantics(
      button: onTap != null,
      container: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: GradientOutline(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.x5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
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
                          Text(next?.title ?? (examLevel == ExamLevel.topik2 ? l.levelTopik2 : l.levelTopik1), style: AppType.title.copyWith(color: c.text)),
                          if (note != null) ...[const SizedBox(height: AppSpacing.x1), Text(note, style: AppType.footnote.copyWith(color: c.textSecondary))],
                        ],
                      ),
                    ),
                  ],
                ),
                if (next != null) ...[
                  const SizedBox(height: AppSpacing.x4),
                  // The whole card is the button; this is how it looks.
                  ExcludeSemantics(
                    child: IgnorePointer(
                      child: PrimaryButton(label: next.openAttemptId != null ? l.examContinue : l.examStart, onPressed: () {}),
                    ),
                  ),
                  Semantics(label: next.openAttemptId != null ? l.examContinue : l.examStart, child: const SizedBox.shrink()),
                ],
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

/// "A gift for you!": the voucher, its code and the day it runs out. Opens My voucher.
class VoucherCard extends StatelessWidget {
  const VoucherCard({super.key, required this.voucher, this.onTap});

  final HomeVoucher voucher;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.voucherTitle, style: AppType.headline.copyWith(color: c.text)),
                const SizedBox(height: AppSpacing.x1),
                Text(voucherOffer(voucher, l), style: AppType.body.copyWith(color: c.text)),
                const SizedBox(height: AppSpacing.x1),
                Text(
                  [if (voucher.code.isNotEmpty) voucher.code, keepTogether(l.validUntil(dayMonth(tashkentDay(voucher.expiresAt), l)))].join(' · '),
                  style: AppType.tabular(AppType.footnote.copyWith(color: c.textSecondary)),
                ),
              ],
            ),
          ),
          if (onTap != null)
            ExcludeSemantics(
              child: Icon(Icons.chevron_right, color: c.primary, size: AppSizes.icon),
            ),
        ],
      ),
    );
  }
}

/// The free open lesson: the person's booking, or the next lesson with Book.
class OpenLessonCard extends StatelessWidget {
  const OpenLessonCard({super.key, required this.lessons, required this.now, required this.onOpen});

  /// Null while the lessons are being read or when they could not be.
  final OpenLessons? lessons;
  final DateTime now;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final booking = lessons?.booking;
    if (booking != null) {
      return Semantics(
        button: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onOpen,
          child: BookingCard(booking: booking, now: now),
        ),
      );
    }
    final next = lessons?.sessions.where((session) => session.seatsLeft > 0).firstOrNull;
    final place = next == null ? '' : lessonPlace(l, level: next.level, room: next.room, teacher: next.teacher);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.openLessonTitle, style: AppType.headline.copyWith(color: c.text)),
          const SizedBox(height: AppSpacing.x1),
          if (next != null) ...[
            Text('${lessonDay(next.startsAt, l)} · ${lessonHours(next.startsAt, next.endsAt)}', style: AppType.tabular(AppType.body.copyWith(color: c.text))),
            if (place.isNotEmpty) Text(place, style: AppType.footnote.copyWith(color: c.textSecondary)),
          ] else if (lessons != null)
            Text(l.openLessonsEmpty, style: AppType.body.copyWith(color: c.textSecondary)),
          const SizedBox(height: AppSpacing.x4),
          PrimaryButton(label: l.bookOpenLesson, onPressed: onOpen),
        ],
      ),
    );
  }
}
