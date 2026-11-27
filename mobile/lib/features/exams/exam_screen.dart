import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/exam_state.dart';
import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../data/exams.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../game/game_widgets.dart';
import '../home/home_widgets.dart';
import '../more/sub_page.dart';

String sectionName(AppLocalizations l, ExamSectionKind kind) => kind == ExamSectionKind.listening ? l.examListening : l.examReading;

/// 21–23: one attempt, from its first question to its result. The server
/// keeps the time: leaving the screen or the app does not stop it, and coming
/// back shows where the attempt is by then.
class ExamScreen extends ConsumerStatefulWidget {
  const ExamScreen({super.key, required this.attemptId});

  final String attemptId;

  @override
  ConsumerState<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends ConsumerState<ExamScreen> with WidgetsBindingObserver {
  late final ExamSession _session;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _session = ExamSession(
      attemptId: widget.attemptId,
      repository: ref.read(examRepositoryProvider),
      now: ref.read(clockProvider),
      audio: ref.read(examAudioProvider)(),
    )..addListener(_changed);
    _session.start();
    // The section's timer moves with the clock.
    _ticker = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted && _session.state?.inProgress == true) setState(() {});
    });
    WidgetsBinding.instance.addObserver(this);
  }

  void _changed() {
    if (!mounted) return;
    if (_session.state?.inProgress == false) _ticker?.cancel();
    setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back in front: the time went on meanwhile, and the server says where the attempt is.
    if (state == AppLifecycleState.resumed) unawaited(_session.refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    _session
      ..removeListener(_changed)
      ..dispose();
    super.dispose();
  }

  /// Whatever screen is next shows what the attempt changed: the list, and the coins on Home.
  void _refreshOthers() {
    ref.invalidate(examListProvider);
    if (ref.read(authProvider).profile?.role == AccountRole.student) {
      unawaited(ref.read(studentHomeProvider.notifier).refresh());
    } else {
      ref.invalidate(appUserHomeProvider);
    }
  }

  void _leave() {
    if (context.canPop()) return context.pop();
    _refreshOthers();
    context.go(Routes.gameExams);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final state = _session.state;

    final Widget body;
    if (_session.notFound) {
      body = EmptyState(
        icon: Icons.assignment_outlined,
        title: l.examGone,
        action: SecondaryButton(label: l.examBackToList, onPressed: _leave),
      );
    } else if (state == null) {
      body = _session.reconnecting
          ? EmptyState(
              icon: Icons.wifi_off_outlined,
              title: l.gameReconnecting,
              action: SecondaryButton(label: l.examBackToList, onPressed: _leave),
            )
          : const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card());
    } else if (state.result != null) {
      body = ExamResultView(state: state, student: ref.watch(authProvider).profile?.role == AccountRole.student, onLeave: _leave);
    } else {
      body = ExamPlayView(session: _session);
    }

    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) _refreshOthers();
      },
      child: Scaffold(
        backgroundColor: c.bg,
        body: SafeArea(child: body),
      ),
    );
  }
}

/// 21 and 22a: the open section: its timer, the question on screen with its
/// recording or text, the choices, Flag and Next.
class ExamPlayView extends StatelessWidget {
  const ExamPlayView({super.key, required this.session});

  final ExamSession session;

  Future<void> _openGrid(BuildContext context) async {
    final submit = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => QuestionGridSheet(session: session),
    );
    if (submit == true) await session.submitSection();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final state = session.state!;
    final kind = state.currentSection ?? ExamSectionKind.listening;
    final limit = state.section(kind)?.timeLimit ?? Duration.zero;
    final left = session.timeLeft;
    final question = session.question;
    final total = session.questions.length;
    final last = session.index >= total - 1;
    final passage = question == null ? null : session.passageOf(question);
    final flagged = question != null && session.flagged(question.id);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (session.reconnecting) StatusBanner(message: l.gameReconnecting),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x3, AppSpacing.page, AppSpacing.x2),
          child: Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(sectionName(l, kind), maxLines: 1, style: AppType.title.copyWith(color: c.text)),
                  ),
                ),
              ),
              TimerRing(
                fraction: limit == Duration.zero ? 0 : left.inMilliseconds / limit.inMilliseconds,
                label: clockOf(left),
                semanticLabel: l.examTimeLeft(clockOf(left)),
                child: Text(
                  clockOf(left),
                  textScaler: TextScaler.noScaling,
                  style: AppType.tabular(AppType.headline.copyWith(color: left <= const Duration(minutes: 1) ? c.danger : c.text)),
                ),
              ),
              Expanded(
                child: Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: Semantics(
                    button: true,
                    label: l.examOpenGrid,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _openGrid(context),
                      child: Container(
                        width: AppSizes.roundButton,
                        height: AppSizes.roundButton,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: c.border, width: AppSizes.hairline),
                        ),
                        child: ExcludeSemantics(
                          child: Icon(Icons.grid_view_outlined, color: c.primary, size: AppSizes.icon),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
          child: Row(
            children: [
              Text(
                '${question?.number ?? 0}/$total',
                style: AppType.tabular(AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: AppSpacing.x3),
              Expanded(
                child: ExcludeSemantics(child: ScoreBar(fraction: total == 0 ? 0 : (session.index + 1) / total)),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.x3),
        Expanded(
          child: question == null
              ? const SizedBox()
              : ListView(
                  key: ValueKey(question.id),
                  padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
                  children: [
                    if (passage != null && passage.audio) ...[AudioCard(session: session, passage: passage), const SizedBox(height: AppSpacing.x4)],
                    if (passage != null && (passage.imagePath != null || (!passage.audio && (passage.text ?? '').isNotEmpty))) ...[
                      PassageCard(passage: passage),
                      const SizedBox(height: AppSpacing.x4),
                    ],
                    Text(question.prompt, style: AppType.headline.copyWith(color: c.text)),
                    const SizedBox(height: AppSpacing.x3),
                    ExamChoices(options: question.options, chosen: session.answerTo(question.id), onChoose: (id) => unawaited(session.choose(question.id, id))),
                  ],
                ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
          child: Row(
            children: [
              Semantics(
                button: true,
                selected: flagged,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: question == null ? null : () => unawaited(session.toggleFlag(question.id)),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight, minWidth: AppSizes.tapTarget),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ExcludeSemantics(
                          child: Icon(flagged ? Icons.flag : Icons.flag_outlined, color: flagged ? c.accentText : c.primary, size: AppSizes.icon),
                        ),
                        const SizedBox(width: AppSpacing.x2),
                        Text(
                          flagged ? l.examUnflag : l.examFlag,
                          style: AppType.body.copyWith(color: c.primary, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.x4),
              Expanded(
                child: PrimaryButton(
                  label: last ? l.examSubmitSection : l.examNext,
                  busy: session.submitting,
                  // After the last question: the list of them all, with what is still open.
                  onPressed: last ? () => _openGrid(context) : () => session.goTo(session.index + 1),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A thin bar filled as far as [fraction].
class ScoreBar extends StatelessWidget {
  const ScoreBar({super.key, required this.fraction});

  final double fraction;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: SizedBox(
        height: AppSpacing.x1 + AppSizes.outline,
        child: Stack(
          children: [
            Positioned.fill(child: ColoredBox(color: c.surface)),
            FractionallySizedBox(
              widthFactor: fraction.clamp(0.0, 1.0),
              child: DecoratedBox(
                decoration: BoxDecoration(color: c.primaryFill, borderRadius: BorderRadius.circular(AppRadii.pill)),
                child: const SizedBox.expand(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A picture of an exam, from its private bucket; a plain mark while it is
/// on its way or when it cannot be had.
class ExamImage extends ConsumerWidget {
  const ExamImage({super.key, required this.path, this.height});

  final String path;
  final double? height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final url = ref.watch(examMediaUrlProvider(path)).value;
    final missing = SizedBox(
      height: height,
      child: Center(
        child: Icon(Icons.image_outlined, color: c.textSecondary, size: AppSpacing.x8),
      ),
    );
    if (url == null) return missing;
    return Image.network(url, height: height, fit: BoxFit.contain, excludeFromSemantics: true, errorBuilder: (_, _, _) => missing);
  }
}

/// 21: a recording: Play, how far it has played, and how many plays are left.
/// It cannot be paused or moved: the server counts every start.
class AudioCard extends StatelessWidget {
  const AudioCard({super.key, required this.session, required this.passage});

  final ExamSession session;
  final ExamPassage passage;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return ValueListenableBuilder<AudioStatus>(
      valueListenable: session.audio.status,
      builder: (context, status, _) {
        final mine = status.passageId == passage.id;
        final playing = mine && status.playing;
        final left = session.playsLeft(passage);
        final canPlay = !status.playing && left > 0;
        final String note = session.audioFailed ? l.examAudioFailed : (playing ? l.examPlaying : (left > 0 ? l.examPlaysLeft(left) : l.examNoPlaysLeft));
        return Container(
          padding: const EdgeInsets.all(AppSpacing.x4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: c.border, width: AppSizes.hairline),
          ),
          child: Row(
            children: [
              Semantics(
                container: true,
                button: true,
                enabled: canPlay,
                label: l.examPlay,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: canPlay ? () => unawaited(session.play()) : null,
                  child: Opacity(
                    opacity: canPlay || playing ? 1 : AppSizes.disabledOpacity,
                    child: Container(
                      width: AppSizes.qrTab,
                      height: AppSizes.qrTab,
                      decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
                      child: ExcludeSemantics(
                        child: Icon(playing ? Icons.graphic_eq : Icons.play_arrow, color: c.primary, size: AppSizes.icon),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.x4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ExcludeSemantics(
                      child: SizedBox(
                        height: AppSpacing.x8,
                        width: double.infinity,
                        child: CustomPaint(
                          painter: _WavePainter(fraction: mine ? status.fraction : 0, idle: c.border, played: c.primary),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.x2),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        note,
                        style: AppType.footnote.copyWith(color: session.audioFailed ? c.danger : c.textSecondary, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// The recording drawn as bars; the part already played is coloured.
class _WavePainter extends CustomPainter {
  const _WavePainter({required this.fraction, required this.idle, required this.played});

  final double fraction;
  final Color idle;
  final Color played;

  @override
  void paint(Canvas canvas, Size size) {
    const bar = AppSpacing.x1 - 1;
    const gap = AppSpacing.x1 + 1;
    final count = (size.width / (bar + gap)).floor();
    final paint = Paint()..strokeCap = StrokeCap.round;
    for (var i = 0; i < count; i++) {
      // The same gentle shape every time: nothing here reads the recording.
      final height = size.height * (0.3 + 0.7 * (0.5 + 0.5 * math.sin(i * 0.9) * math.cos(i * 0.37)).abs());
      final x = i * (bar + gap) + bar / 2;
      paint
        ..color = (i + 1) / count <= fraction ? played : idle
        ..strokeWidth = bar;
      canvas.drawLine(Offset(x, (size.height - height) / 2 + bar / 2), Offset(x, (size.height + height) / 2 - bar / 2), paint);
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) => old.fraction != fraction || old.idle != idle || old.played != played;
}

/// 22a: a text to read, with its picture when it has one.
class PassageCard extends StatelessWidget {
  const PassageCard({super.key, required this.passage, this.showText = true});

  final ExamPassage passage;

  /// What a recording says is shown in the review only.
  final bool showText;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final text = passage.text ?? '';
    return Container(
      padding: const EdgeInsets.all(AppSpacing.x4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (passage.imagePath != null) ExamImage(path: passage.imagePath!, height: AppSizes.logo),
          if (passage.imagePath != null && showText && text.isNotEmpty) const SizedBox(height: AppSpacing.x3),
          if (showText && text.isNotEmpty)
            Text(
              text,
              style: AppType.headline.copyWith(color: c.text, fontWeight: FontWeight.w400, height: 1.6),
            ),
        ],
      ),
    );
  }
}

/// A question's choices, numbered in their order: rows of text, or a grid
/// when they are pictures. In the review, [correct] marks the right one.
class ExamChoices extends StatelessWidget {
  const ExamChoices({super.key, required this.options, required this.chosen, this.onChoose, this.correct});

  final List<ExamOption> options;
  final String? chosen;
  final ValueChanged<String>? onChoose;

  /// The right choice, once the attempt is over.
  final String? correct;

  @override
  Widget build(BuildContext context) {
    final pictures = options.any((option) => option.imagePath != null);
    if (!pictures) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (index, option) in options.indexed)
            Padding(
              padding: EdgeInsets.only(top: index == 0 ? 0 : AppSpacing.x2),
              child: _Choice(
                number: index + 1,
                option: option,
                chosen: option.id == chosen,
                correct: correct,
                onTap: onChoose == null ? null : () => onChoose!(option.id),
              ),
            ),
        ],
      );
    }
    return LayoutBuilder(
      builder: (context, box) {
        final width = (box.maxWidth - AppSpacing.x3) / 2;
        return Wrap(
          spacing: AppSpacing.x3,
          runSpacing: AppSpacing.x3,
          children: [
            for (final (index, option) in options.indexed)
              SizedBox(
                width: width,
                child: _Choice(
                  number: index + 1,
                  option: option,
                  chosen: option.id == chosen,
                  correct: correct,
                  picture: true,
                  onTap: onChoose == null ? null : () => onChoose!(option.id),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.number, required this.option, required this.chosen, required this.correct, this.onTap, this.picture = false});

  final int number;
  final ExamOption option;
  final bool chosen;
  final String? correct;
  final VoidCallback? onTap;
  final bool picture;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final review = correct != null;
    final right = review && option.id == correct;
    final wrong = review && chosen && !right;
    final Color edge = right ? c.success : (wrong ? c.danger : (chosen ? c.primary : c.border));
    final marked = chosen || right;
    final Color fill = right ? c.successTint : (wrong ? c.dangerTint : (chosen ? c.primaryTint : (picture ? c.surface : c.bg)));
    final badge = Container(
      width: AppSpacing.x6 + AppSpacing.x1,
      height: AppSpacing.x6 + AppSpacing.x1,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: marked || wrong ? edge : null,
        border: marked || wrong ? null : Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Text(
        '$number',
        textScaler: TextScaler.noScaling,
        style: AppType.footnote.copyWith(color: marked || wrong ? (right || wrong ? c.bg : c.onPrimaryFill) : c.textSecondary, fontWeight: FontWeight.w600),
      ),
    );
    final String? note = !review
        ? null
        : (right ? (chosen ? '${l.examYourAnswer} · ${l.examRightAnswer}' : l.examRightAnswer) : (chosen ? l.examYourAnswer : null));
    final Widget content;
    if (picture) {
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ExcludeSemantics(child: badge),
              const Spacer(),
              if (marked || wrong)
                ExcludeSemantics(
                  child: Icon(wrong ? Icons.cancel : Icons.check_circle, color: edge, size: AppSizes.icon),
                ),
            ],
          ),
          if (option.imagePath != null) ExamImage(path: option.imagePath!, height: AppSizes.avatar) else const SizedBox(height: AppSpacing.x2),
          if ((option.text ?? '').isNotEmpty)
            Text(
              option.text!,
              textAlign: TextAlign.center,
              style: AppType.body.copyWith(color: c.text),
            ),
          if (note != null)
            Text(
              note,
              textAlign: TextAlign.center,
              style: AppType.caption.copyWith(color: edge, fontWeight: FontWeight.w600),
            ),
        ],
      );
    } else {
      content = Row(
        children: [
          ExcludeSemantics(child: badge),
          const SizedBox(width: AppSpacing.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  option.text ?? '',
                  style: AppType.body.copyWith(color: c.text, fontWeight: chosen ? FontWeight.w600 : FontWeight.w400),
                ),
                if (note != null)
                  Text(
                    note,
                    style: AppType.caption.copyWith(color: edge, fontWeight: FontWeight.w600),
                  ),
              ],
            ),
          ),
        ],
      );
    }
    return Semantics(
      button: onTap != null,
      selected: chosen,
      label: picture && (option.text ?? '').isEmpty ? l.examChoice(number) : null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.row),
          padding: const EdgeInsets.all(AppSpacing.x3),
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(picture ? AppRadii.card : AppRadii.button),
            border: Border.all(color: edge, width: marked || wrong ? AppSizes.outline : AppSizes.hairline),
          ),
          child: content,
        ),
      ),
    );
  }
}

/// 22b: every question of the open section: answered, flagged or still open.
/// Tapping one shows it; the button hands the section in.
class QuestionGridSheet extends StatelessWidget {
  const QuestionGridSheet({super.key, required this.session});

  final ExamSession session;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final questions = session.questions;
        final open = questions.length - session.answered;
        // The section closed while the list was open: nothing left to choose here.
        if (session.state?.inProgress != true) return const SizedBox(height: AppSpacing.x8);
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
                    children: [
                      Semantics(
                        header: true,
                        child: Text(l.examQuestions, style: AppType.title.copyWith(color: c.text)),
                      ),
                      const SizedBox(height: AppSpacing.x2),
                      Wrap(
                        spacing: AppSpacing.x4,
                        runSpacing: AppSpacing.x1,
                        children: [
                          _Legend(label: l.examAnswered, color: c.primaryFill),
                          _Legend(label: l.examFlagged, color: c.accent),
                          _Legend(label: l.examUnanswered, color: null),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.x4),
                      Wrap(
                        spacing: AppSpacing.x1,
                        runSpacing: AppSpacing.x1,
                        children: [
                          for (final (index, question) in questions.indexed)
                            GridCell(
                              number: question.number,
                              answered: session.answerTo(question.id) != null,
                              flagged: session.flagged(question.id),
                              current: index == session.index,
                              onTap: () {
                                session.goTo(index);
                                Navigator.of(context).pop(false);
                              },
                            ),
                        ],
                      ),
                      if (open > 0) ...[
                        const SizedBox(height: AppSpacing.x4),
                        Text(l.examUnansweredCount(open), style: AppType.footnote.copyWith(color: c.textSecondary)),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
                  child: PrimaryButton(label: l.examSubmitSection, onPressed: () => Navigator.of(context).pop(true)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.label, required this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(
          child: Container(
            width: AppSpacing.x3,
            height: AppSpacing.x3,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              border: color == null ? Border.all(color: c.textSecondary, width: AppSizes.hairline) : null,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.x2),
        Text(label, style: AppType.footnote.copyWith(color: c.textSecondary)),
      ],
    );
  }
}

/// One question in the grid: filled when answered, a dot when flagged, a ring
/// around the one on screen.
class GridCell extends StatelessWidget {
  const GridCell({super.key, required this.number, required this.answered, required this.flagged, required this.current, required this.onTap});

  final int number;
  final bool answered;
  final bool flagged;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final states = [answered ? l.examAnswered : l.examUnanswered, if (flagged) l.examFlagged];
    return Semantics(
      button: true,
      selected: current,
      label: '${l.examQuestionNumber(number)}, ${states.join(', ')}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: AppSizes.tapTarget,
          height: AppSizes.tapTarget,
          child: ExcludeSemantics(
            child: Stack(
              children: [
                Center(
                  child: Container(
                    width: AppSizes.tapTarget - AppSpacing.x1,
                    height: AppSizes.tapTarget - AppSpacing.x1,
                    padding: EdgeInsets.all(current ? AppSizes.outline : 0),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: current ? Border.all(color: c.primary, width: AppSizes.outline) : null,
                    ),
                    child: Container(
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: answered ? c.primaryFill : null,
                        border: answered ? null : Border.all(color: c.border, width: AppSizes.hairline + 0.5),
                      ),
                      child: Text(
                        '$number',
                        textScaler: TextScaler.noScaling,
                        style: AppType.tabular(AppType.body.copyWith(color: answered ? c.onPrimaryFill : c.text, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ),
                if (flagged)
                  PositionedDirectional(
                    top: 0,
                    end: 0,
                    child: Container(
                      width: AppSpacing.x3,
                      height: AppSpacing.x3,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: c.accent,
                        border: Border.all(color: c.bg, width: AppSizes.outline),
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

/// 23: the result: the total, each section, the estimate when the exam has
/// thresholds, and the coins: earned by a student, locked for an App user,
/// who also sees the offer to join.
class ExamResultView extends StatelessWidget {
  const ExamResultView({super.key, required this.state, required this.student, required this.onLeave});

  final ExamState state;
  final bool student;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final result = state.result!;
    void review() => unawaited(context.push(Routes.examReview(state.attemptId)));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x4),
            children: [
              Semantics(
                header: true,
                child: Text(l.examResult, style: AppType.largeTitle.copyWith(color: c.text)),
              ),
              const SizedBox(height: AppSpacing.x1),
              Text(state.title, style: AppType.footnote.copyWith(color: c.textSecondary)),
              const SizedBox(height: AppSpacing.x4),
              Center(
                child: TimerRing(
                  size: AppSizes.logo,
                  fraction: result.questions == 0 ? 0 : result.correct / result.questions,
                  label: '${result.correct}/${result.questions}',
                  semanticLabel: '${l.examTotal}: ${result.correct}/${result.questions}',
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text.rich(
                        TextSpan(
                          text: '${result.correct}',
                          children: [
                            TextSpan(
                              text: '/${result.questions}',
                              style: TextStyle(color: c.textSecondary),
                            ),
                          ],
                        ),
                        textScaler: TextScaler.noScaling,
                        style: AppType.tabular(AppType.largeTitle.copyWith(color: c.text)),
                      ),
                      Text(
                        l.examTotal,
                        textScaler: TextScaler.noScaling,
                        style: AppType.footnote.copyWith(color: c.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.x5),
              for (final (kind, correct) in [(ExamSectionKind.listening, result.correctListening), (ExamSectionKind.reading, result.correctReading)]) ...[
                MergeSemantics(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(sectionName(l, kind), style: AppType.body.copyWith(color: c.text)),
                          ),
                          Text(
                            '$correct/${state.section(kind)?.questionCount ?? 0}',
                            style: AppType.tabular(AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.x2),
                      ExcludeSemantics(
                        child: ScoreBar(fraction: (state.section(kind)?.questionCount ?? 0) == 0 ? 0 : correct / state.section(kind)!.questionCount),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.x4),
              ],
              if (result.estimatedLevel != null) ...[
                MergeSemantics(
                  child: Container(
                    padding: const EdgeInsets.all(AppSpacing.x4),
                    decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.card)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text.rich(
                          TextSpan(
                            text: '${l.examEstimateLabel} ',
                            children: [
                              TextSpan(
                                text: keepTogether(l.examLevelN(result.estimatedLevel!)),
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                          style: AppType.headline.copyWith(color: c.text, fontWeight: FontWeight.w400),
                        ),
                        const SizedBox(height: AppSpacing.x1),
                        Text(l.examEstimateNote, style: AppType.footnote.copyWith(color: c.textSecondary)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.x4),
              ],
              Center(child: _CoinsLine(result: result)),
              if (!student) ...[
                const SizedBox(height: AppSpacing.x4),
                // Until vouchers arrive, the offer is the way in: a free open lesson.
                GradientOutline(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.x5),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l.examOfferTitle, style: AppType.headline.copyWith(color: c.text)),
                        const SizedBox(height: AppSpacing.x1),
                        Text(l.examOfferText, style: AppType.body.copyWith(color: c.textSecondary)),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: student
                ? [
                    SecondaryButton(label: l.examReview, onPressed: review),
                    const SizedBox(height: AppSpacing.x3),
                    PrimaryButton(label: l.done, onPressed: onLeave),
                  ]
                : [
                    PrimaryButton(label: l.bookOpenLesson, onPressed: () => context.go(Routes.openLessons)),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        Flexible(
                          child: LinkButton(label: l.examReview, onPressed: review),
                        ),
                        Flexible(
                          child: LinkButton(label: l.later, onPressed: onLeave),
                        ),
                      ],
                    ),
                  ],
          ),
        ),
      ],
    );
  }
}

/// "+51 coins", "51 coins locked", or why there are none.
class _CoinsLine extends StatelessWidget {
  const _CoinsLine({required this.result});

  final ExamResult result;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    if (result.coins <= 0) {
      // A first attempt without coins needs no explaining: the exam gives none.
      if (result.firstAttempt) return const SizedBox();
      return Text(
        l.examNoCoinsRetake,
        textAlign: TextAlign.center,
        style: AppType.footnote.copyWith(color: c.textSecondary),
      );
    }
    final coins = formatCoins(result.coins, l);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x2),
      decoration: BoxDecoration(color: result.coinsLocked ? c.surface : c.primaryTint, borderRadius: BorderRadius.circular(AppRadii.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ExcludeSemantics(
            child: Icon(
              result.coinsLocked ? Icons.lock_outline : Icons.toll_outlined,
              color: result.coinsLocked ? c.textSecondary : c.primary,
              size: AppSizes.icon,
            ),
          ),
          const SizedBox(width: AppSpacing.x2),
          Flexible(
            child: Text(result.coinsLocked ? l.examCoinsLocked(coins) : '+$coins', style: AppType.tabular(AppType.headline.copyWith(color: c.text))),
          ),
        ],
      ),
    );
  }
}

/// A finished attempt, for its review.
final examReviewProvider = FutureProvider.autoDispose.family<ExamState, String>(
  (ref, attemptId) => ref.watch(examRepositoryProvider).state(attemptId),
  retry: (_, _) => null,
);

/// The review: every question with the person's answer, the right one, and
/// the explanation; a recording is shown as what it says.
class ExamReviewScreen extends ConsumerWidget {
  const ExamReviewScreen({super.key, required this.attemptId});

  final String attemptId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final loaded = ref.watch(examReviewProvider(attemptId));
    final result = loaded.value?.result;

    final Widget body;
    if (result == null) {
      body = loaded.isLoading
          ? const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card())
          : EmptyState(
              icon: Icons.assignment_outlined,
              title: loaded.hasError ? l.errorGeneric : l.examGone,
              action: SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(examReviewProvider(attemptId))),
            );
    } else {
      final passages = {for (final passage in result.passages) passage.id: passage};
      String? shown;
      ExamSectionKind? section;
      final children = <Widget>[];
      for (final item in result.review) {
        if (item.section != section) {
          section = item.section;
          shown = null;
          children.add(
            Padding(
              padding: EdgeInsets.only(top: children.isEmpty ? 0 : AppSpacing.x5, bottom: AppSpacing.x3),
              child: Semantics(
                header: true,
                child: Text(sectionName(l, item.section), style: AppType.title.copyWith(color: c.text)),
              ),
            ),
          );
        }
        // A passage is shown once, above the first of its questions.
        final passage = item.passageId != null && item.passageId != shown ? passages[item.passageId] : null;
        shown = item.passageId;
        if (passage != null && (passage.imagePath != null || (passage.text ?? '').isNotEmpty)) {
          if (passage.audio && (passage.text ?? '').isNotEmpty) {
            children.add(
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.x1),
                child: Text(
                  l.examTranscript,
                  style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
                ),
              ),
            );
          }
          children
            ..add(PassageCard(passage: passage))
            ..add(const SizedBox(height: AppSpacing.x3));
        }
        children.add(
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.x5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('${item.number}. ${item.prompt}', style: AppType.headline.copyWith(color: c.text)),
                if (item.yourOption == null) ...[
                  const SizedBox(height: AppSpacing.x1),
                  Text(
                    l.examNotAnswered,
                    style: AppType.footnote.copyWith(color: c.danger, fontWeight: FontWeight.w600),
                  ),
                ],
                const SizedBox(height: AppSpacing.x2),
                ExamChoices(options: item.options, chosen: item.yourOption, correct: item.correctOptionId),
                if ((item.explanation ?? '').isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.x2),
                  Text(item.explanation!, style: AppType.body.copyWith(color: c.textSecondary)),
                ],
              ],
            ),
          ),
        );
      }
      body = ListView(padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x8), children: children);
    }

    return Scaffold(
      backgroundColor: c.bg,
      body: SubPage(title: l.examReview, home: Routes.gameExams, padded: false, child: body),
    );
  }
}
