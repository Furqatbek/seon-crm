import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/exam_state.dart';
import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../data/exams.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';

/// Opens an exam screen and, back from it, reads again what it may have
/// changed: the list, and the coins Home shows.
Future<void> openExamRoute(BuildContext context, WidgetRef ref, String route) async {
  await context.push(route);
  ref.invalidate(examListProvider);
  if (ref.read(authProvider).profile?.role == AccountRole.student) {
    await ref.read(studentHomeProvider.notifier).refresh();
  } else {
    ref.invalidate(appUserHomeProvider);
  }
}

/// The route of an exam: the attempt in progress, else its intro.
String examRouteOf(ExamSummary exam) => exam.openAttemptId != null ? Routes.examAttempt(exam.openAttemptId!) : Routes.examIntro(exam.id);

/// 20a: the mock exams side of the Game tab: the exams of one level, with the
/// person's past results.
class ExamsSide extends ConsumerStatefulWidget {
  const ExamsSide({super.key});

  @override
  ConsumerState<ExamsSide> createState() => _ExamsSideState();
}

class _ExamsSideState extends ConsumerState<ExamsSide> {
  ExamLevel? _level;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final level = _level ?? examLevelOf(ref.watch(authProvider).profile?.koreanLevel);
    final list = ref.watch(examListProvider);
    final exams = list.value?.where((exam) => exam.level == level).toList();

    return RefreshIndicator(
      color: c.primary,
      backgroundColor: c.elevated,
      onRefresh: () => ref.refresh(examListProvider.future).then((_) {}, onError: (_) {}),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x8),
        children: [
          Wrap(
            spacing: AppSpacing.x2,
            runSpacing: AppSpacing.x2,
            children: [
              for (final (value, label) in [(ExamLevel.topik1, l.levelTopik1), (ExamLevel.topik2, l.levelTopik2)])
                Pill(label: label, outlined: true, selected: value == level, onTap: () => setState(() => _level = value)),
            ],
          ),
          const SizedBox(height: AppSpacing.x4),
          if (exams == null && list.isLoading)
            const Skeleton.card()
          else if (exams == null)
            EmptyState(
              icon: Icons.wifi_off_outlined,
              title: list.error is OfflineException ? l.errorNetwork : l.errorGeneric,
              action: SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(examListProvider)),
            )
          else if (exams.isEmpty)
            EmptyState(icon: Icons.assignment_outlined, title: l.examsEmpty, message: l.examPractice)
          else
            for (final exam in exams) ...[ExamCard(exam: exam, onOpen: (route) => openExamRoute(context, ref, route)), const SizedBox(height: AppSpacing.x3)],
        ],
      ),
    );
  }
}

/// One exam in the list: new, in progress, or finished with its last result.
class ExamCard extends StatelessWidget {
  const ExamCard({super.key, required this.exam, required this.onOpen});

  final ExamSummary exam;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final last = exam.last;
    final meta = l.examMeta(
      exam.section(ExamSectionKind.listening)?.questionCount ?? 0,
      exam.section(ExamSectionKind.reading)?.questionCount ?? 0,
      exam.time.inMinutes,
    );
    final String action = exam.openAttemptId != null ? l.examContinue : (exam.coinsPerCorrect > 0 ? l.examRetake : l.examRetakePlain);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      padding: const EdgeInsets.all(AppSpacing.x4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              // A finished exam opens its last result; a new one its intro.
              onTap: () => onOpen(last != null && exam.openAttemptId == null ? Routes.examAttempt(last.attemptId) : examRouteOf(exam)),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(exam.title, style: AppType.headline.copyWith(color: c.text)),
                        const SizedBox(height: AppSpacing.x1),
                        if (last == null)
                          Text(meta, style: AppType.footnote.copyWith(color: c.textSecondary))
                        else
                          Text(
                            l.examDone(last.correct, exam.questions),
                            style: AppType.tabular(AppType.body.copyWith(color: c.success, fontWeight: FontWeight.w600)),
                          ),
                        if (last == null && exam.pays) ...[
                          const SizedBox(height: AppSpacing.x3),
                          Pill(label: l.examUpToCoins(formatCoins(exam.questions * exam.coinsPerCorrect, l))),
                        ],
                      ],
                    ),
                  ),
                  ExcludeSemantics(
                    child: Icon(Icons.chevron_right, color: c.primary, size: AppSizes.icon),
                  ),
                ],
              ),
            ),
          ),
          if (last != null || exam.openAttemptId != null) ...[
            const SizedBox(height: AppSpacing.x3),
            Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: LinkButton(label: action, onPressed: () => onOpen(examRouteOf(exam))),
            ),
          ],
        ],
      ),
    );
  }
}

/// 20b: an exam before it starts: its two sections, the rules, and Start.
class ExamIntroScreen extends ConsumerStatefulWidget {
  const ExamIntroScreen({super.key, required this.examId});

  final String examId;

  @override
  ConsumerState<ExamIntroScreen> createState() => _ExamIntroScreenState();
}

class _ExamIntroScreenState extends ConsumerState<ExamIntroScreen> {
  bool _starting = false;

  Future<void> _start() async {
    if (_starting) return;
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() => _starting = true);
    try {
      final attemptId = await ref.read(examRepositoryProvider).start(widget.examId);
      if (!mounted) return;
      // The attempt takes the intro's place: Back from it leads to the list.
      router.pushReplacement(Routes.examAttempt(attemptId));
    } catch (error) {
      if (!mounted) return;
      setState(() => _starting = false);
      messenger.showSnackBar(
        SnackBar(
          content: Text(switch (error) {
            ExamException(failure: ExamFailure.notOpen) => l.examNotOpen,
            OfflineException() => l.errorNetwork,
            _ => l.errorGeneric,
          }),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final list = ref.watch(examListProvider);
    final exam = list.value?.where((exam) => exam.id == widget.examId).firstOrNull;
    final student = ref.watch(authProvider).profile?.role == AccountRole.student;

    final Widget body;
    if (exam == null) {
      body = list.isLoading
          ? const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card())
          : EmptyState(
              icon: Icons.assignment_outlined,
              title: list.hasError ? (list.error is OfflineException ? l.errorNetwork : l.errorGeneric) : l.examGone,
              action: SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(examListProvider)),
            );
    } else {
      final rules = [
        l.examRulePlays(exam.audioMaxPlays),
        l.examRuleClock,
        if (exam.coinsPerCorrect > 0) exam.pays ? l.examRuleCoins(formatCoins(exam.coinsPerCorrect, l)) : l.examRuleNoCoins,
        if (exam.pays && !student) l.examRuleLocked,
      ];
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
              children: [
                Semantics(
                  header: true,
                  child: Text(exam.title, style: AppType.largeTitle.copyWith(color: c.text)),
                ),
                const SizedBox(height: AppSpacing.x1),
                Text(l.examPractice, style: AppType.footnote.copyWith(color: c.textSecondary)),
                const SizedBox(height: AppSpacing.x4),
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadii.card),
                    border: Border.all(color: c.border, width: AppSizes.hairline),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4),
                  child: Column(
                    children: [
                      for (final (index, section) in exam.sections.indexed) ...[
                        if (index > 0) Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
                        MergeSemantics(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: AppSpacing.x4),
                            child: Row(
                              children: [
                                ExcludeSemantics(
                                  child: Container(
                                    width: AppSizes.roundButton,
                                    height: AppSizes.roundButton,
                                    decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
                                    child: Icon(
                                      section.kind == ExamSectionKind.listening ? Icons.headphones_outlined : Icons.menu_book_outlined,
                                      color: c.primary,
                                      size: AppSizes.icon,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: AppSpacing.x3),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        section.kind == ExamSectionKind.listening ? l.examListening : l.examReading,
                                        style: AppType.headline.copyWith(color: c.text),
                                      ),
                                      Text(
                                        l.examSectionMeta(section.questionCount, section.timeLimit.inMinutes),
                                        style: AppType.footnote.copyWith(color: c.textSecondary),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.x5),
                Semantics(
                  header: true,
                  child: Text(
                    l.examRules,
                    style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: AppSpacing.x2),
                for (final rule in rules)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.x1 + AppSizes.outline),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ExcludeSemantics(
                          child: Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.x2 - AppSizes.outline),
                            child: Container(
                              width: AppSizes.dot,
                              height: AppSizes.dot,
                              decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.x3),
                        Expanded(
                          child: Text(rule, style: AppType.body.copyWith(color: c.text)),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: AppSpacing.x4),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.x4),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.button)),
                  child: Row(
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.headphones_outlined, color: c.text, size: AppSizes.icon),
                      ),
                      const SizedBox(width: AppSpacing.x3),
                      Expanded(
                        child: Text(
                          l.examHeadphones,
                          style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
            child: PrimaryButton(label: exam.openAttemptId != null ? l.examContinue : l.examStart, busy: _starting, onPressed: _start),
          ),
        ],
      );
    }

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x2),
              child: BackChevron(home: Routes.gameExams),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}
