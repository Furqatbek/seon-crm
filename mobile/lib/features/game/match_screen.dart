import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/game_state.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../data/game.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';
import 'game_widgets.dart';

/// "Aziza Karimova" → "Aziza K.", as the server names the opponent.
String shortName(String fullName) {
  final parts = fullName.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
  return parts.length >= 2 ? '${parts.first} ${parts.last.substring(0, 1)}.' : (parts.firstOrNull ?? '');
}

/// 06 and 07: one match, from the 3-2-1 countdown to its result.
class MatchScreen extends ConsumerStatefulWidget {
  const MatchScreen({super.key, required this.matchId, this.groupId});

  final String matchId;

  /// The group the player came from, for "rewarded wins today" on the result.
  final String? groupId;

  @override
  ConsumerState<MatchScreen> createState() => _MatchScreenState();
}

class _MatchScreenState extends ConsumerState<MatchScreen> with WidgetsBindingObserver {
  late final MatchSession _session;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _session = MatchSession(
      matchId: widget.matchId,
      repository: ref.read(gameRepositoryProvider),
      now: ref.read(clockProvider),
      feedback: ref.read(gameFeedbackProvider),
    )..addListener(_changed);
    _session.start();
    // The countdown and the timer move with the clock.
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (mounted && _session.state?.over != true) setState(() {});
    });
    WidgetsBinding.instance.addObserver(this);
  }

  void _changed() {
    if (!mounted) return;
    if (_session.state?.over == true) _ticker?.cancel();
    setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back in front: what happened meanwhile is the server's to say.
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

  void _leave() => context.canPop() ? context.pop() : context.go(Routes.game);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final state = _session.state;
    final profile = ref.watch(authProvider).profile;

    final Widget body;
    if (_session.notFound) {
      body = EmptyState(
        icon: Icons.sports_esports_outlined,
        title: l.gameMatchGone,
        action: SecondaryButton(label: l.gameBackToLobby, onPressed: _leave),
      );
    } else if (state == null) {
      body = _session.reconnecting
          ? EmptyState(icon: Icons.wifi_off_outlined, title: l.gameReconnecting)
          : const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card());
    } else if (state.status == MatchStatus.cancelled || (state.over && state.result == null)) {
      body = EmptyState(
        icon: Icons.sports_esports_outlined,
        title: l.gameCancelled,
        action: SecondaryButton(label: l.gameBackToLobby, onPressed: _leave),
      );
    } else if (state.result != null) {
      body = MatchResultView(state: state, profile: profile, groupId: widget.groupId, onLeave: _leave);
    } else {
      body = MatchPlayView(session: _session, profile: profile);
    }

    return PopScope(
      // Leaving a match in progress is losing it: Back does nothing until it is over.
      canPop: state == null || state.over || _session.notFound,
      child: Scaffold(
        backgroundColor: c.bg,
        body: SafeArea(child: body),
      ),
    );
  }
}

/// 06: the opponent header, the rope, the timer, the question and its choices.
class MatchPlayView extends StatelessWidget {
  const MatchPlayView({super.key, required this.session, required this.profile});

  final MatchSession session;
  final Profile? profile;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final state = session.state!;
    final question = session.question;
    final myName = shortName(profile?.fullName ?? '');
    final opponentName = state.opponentIsComputer ? l.gameComputer : (state.opponentName ?? '');
    final counting = question == null && state.currentIndex == 0 && state.previous == null;
    final open = state.question != null;
    // The question that was just settled stays on screen until the next one is shown.
    final settled = !open && question != null && state.previous?.index == question.index ? state.previous : null;
    final mine = question == null ? null : session.answerTo(question.index);
    final seconds = (session.timeLeft.inMilliseconds / 1000).ceil().clamp(0, answerTime.inSeconds);
    // While a settled question is still on screen, the header still counts it.
    final number = (question?.index ?? state.currentIndex) + 1;

    final String? note;
    Color noteColor = c.textSecondary;
    if (settled != null) {
      final right = settled.yourOption == settled.correctOptionId;
      note = settled.yourOption == null
          ? l.gameTimeUp
          : !right
          ? l.gameWrong
          : settled.pull > 0 && settled.opponentOption == settled.correctOptionId
          ? l.gameCorrectFaster
          : settled.pull < 0
          ? l.gameCorrectSlower
          : l.gameCorrect;
      noteColor = right ? c.success : c.danger;
    } else if (mine?.correct != null) {
      note = mine!.correct! ? l.gameCorrect : l.gameWrong;
      noteColor = mine.correct! ? c.success : c.danger;
    } else if (mine != null || session.sending != null) {
      note = l.gameWaitingOpponent;
    } else if (open && state.opponentAnswered) {
      note = l.gameOpponentAnswered;
    } else {
      note = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (session.reconnecting)
          Semantics(
            liveRegion: true,
            child: Container(
              color: c.surface,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page, vertical: AppSpacing.x2),
              child: Text(
                l.gameReconnecting,
                textAlign: TextAlign.center,
                style: AppType.footnote.copyWith(color: c.warning, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    PlayerBadge(initials: profile?.initials ?? '', mine: true),
                    const SizedBox(width: AppSpacing.x2),
                    Expanded(
                      child: Text(
                        myName,
                        style: AppType.footnote.copyWith(color: c.text, fontWeight: FontWeight.w700),
                      ),
                    ),
                    Semantics(
                      label: l.gameQuestionOf(number, state.total),
                      excludeSemantics: true,
                      child: Text.rich(
                        TextSpan(
                          text: '$number',
                          children: [
                            TextSpan(
                              text: '/${state.total}',
                              style: TextStyle(color: c.textSecondary),
                            ),
                          ],
                        ),
                        textScaler: TextScaler.noScaling,
                        style: AppType.tabular(AppType.title.copyWith(color: c.text)),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        opponentName,
                        textAlign: TextAlign.end,
                        style: AppType.footnote.copyWith(color: c.text, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.x2),
                    PlayerBadge(initials: initialsOf(state.opponentName), mine: false, icon: state.opponentIsComputer ? Icons.smart_toy_outlined : null),
                  ],
                ),
                const SizedBox(height: AppSpacing.x4),
                RopeBar(rope: state.rope, yourLabel: myName.split(' ').first, opponentLabel: opponentName.split(' ').first),
                const SizedBox(height: AppSpacing.x5),
                if (counting) ...[
                  const SizedBox(height: AppSpacing.x10),
                  Text(
                    l.gameGetReady,
                    textAlign: TextAlign.center,
                    style: AppType.headline.copyWith(color: c.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.x4),
                  Center(
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        '${(session.countdownLeft.inMilliseconds / 1000).ceil().clamp(1, 3)}',
                        key: const ValueKey('match-countdown'),
                        textScaler: TextScaler.noScaling,
                        style: AppType.tabular(AppType.largeTitle.copyWith(color: c.primary, fontSize: AppSizes.avatar)),
                      ),
                    ),
                  ),
                ] else ...[
                  Center(
                    child: TimerRing(
                      key: const ValueKey('match-timer'),
                      fraction: open ? session.timeLeft.inMilliseconds / answerTime.inMilliseconds : 0,
                      label: open ? '$seconds' : '0',
                      semanticLabel: l.gameSecondsLeft(open ? seconds : 0),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.x4),
                  if (question != null)
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.x5),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppRadii.card),
                        border: Border.all(color: c.border, width: AppSizes.hairline),
                      ),
                      child: Column(
                        children: [
                          if (question.imagePath != null) ...[
                            QuestionImage(path: question.imagePath!, height: AppSizes.logo),
                            const SizedBox(height: AppSpacing.x3),
                          ],
                          Text(
                            question.text,
                            textAlign: TextAlign.center,
                            style: AppType.headline.copyWith(color: c.text),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: AppSpacing.x3),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      note ?? '',
                      textAlign: TextAlign.center,
                      style: AppType.body.copyWith(color: noteColor, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (question != null && !counting)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
            child: Column(
              children: [
                for (var row = 0; row < question.options.length; row += 2)
                  Padding(
                    padding: EdgeInsets.only(top: row == 0 ? 0 : AppSpacing.x3),
                    child: IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final option in question.options.skip(row).take(2)) ...[
                            if (option != question.options[row]) const SizedBox(width: AppSpacing.x3),
                            Expanded(
                              child: ChoiceTile(
                                option: option,
                                chosen: mine?.option == option.id || session.sending == option.id,
                                // Right or wrong is shown once the server has said so.
                                right: settled != null ? option.id == settled.correctOptionId : (mine?.option == option.id ? mine?.correct : null),
                                revealed: settled != null,
                                onTap: open && mine == null && session.sending == null ? () => session.answer(option.id) : null,
                              ),
                            ),
                          ],
                          if (question.options.length - row == 1) ...[const SizedBox(width: AppSpacing.x3), const Expanded(child: SizedBox())],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// One choice of a question.
class ChoiceTile extends StatelessWidget {
  const ChoiceTile({super.key, required this.option, required this.chosen, required this.right, required this.revealed, required this.onTap});

  final QuestionOption option;

  /// The player tapped this one.
  final bool chosen;

  /// Known to be the right answer (true) or a wrong one the player chose (false); null while unknown.
  final bool? right;

  /// The question is settled: the right answer is marked whoever chose what.
  final bool revealed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final good = right == true && (chosen || revealed);
    final bad = right == false && chosen;
    final color = good ? c.success : (bad ? c.danger : (chosen ? c.primary : c.border));
    return Semantics(
      button: true,
      enabled: onTap != null,
      selected: chosen,
      label: good ? '${option.text}, ${l.gameCorrect}' : (bad ? '${option.text}, ${l.gameWrong}' : option.text),
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.avatarLarge),
          padding: const EdgeInsets.all(AppSpacing.x3),
          decoration: BoxDecoration(
            color: good || bad ? color.withValues(alpha: 0.12) : c.bg,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: color, width: good || bad || chosen ? AppSizes.outline : AppSizes.hairline),
          ),
          child: Stack(
            children: [
              Center(
                child: Text(
                  option.text,
                  textAlign: TextAlign.center,
                  style: AppType.headline.copyWith(color: good ? c.success : (bad ? c.danger : (onTap == null && !chosen ? c.textSecondary : c.text))),
                ),
              ),
              if (good || bad)
                PositionedDirectional(
                  top: 0,
                  end: 0,
                  child: Icon(good ? Icons.check_circle : Icons.cancel, color: color, size: AppSpacing.x5),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 07a and 07c: who won, the answers each got right, and the coins or why there are none.
class MatchResultView extends ConsumerWidget {
  const MatchResultView({super.key, required this.state, required this.profile, required this.groupId, required this.onLeave});

  final MatchState state;
  final Profile? profile;
  final String? groupId;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final result = state.result!;
    final student = profile?.role == AccountRole.student;
    final won = result.outcome == MatchOutcome.win;
    final lost = result.outcome == MatchOutcome.loss;
    final opponentName = state.opponentIsComputer ? l.gameComputer : (state.opponentName ?? '');
    // Asked for again now that the match is over: the count includes this win.
    final lobby = student && groupId != null ? ref.watch(gameLobbyProvider(groupId)).value : null;

    // The coins, or why none were given.
    final String? coinsNote;
    if (result.rewarded && result.coins > 0) {
      coinsNote = null;
    } else if (!student) {
      coinsNote = l.gameNoCoinsAppUser;
    } else if (state.kind == MatchKind.practice) {
      coinsNote = l.gamePracticeNoCoins;
    } else if (!state.coinsEligible) {
      coinsNote = l.gameOpponentNotStudent;
    } else if (won) {
      coinsNote = l.gameLimitReached;
    } else {
      coinsNote = null;
    }

    Widget player(String initials, String name, {required bool mine, required bool winner, IconData? icon}) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            PlayerBadge(initials: initials, mine: mine, size: winner ? AppSizes.avatarLarge : AppSizes.avatar, icon: icon),
            if (winner)
              PositionedDirectional(
                end: 0,
                bottom: 0,
                child: Container(
                  width: AppSpacing.x6,
                  height: AppSpacing.x6,
                  decoration: BoxDecoration(color: mine ? c.primaryFill : c.accentText, shape: BoxShape.circle),
                  child: Icon(Icons.check, color: c.onPrimaryFill, size: AppSpacing.x4),
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.x2),
        Text(
          name,
          textAlign: TextAlign.center,
          style: AppType.body.copyWith(color: winner ? c.text : c.textSecondary, fontWeight: winner ? FontWeight.w700 : FontWeight.w400),
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
          child: BackChevron(home: Routes.game),
        ),
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      won ? l.gameWinTitle : (lost ? l.gameLossTitle : l.gameDrawTitle),
                      textAlign: TextAlign.center,
                      style: AppType.largeTitle.copyWith(color: c.text),
                    ),
                  ),
                  if (result.forfeit) ...[
                    const SizedBox(height: AppSpacing.x1),
                    Text(
                      won ? l.gameForfeitWin : l.gameForfeitLoss,
                      textAlign: TextAlign.center,
                      style: AppType.footnote.copyWith(color: c.textSecondary),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.x5),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Flexible(child: player(profile?.initials ?? '', shortName(profile?.fullName ?? ''), mine: true, winner: won)),
                      const SizedBox(width: AppSpacing.x5),
                      Flexible(
                        child: player(
                          initialsOf(state.opponentName),
                          opponentName,
                          mine: false,
                          winner: lost,
                          icon: state.opponentIsComputer ? Icons.smart_toy_outlined : null,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.x5),
                  Text(
                    l.gameCorrectAnswers(result.yourCorrect, result.opponentCorrect),
                    textAlign: TextAlign.center,
                    style: AppType.tabular(AppType.body.copyWith(color: c.text)),
                  ),
                  const SizedBox(height: AppSpacing.x3),
                  if (result.rewarded && result.coins > 0)
                    Pill(label: '+${formatCoins(result.coins, l)}', tone: PillTone.primary)
                  else if (coinsNote != null)
                    Pill(label: coinsNote),
                  if (lobby != null && lobby.coins) ...[
                    const SizedBox(height: AppSpacing.x2),
                    Text(
                      l.gameRewardedWins(lobby.rewardedWinsToday, lobby.dailyRewardedWins),
                      textAlign: TextAlign.center,
                      style: AppType.footnote.copyWith(color: c.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // A challenge is sent again from the lobby; a random match starts looking at once.
              PrimaryButton(
                label: l.gamePlayAgain,
                onPressed: state.kind == MatchKind.friend ? onLeave : () => context.pushReplacement(Routes.gameSearch(groupId)),
              ),
              const SizedBox(height: AppSpacing.x3),
              SecondaryButton(label: l.gameSeeQuestions, onPressed: () => context.push(Routes.matchReview(state.id))),
            ],
          ),
        ),
      ],
    );
  }
}

/// 07b: every question that was played, with the right answer and its explanation.
class MatchReviewScreen extends ConsumerWidget {
  const MatchReviewScreen({super.key, required this.matchId});

  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final match = ref.watch(finishedMatchProvider(matchId));
    return Scaffold(
      backgroundColor: c.bg,
      body: SubPage(
        title: l.gameQuestions,
        home: Routes.game,
        child: AsyncList<MatchState>(
          value: match,
          onRefresh: () => ref.refresh(finishedMatchProvider(matchId).future).then((_) {}, onError: (_) {}),
          emptyIcon: Icons.quiz_outlined,
          emptyTitle: l.gameRecentEmpty,
          isEmpty: (state) => state.result == null || state.result!.review.isEmpty,
          builder: (state) {
            final review = state.result!.review;
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: AppSpacing.x8),
              itemCount: review.length,
              separatorBuilder: (_, _) => Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
              itemBuilder: (_, index) {
                final item = review[index];
                final right = item.yourOption == item.correctOptionId;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.x3),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: AppSpacing.x8,
                        child: Text(
                          '${item.index + 1}',
                          style: AppType.tabular(AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (item.imagePath != null) ...[
                              QuestionImage(path: item.imagePath!, height: AppSizes.avatar),
                              const SizedBox(height: AppSpacing.x1),
                            ],
                            Text(item.text, style: AppType.body.copyWith(color: c.text)),
                            const SizedBox(height: AppSpacing.x1),
                            Text.rich(
                              TextSpan(
                                text: '${l.gameRightAnswer} ',
                                children: [
                                  TextSpan(
                                    text: item.textOf(item.correctOptionId),
                                    style: TextStyle(color: c.success, fontWeight: FontWeight.w600),
                                  ),
                                ],
                              ),
                              style: AppType.footnote.copyWith(color: c.textSecondary),
                            ),
                            // What the player answered, when it was not the right answer.
                            if (!right)
                              Text(
                                item.yourOption == null ? l.gameNoAnswer : l.gameYourAnswer(item.textOf(item.yourOption)),
                                style: AppType.footnote.copyWith(color: c.danger),
                              ),
                            if (item.explanation != null && item.explanation!.trim().isNotEmpty)
                              Container(
                                margin: const EdgeInsets.only(top: AppSpacing.x2),
                                padding: const EdgeInsets.all(AppSpacing.x3),
                                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.button)),
                                child: Text(item.explanation!, style: AppType.footnote.copyWith(color: c.text)),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// A question's picture, from the question-images bucket. While it loads, and
/// when it cannot be had, an outline keeps its place.
class QuestionImage extends ConsumerWidget {
  const QuestionImage({super.key, required this.path, required this.height});

  final String path;
  final double height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final url = ref.watch(questionImageUrlProvider(path)).value;
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
