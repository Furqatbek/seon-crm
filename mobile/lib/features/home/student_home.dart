import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/time.dart';
import '../../data/home.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'home_widgets.dart';

/// 02a: the Student Home. Everything on it comes from one call to
/// student_home(group_id) for the group chosen in the header.
class StudentHomeView extends ConsumerStatefulWidget {
  const StudentHomeView({super.key});

  @override
  ConsumerState<StudentHomeView> createState() => _StudentHomeViewState();
}

class _StudentHomeViewState extends ConsumerState<StudentHomeView> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // The countdown moves by itself; when the lesson has started, ask for the next one.
    _tick = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!mounted) return;
      final next = ref.read(studentHomeProvider).home?.next;
      if (next != null && !next.startsAt.isAfter(ref.read(clockProvider)())) {
        unawaited(ref.read(studentHomeProvider.notifier).refresh());
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final state = ref.watch(studentHomeProvider);
    final home = state.home;
    final banner = switch (state.problem) {
      HomeProblem.offline => l.offlineBanner,
      HomeProblem.failed => l.loadFailedBanner,
      HomeProblem.none => null,
    };

    final Widget content;
    if (home == null && state.problem == HomeProblem.none) {
      content = const HomeSkeleton();
    } else if (home == null) {
      content = EmptyState(
        icon: Icons.wifi_off_outlined,
        title: state.problem == HomeProblem.offline ? l.errorNetwork : l.errorGeneric,
        action: SecondaryButton(label: l.retry, onPressed: () => ref.read(studentHomeProvider.notifier).refresh()),
      );
    } else {
      content = RefreshIndicator(
        color: AppColors.of(context).primary,
        backgroundColor: AppColors.of(context).elevated,
        onRefresh: () => ref.read(studentHomeProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x8),
          children: _cards(context, home, ref.watch(clockProvider)()),
        ),
      );
    }

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (banner != null) StatusBanner(message: banner),
          Expanded(child: content),
        ],
      ),
    );
  }

  List<Widget> _cards(BuildContext context, StudentHome home, DateTime now) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    void open(String route) => context.go(route);

    final String balanceValue;
    final String balanceCaption;
    final Color balanceColor;
    switch (home.balanceState) {
      case BalanceState.paid:
        balanceValue = l.balancePaid;
        balanceCaption = l.nextPaymentOn(dayMonth(home.nextPaymentDate, l));
        balanceColor = c.success;
      case BalanceState.due:
        balanceValue = formatMoney(home.balance, l);
        balanceCaption = l.balanceDueBy(dayMonth(home.dueDate, l));
        balanceColor = c.warning;
      case BalanceState.debt:
        balanceValue = formatMoney(home.balance, l);
        balanceCaption = l.balanceDebtSince(dayMonth(home.dueDate, l));
        balanceColor = c.danger;
    }

    return [
      HomeHeader(name: home.firstName),
      if (home.groups.length > 1) ...[
        const SizedBox(height: AppSpacing.x3),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: GroupSwitcher(groups: home.groups, selected: home.groupId, onChosen: (id) => ref.read(studentHomeProvider.notifier).chooseGroup(id)),
        ),
      ],
      const SizedBox(height: AppSpacing.x4),
      HeroLessonCard(lesson: home.next, now: now, onTap: () => open(Routes.schedule)),
      if (home.nextExam != null) ...[const SizedBox(height: AppSpacing.x3), ExamCard(exam: home.nextExam!, now: now, onTap: () => open(Routes.schedule))],
      const SizedBox(height: AppSpacing.x3),
      CardPair(
        first: StatCard(
          label: l.rankInGroup,
          value: home.rank == null ? '—' : l.rankPlace(home.rank!),
          caption: home.rank == null ? l.rankNone : l.rankOf(home.rankOf ?? home.rank!),
          onTap: () => open(Routes.leaderboard),
        ),
        second: StatCard(
          label: l.coins,
          value: formatCoins(home.coins, l),
          caption: l.coinsThisWeek('${home.coinsWeek}'),
          captionColor: home.coinsWeek > 0 ? c.success : null,
          onTap: () => open(Routes.coinHistory),
        ),
      ),
      const SizedBox(height: AppSpacing.x3),
      CardPair(
        first: StatCard(label: l.balance, value: balanceValue, valueColor: balanceColor, caption: balanceCaption, onTap: () => open(Routes.payments)),
        second: StatCard(
          label: l.attendance,
          value: home.attendanceRate == null ? '—' : '${home.attendanceRate}%',
          caption: home.attendanceRate == null ? l.noLessonsYet : l.thisMonth,
          onTap: () => open(Routes.schedule),
        ),
      ),
    ];
  }
}

/// The header's group switcher, for a student in more than one group.
class GroupSwitcher extends StatelessWidget {
  const GroupSwitcher({super.key, required this.groups, required this.selected, required this.onChosen});

  final List<HomeGroup> groups;
  final String? selected;
  final ValueChanged<String> onChosen;

  Future<void> _choose(BuildContext context) async {
    final chosen = await showModalBottomSheet<String>(
      context: context,
      // Over the tab bar, as in the designs.
      useRootNavigator: true,
      builder: (sheet) {
        final c = AppColors.of(sheet);
        final l = AppLocalizations.of(sheet);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.page),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l.chooseGroup, style: AppType.headline.copyWith(color: c.text)),
                const SizedBox(height: AppSpacing.x2),
                for (final group in groups)
                  Semantics(
                    button: true,
                    selected: group.id == selected,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => Navigator.of(sheet).pop(group.id),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(group.name, style: AppType.body.copyWith(color: c.text)),
                            ),
                            if (group.id == selected)
                              ExcludeSemantics(
                                child: Icon(Icons.check, color: c.primary, size: AppSizes.icon),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
    if (chosen != null && chosen != selected) onChosen(chosen);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final current = groups.where((group) => group.id == selected).firstOrNull ?? groups.first;
    return Semantics(
      button: true,
      label: l.chooseGroup,
      value: current.name,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _choose(context),
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4),
          decoration: BoxDecoration(
            color: c.bg,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: c.border, width: AppSizes.hairline),
          ),
          child: ExcludeSemantics(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    current.name,
                    style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(width: AppSpacing.x1),
                Icon(Icons.expand_more, color: c.textSecondary, size: AppSpacing.x5),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Room 204 · Malika Tursunova", from whatever of the two is known.
String lessonPlace(HomeLesson lesson, AppLocalizations l) =>
    [if (lesson.room != null) l.roomNumber(lesson.room!), if (lesson.teacher != null) lesson.teacher!].join(' · ');

/// The hero card: the next lesson or exam of the chosen group with a live
/// countdown, inside the violet-to-cyan outline. Null says nothing is scheduled.
class HeroLessonCard extends StatelessWidget {
  const HeroLessonCard({super.key, required this.lesson, required this.now, this.onTap});

  final HomeLesson? lesson;
  final DateTime now;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final lesson = this.lesson;
    final place = lesson == null ? '' : lessonPlace(lesson, l);
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lesson?.isExam == true ? l.exam : l.nextLesson, style: AppType.footnote.copyWith(color: c.textSecondary)),
                const SizedBox(height: AppSpacing.x1),
                if (lesson == null)
                  Text(l.nothingScheduled, style: AppType.title.copyWith(color: c.text))
                else ...[
                  if (lesson.isExam && lesson.examTitle != null) Text(lesson.examTitle!, style: AppType.headline.copyWith(color: c.text)),
                  Text(dayAndTime(lesson.startsAt, now, l), style: AppType.title.copyWith(color: c.text)),
                  if (place.isNotEmpty) ...[const SizedBox(height: AppSpacing.x1), Text(place, style: AppType.body.copyWith(color: c.text))],
                  const SizedBox(height: AppSpacing.x2),
                  Text(countdown(lesson.startsAt, now, l), style: AppType.body.copyWith(color: c.accentText)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// An exam that is coming up after the next lesson.
class ExamCard extends StatelessWidget {
  const ExamCard({super.key, required this.exam, required this.now, this.onTap});

  final HomeLesson exam;
  final DateTime now;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final days = tashkentDay(exam.startsAt).difference(tashkentDay(now)).inDays;
    final when = [dayAndTime(exam.startsAt, now, l), if (exam.room != null) l.roomNumber(exam.room!)].join(' · ');
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.exam, style: AppType.footnote.copyWith(color: c.textSecondary)),
                const SizedBox(height: AppSpacing.x1),
                Text(exam.examTitle ?? l.exam, style: AppType.headline.copyWith(color: c.text)),
                Text(when, style: AppType.footnote.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
          // Due soon: today or tomorrow.
          if (days <= 1) ...[const SizedBox(width: AppSpacing.x2), Pill(label: days <= 0 ? l.today : l.tomorrow, tone: PillTone.warning)],
        ],
      ),
    );
  }
}

/// 18a: the shape of Home while it loads.
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const SingleChildScrollView(
      physics: NeverScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Skeleton(width: AppSizes.logo, height: AppSpacing.x8),
                ),
              ),
              Skeleton(width: AppSizes.roundButton, height: AppSizes.roundButton, radius: AppRadii.pill),
            ],
          ),
          SizedBox(height: AppSpacing.x4),
          Skeleton.card(height: AppSizes.logo),
          SizedBox(height: AppSpacing.x3),
          CardPair(first: Skeleton.card(), second: Skeleton.card()),
          SizedBox(height: AppSpacing.x3),
          CardPair(first: Skeleton.card(), second: Skeleton.card()),
        ],
      ),
    );
  }
}
