import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/game_state.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../core/time.dart';
import '../../data/game.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../exams/exams_side.dart';
import 'game_widgets.dart';

enum _Side { duel, exams }

/// The Game tab: 1v1 on one side, mock exams on the other.
class GameTab extends ConsumerStatefulWidget {
  const GameTab({super.key, this.exams = false});

  /// Opened on the mock exams side.
  final bool exams;

  @override
  ConsumerState<GameTab> createState() => _GameTabState();
}

class _GameTabState extends ConsumerState<GameTab> {
  late _Side _side = widget.exams ? _Side.exams : _Side.duel;
  String? _groupId;

  @override
  void didUpdateWidget(GameTab old) {
    super.didUpdateWidget(old);
    // Sent here for the exams, from Home or from a result.
    if (widget.exams && !old.exams) _side = _Side.exams;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authProvider);
    final student = auth.profile?.role == AccountRole.student;
    final home = student ? ref.watch(studentHomeProvider) : null;
    final groups = home?.home?.groups ?? const <HomeGroup>[];
    final groupId = groups.any((group) => group.id == _groupId) ? _groupId : groups.firstOrNull?.id;

    final Widget body;
    if (_side == _Side.exams) {
      body = const ExamsSide();
    } else if (!auth.profileLoaded || (student && home?.home == null && home?.problem == HomeProblem.none)) {
      body = const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card());
    } else if (student && groupId == null) {
      // A student plays from one of their groups: without one there is no bank.
      body = EmptyState(icon: Icons.sports_esports_outlined, title: home?.problem == HomeProblem.offline ? l.errorNetwork : l.gameBankNotReady);
    } else {
      body = Lobby(groups: groups, groupId: groupId, student: student, onGroup: (id) => setState(() => _groupId = id));
    }

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x3),
            child: Semantics(
              header: true,
              child: Text(l.gameZone, style: AppType.largeTitle.copyWith(color: c.text)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: Segmented<_Side>(
              options: {_Side.duel: l.gameDuel, _Side.exams: l.gameExams},
              selected: _side,
              onChanged: (side) => setState(() => _side = side),
            ),
          ),
          const SizedBox(height: AppSpacing.x3),
          Expanded(child: body),
        ],
      ),
    );
  }
}

/// 04: the lobby of one bank.
class Lobby extends ConsumerWidget {
  const Lobby({super.key, required this.groups, required this.groupId, required this.student, required this.onGroup});

  final List<HomeGroup> groups;
  final String? groupId;
  final bool student;
  final ValueChanged<String> onGroup;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final lobby = ref.watch(gameLobbyProvider(groupId));
    final data = lobby.value;
    final now = ref.watch(clockProvider)();

    Future<void> open(String route) async {
      await context.push(route);
      // Back from a match: the wins and the list have changed.
      ref.invalidate(gameLobbyProvider);
      if (student) await ref.read(studentHomeProvider.notifier).refresh();
    }

    if (data == null) {
      if (lobby.isLoading) return const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card());
      return EmptyState(
        icon: Icons.wifi_off_outlined,
        title: lobby.error is OfflineException ? l.errorNetwork : l.errorGeneric,
        action: SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(gameLobbyProvider(groupId))),
      );
    }

    return RefreshIndicator(
      color: c.primary,
      backgroundColor: c.elevated,
      onRefresh: () => ref.refresh(gameLobbyProvider(groupId).future).then((_) {}, onError: (_) {}),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x8),
        children: [
          if (groups.length > 1) ...[
            Wrap(
              spacing: AppSpacing.x2,
              runSpacing: AppSpacing.x2,
              children: [
                for (final group in groups)
                  Pill(
                    // The bank's name once its lobby has been read; the group's own until then.
                    label: ref.watch(gameLobbyProvider(group.id)).value?.label ?? group.name,
                    outlined: true,
                    selected: group.id == groupId,
                    onTap: () => onGroup(group.id),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.x4),
          ],
          Container(
            padding: const EdgeInsets.all(AppSpacing.x5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadii.card),
              border: Border.all(color: c.border, width: AppSizes.hairline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ExcludeSemantics(child: RopeBar(rope: 0)),
                const SizedBox(height: AppSpacing.x3),
                Text(
                  data.coins && data.winCoins > 0 ? l.gamePitch('+${formatCoins(data.winCoins, l)}') : l.gamePitchNoCoins,
                  textAlign: TextAlign.center,
                  style: AppType.body.copyWith(color: c.text),
                ),
                if (!student) ...[
                  const SizedBox(height: AppSpacing.x1),
                  Text(
                    l.gameNoCoinsAppUser,
                    textAlign: TextAlign.center,
                    style: AppType.footnote.copyWith(color: c.textSecondary),
                  ),
                ],
                const SizedBox(height: AppSpacing.x4),
                Opacity(
                  opacity: data.randomOpen || data.activeMatchId != null ? 1 : AppSizes.disabledOpacity,
                  child: PrimaryButton(
                    label: l.gamePlayNow,
                    onPressed: data.activeMatchId != null
                        // A match is in progress: back into it.
                        ? () => open(Routes.match(data.activeMatchId!, groupId: groupId))
                        : (data.randomOpen ? () => open(Routes.gameSearch(groupId)) : null),
                  ),
                ),
                if (!data.randomOpen && data.activeMatchId == null) ...[
                  const SizedBox(height: AppSpacing.x2),
                  Text(
                    l.gameBankNotReady,
                    textAlign: TextAlign.center,
                    style: AppType.footnote.copyWith(color: c.textSecondary),
                  ),
                ],
              ],
            ),
          ),
          if (student && groupId != null) ...[
            const SizedBox(height: AppSpacing.x3),
            Opacity(
              opacity: data.challengeOpen ? 1 : AppSizes.disabledOpacity,
              child: SecondaryButton(label: l.gameChallenge, onPressed: data.challengeOpen ? () => open(Routes.gameClassmates(groupId!)) : null),
            ),
          ],
          if (data.coins) ...[
            const SizedBox(height: AppSpacing.x3),
            Center(child: Pill(label: l.gameRewardedWins(data.rewardedWinsToday, data.dailyRewardedWins))),
          ],
          const SizedBox(height: AppSpacing.x5),
          Semantics(
            header: true,
            child: Text(l.gameRecent, style: AppType.headline.copyWith(color: c.text)),
          ),
          const SizedBox(height: AppSpacing.x2),
          if (data.recent.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.x4),
              child: Text(l.gameRecentEmpty, style: AppType.body.copyWith(color: c.textSecondary)),
            ),
          for (final (index, match) in data.recent.indexed) ...[
            if (index > 0) Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
            RecentMatchTile(match: match, now: now),
          ],
        ],
      ),
    );
  }
}

class RecentMatchTile extends StatelessWidget {
  const RecentMatchTile({super.key, required this.match, required this.now});

  final RecentMatch match;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final name = match.computer ? l.gameComputer : (match.opponent ?? '');
    final (label, tone) = switch (match.outcome) {
      MatchOutcome.win => (l.gameWin, PillTone.success),
      MatchOutcome.loss => (l.gameLoss, PillTone.danger),
      MatchOutcome.draw => (l.gameDraw, PillTone.neutral),
    };
    // Today and yesterday with the time; anything older by its date.
    final days = tashkentDay(now).difference(tashkentDay(match.finishedAt)).inDays;
    final when = days <= 1 ? dayAndTime(match.finishedAt, now, l) : dayMonth(tashkentDay(match.finishedAt), l);
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.x3),
        child: Row(
          children: [
            PlayerBadge(initials: initialsOf(match.opponent), mine: false, size: AppSizes.roundButton, icon: match.computer ? Icons.smart_toy_outlined : null),
            const SizedBox(width: AppSpacing.x3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                  ),
                  Text(keepTogether(when), style: AppType.footnote.copyWith(color: c.textSecondary)),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.x2),
            Pill(label: label, tone: tone),
            const SizedBox(width: AppSpacing.x3),
            Text(
              match.coins > 0 ? '+${formatCoins(match.coins, l)}' : '0',
              style: AppType.tabular(AppType.body.copyWith(color: match.coins > 0 ? c.text : c.textSecondary, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}
