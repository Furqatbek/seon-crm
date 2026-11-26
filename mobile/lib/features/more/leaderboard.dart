import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/home_state.dart';
import '../../core/more_state.dart';
import '../../data/more.dart';
import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'sub_page.dart';

/// How many rows are on screen before the person's own row is pinned under the list.
const leaderboardTop = 10;

/// The person's own row when it is not among the first [top] rows: it is
/// pinned at the bottom, so they always see their place. Null when they are
/// already on screen, or not on the board.
LeaderRow? pinnedRow(List<LeaderRow> rows, {int top = leaderboardTop}) {
  final index = rows.indexWhere((row) => row.isMe);
  return index >= top ? rows[index] : null;
}

/// 14a and 14b: the group's or the centre's board, this month's or all-time.
class LeaderboardPage extends ConsumerStatefulWidget {
  const LeaderboardPage({super.key});

  @override
  ConsumerState<LeaderboardPage> createState() => _LeaderboardPageState();
}

class _LeaderboardPageState extends ConsumerState<LeaderboardPage> {
  String _scope = 'group';
  String _period = 'month';

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    // The group chosen on Home.
    final groupId = ref.watch(studentHomeProvider).home?.groupId;
    final noGroup = _scope == 'group' && groupId == null;
    final LeaderboardQuery query = (scope: _scope, groupId: groupId, period: _period);
    final board = noGroup ? const AsyncData<List<LeaderRow>>([]) : ref.watch(leaderboardProvider(query));
    final rows = board.value ?? const <LeaderRow>[];
    final pinned = pinnedRow(rows);
    final podium = _scope == 'group' && rows.length >= 3;

    return SubPage(
      title: l.leaderboard,
      padded: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: Column(
              children: [
                Segmented<String>(
                  options: {'group': l.scopeGroup, 'centre': l.scopeCentre},
                  selected: _scope,
                  onChanged: (scope) => setState(() => _scope = scope),
                ),
                const SizedBox(height: AppSpacing.x2),
                Segmented<String>(
                  options: {'month': l.periodMonth, 'all': l.periodAll},
                  selected: _period,
                  onChanged: (period) => setState(() => _period = period),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.x3),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: AsyncList<List<LeaderRow>>(
                value: board,
                onRefresh: () async => noGroup ? null : ref.refresh(leaderboardProvider(query).future).then((_) {}, onError: (_) {}),
                emptyIcon: Icons.emoji_events_outlined,
                emptyTitle: noGroup ? l.noGroupYet : l.leaderboardEmpty,
                builder: (rows) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: AppSpacing.x4),
                  children: [
                    if (podium) ...[Podium(first: rows[0], second: rows[1], third: rows[2]), const SizedBox(height: AppSpacing.x3)],
                    for (final (index, row) in rows.indexed.skip(podium ? 3 : 0)) ...[
                      if (index > (podium ? 3 : 0)) Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
                      LeaderTile(row: row),
                    ],
                  ],
                ),
              ),
            ),
          ),
          if (pinned != null)
            Container(
              decoration: BoxDecoration(
                color: c.bg,
                border: Border(
                  top: BorderSide(color: c.border, width: AppSizes.hairline),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(AppSpacing.x2, AppSpacing.x2, AppSpacing.x2, AppSpacing.x2),
              child: LeaderTile(row: pinned, pinned: true, total: rows.length),
            ),
        ],
      ),
    );
  }
}

/// One place on the board: rank, initials, name and coins.
class LeaderTile extends StatelessWidget {
  const LeaderTile({super.key, required this.row, this.pinned = false, this.total});

  final LeaderRow row;

  /// The person's own row under the list, with "of N" beneath the name.
  final bool pinned;
  final int? total;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final mine = row.isMe;
    return Semantics(
      container: true,
      selected: mine,
      child: Container(
        constraints: const BoxConstraints(minHeight: AppSizes.row),
        padding: EdgeInsets.symmetric(horizontal: mine ? AppSpacing.x2 : 0, vertical: AppSpacing.x2),
        decoration: mine ? BoxDecoration(color: c.primaryTint, borderRadius: BorderRadius.circular(AppRadii.button)) : null,
        child: Row(
          children: [
            SizedBox(
              width: AppSpacing.x8,
              child: Text(
                '${row.rank}',
                style: AppType.tabular(AppType.body).copyWith(color: row.rank == 1 ? c.primary : c.textSecondary, fontWeight: FontWeight.w600),
              ),
            ),
            Avatar(initials: row.initials, ring: row.rank == 1),
            const SizedBox(width: AppSpacing.x3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    mine ? l.you(row.name) : row.name,
                    style: AppType.body.copyWith(color: c.text, fontWeight: mine || row.rank == 1 ? FontWeight.w600 : FontWeight.w400),
                  ),
                  if (pinned && total != null) Text(l.ofPeople(total!), style: AppType.caption.copyWith(color: c.textSecondary)),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.x2),
            Text(
              '${row.coins}',
              style: AppType.tabular(AppType.body).copyWith(color: c.text, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

/// The first three of a group: second, first, third, the winner raised.
class Podium extends StatelessWidget {
  const Podium({super.key, required this.first, required this.second, required this.third});

  final LeaderRow first;
  final LeaderRow second;
  final LeaderRow third;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(child: _Place(row: second)),
        Expanded(child: _Place(row: first, winner: true)),
        Expanded(child: _Place(row: third)),
      ],
    );
  }
}

class _Place extends StatelessWidget {
  const _Place({required this.row, this.winner = false});

  final LeaderRow row;
  final bool winner;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Semantics(
      container: true,
      selected: row.isMe,
      child: Container(
        margin: EdgeInsets.only(bottom: winner ? AppSpacing.x5 : 0),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x1, vertical: AppSpacing.x3),
        decoration: row.isMe ? BoxDecoration(color: c.primaryTint, borderRadius: BorderRadius.circular(AppRadii.card)) : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.bottomCenter,
              children: [
                Avatar(initials: row.initials, size: winner ? AppSizes.avatarLarge : AppSizes.avatar, ring: winner),
                Positioned(
                  bottom: -AppSpacing.x2,
                  child: Container(
                    width: AppSpacing.x6,
                    height: AppSpacing.x6,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: winner ? c.primaryFill : c.bg,
                      shape: BoxShape.circle,
                      border: Border.all(color: winner ? c.primaryFill : c.border, width: AppSizes.hairline),
                    ),
                    child: Text(
                      '${row.rank}',
                      textScaler: TextScaler.noScaling,
                      style: AppType.caption.copyWith(color: winner ? c.onPrimaryFill : c.text, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.x4),
            Text(
              row.isMe ? l.you(row.name) : row.name,
              textAlign: TextAlign.center,
              style: AppType.footnote.copyWith(color: c.text, fontWeight: FontWeight.w600),
            ),
            Text('${row.coins}', style: AppType.tabular(AppType.body).copyWith(color: c.text)),
          ],
        ),
      ),
    );
  }
}
