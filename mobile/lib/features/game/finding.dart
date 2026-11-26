import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/game_state.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../data/game.dart';
import '../../data/home.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';
import 'game_widgets.dart';

/// After this long without an opponent, practice against the computer is offered.
const practiceAfter = Duration(seconds: 30);

/// What to say when the server refused.
String gameFailureText(Object error, AppLocalizations l) => switch (error) {
  GameException(failure: GameFailure.bankNotReady) => l.gameBankNotReady,
  GameException(failure: GameFailure.inMatch) => l.gameInMatch,
  GameException(failure: GameFailure.inviteClosed) => l.gameInviteGone,
  GameException(failure: GameFailure.notClassmate) => l.gameInviteGone,
  OfflineException() => l.errorNetwork,
  _ => l.errorGeneric,
};

/// 05a and 05b: waiting for an opponent, and the practice offer after 30 seconds.
class FindingScreen extends ConsumerStatefulWidget {
  const FindingScreen({super.key, this.groupId});

  final String? groupId;

  @override
  ConsumerState<FindingScreen> createState() => _FindingScreenState();
}

class _FindingScreenState extends ConsumerState<FindingScreen> {
  late final GameRepository _repository = ref.read(gameRepositoryProvider);
  late final ServerClock _clock = ServerClock(ref.read(clockProvider));
  Timer? _timer;
  StreamSubscription<void>? _changes;
  DateTime? _queuedAt;

  /// The server's time from which practice is offered: 30 seconds into the wait, or after Keep waiting.
  DateTime? _offerAt;
  Object? _error;
  bool _asking = false;
  bool _leaving = false;
  int _ticks = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_join());
    // The seconds on screen, and asking again every 3 seconds: that keeps the place in the line.
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (++_ticks % 3 == 0) unawaited(_join());
    });
    _changes = _repository.lobbyChanges().listen((_) => unawaited(_join()));
  }

  @override
  void dispose() {
    _timer?.cancel();
    unawaited(_changes?.cancel());
    super.dispose();
  }

  void _toMatch(String matchId) {
    _leaving = true;
    _timer?.cancel();
    context.pushReplacement(Routes.match(matchId, groupId: widget.groupId));
  }

  Future<void> _join() async {
    if (_asking || _leaving) return;
    _asking = true;
    final sentAt = ref.read(clockProvider)();
    try {
      final result = await _repository.joinQueue(widget.groupId);
      if (!mounted || _leaving) return;
      if (result.matchId != null) return _toMatch(result.matchId!);
      if (result.serverNow != null) _clock.sync(result.serverNow!, sentAt: sentAt);
      setState(() {
        _error = null;
        _queuedAt = result.queuedAt;
        _offerAt ??= result.queuedAt?.add(practiceAfter);
      });
    } catch (error) {
      if (mounted && !_leaving) setState(() => _error = error);
    } finally {
      _asking = false;
    }
  }

  Future<void> _practice() async {
    try {
      final matchId = await _repository.startPractice();
      if (mounted) _toMatch(matchId);
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _cancel() async {
    if (_leaving) return;
    _leaving = true;
    _timer?.cancel();
    try {
      await _repository.leaveQueue();
    } catch (_) {
      // The place expires by itself.
    }
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final profile = ref.watch(authProvider).profile;
    final lobby = ref.watch(gameLobbyProvider(widget.groupId)).value;
    final waited = _queuedAt == null ? Duration.zero : _clock.now().difference(_queuedAt!);
    final offer = _offerAt != null && !_clock.now().isBefore(_offerAt!);
    final refused = _error is GameException;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (popped, _) {
        if (!popped) unawaited(_cancel());
      },
      child: Scaffold(
        backgroundColor: c.bg,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Semantics(
                    button: true,
                    label: l.back,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: _cancel,
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
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              PlayerBadge(initials: profile?.initials ?? '', mine: true, size: AppSizes.avatarLarge),
                              SizedBox(
                                width: AppSpacing.x10 + AppSpacing.x4,
                                child: Divider(color: c.border, thickness: AppSizes.outline),
                              ),
                              PlayerBadge(initials: '', mine: false, size: AppSizes.avatarLarge, dashed: offer),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.x6),
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              refused ? gameFailureText(_error!, l) : (offer ? l.gameNobodyFree : l.gameSearching),
                              textAlign: TextAlign.center,
                              style: AppType.title.copyWith(color: c.text),
                            ),
                          ),
                          if (lobby != null) ...[
                            const SizedBox(height: AppSpacing.x2),
                            Text(lobby.label, style: AppType.body.copyWith(color: c.textSecondary)),
                          ],
                          if (!offer && !refused) ...[
                            const SizedBox(height: AppSpacing.x6),
                            TimerRing(
                              fraction: (waited.inMilliseconds / practiceAfter.inMilliseconds) % 1,
                              label: clockOf(waited - const Duration(milliseconds: 999)),
                              size: AppSizes.avatarLarge,
                            ),
                          ],
                          if (_error != null && !refused) ...[
                            const SizedBox(height: AppSpacing.x4),
                            Text(
                              l.gameReconnecting,
                              textAlign: TextAlign.center,
                              style: AppType.footnote.copyWith(color: c.warning),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
                if (offer && !refused) ...[
                  PrimaryButton(label: l.gamePractice, onPressed: _practice),
                  const SizedBox(height: AppSpacing.x2),
                  Text(
                    l.gamePracticeNoCoins,
                    textAlign: TextAlign.center,
                    style: AppType.footnote.copyWith(color: c.textSecondary),
                  ),
                  Center(
                    child: LinkButton(label: l.gameWaitMore, onPressed: () => setState(() => _offerAt = _clock.now().add(practiceAfter))),
                  ),
                ] else
                  SecondaryButton(label: refused ? l.back : l.cancel, onPressed: _cancel),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 05c: the classmates a student can challenge, and the one being waited for.
class ClassmatesScreen extends ConsumerStatefulWidget {
  const ClassmatesScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<ClassmatesScreen> createState() => _ClassmatesScreenState();
}

class _ClassmatesScreenState extends ConsumerState<ClassmatesScreen> {
  late final GameRepository _repository = ref.read(gameRepositoryProvider);
  final _search = TextEditingController();
  Timer? _timer;
  StreamSubscription<void>? _changes;

  /// The challenge that is out: who, its id, and when the phone's clock says it closes.
  ({Classmate to, String id, DateTime closesAt})? _waiting;
  bool _sending = false;
  bool _asking = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _waiting == null) return;
      setState(() {});
      unawaited(_check());
    });
    _changes = _repository.lobbyChanges().listen((_) => unawaited(_check()));
  }

  @override
  void dispose() {
    _timer?.cancel();
    unawaited(_changes?.cancel());
    _search.dispose();
    super.dispose();
  }

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _invite(Classmate classmate) async {
    if (_sending || _waiting != null) return;
    final l = AppLocalizations.of(context);
    setState(() => _sending = true);
    try {
      final id = await _repository.sendInvite(classmate.profileId, widget.groupId);
      if (!mounted) return;
      setState(() => _waiting = (to: classmate, id: id, closesAt: ref.read(clockProvider)().add(const Duration(seconds: 60))));
    } catch (error) {
      if (mounted) _say(gameFailureText(error, l));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Has the classmate answered?
  Future<void> _check() async {
    final waiting = _waiting;
    if (waiting == null || _asking) return;
    final l = AppLocalizations.of(context);
    _asking = true;
    try {
      final state = await _repository.inviteState(waiting.id);
      if (!mounted || _waiting?.id != waiting.id) return;
      final timeUp = !ref.read(clockProvider)().isBefore(waiting.closesAt);
      if (state?.status == InviteStatus.accepted && state?.matchId != null) {
        _waiting = null;
        context.pushReplacement(Routes.match(state!.matchId!, groupId: widget.groupId));
      } else if (state?.status == InviteStatus.declined) {
        setState(() => _waiting = null);
        _say(l.gameInviteDeclined(waiting.to.name));
      } else if (state == null || state.status == InviteStatus.expired || timeUp) {
        setState(() => _waiting = null);
        _say(l.gameInviteExpired(waiting.to.name));
      }
    } catch (_) {
      // Asked again a second later.
    } finally {
      _asking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final classmates = ref.watch(classmatesProvider(widget.groupId));
    final groupName = ref.watch(studentHomeProvider).home?.groups.where((group) => group.id == widget.groupId).firstOrNull?.name;
    final query = _search.text.trim().toLowerCase();
    final now = ref.watch(clockProvider)();

    return Scaffold(
      backgroundColor: c.bg,
      body: SubPage(
        title: l.gameChallenge,
        home: Routes.game,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              style: AppType.body.copyWith(color: c.text),
              decoration: InputDecoration(
                hintText: l.gameSearchHint,
                prefixIcon: Icon(Icons.search, color: c.textSecondary),
              ),
            ),
            if (groupName != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.x4, bottom: AppSpacing.x1),
                child: Text(
                  groupName,
                  style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
                ),
              ),
            Expanded(
              child: AsyncList<List<Classmate>>(
                value: classmates,
                onRefresh: () => ref.refresh(classmatesProvider(widget.groupId).future).then((_) {}, onError: (_) {}),
                emptyIcon: Icons.group_outlined,
                emptyTitle: l.gameClassmatesEmpty,
                builder: (all) {
                  final shown = [
                    for (final classmate in all)
                      if (query.isEmpty || classmate.name.toLowerCase().contains(query)) classmate,
                  ];
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: AppSpacing.x8),
                    itemCount: shown.length,
                    separatorBuilder: (_, _) => Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
                    itemBuilder: (_, index) {
                      final classmate = shown[index];
                      final waiting = _waiting?.to.profileId == classmate.profileId ? _waiting : null;
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.x2),
                        child: Row(
                          children: [
                            PlayerBadge(initials: initialsOf(classmate.name), mine: false, size: AppSizes.roundButton),
                            const SizedBox(width: AppSpacing.x3),
                            Expanded(
                              child: Text(
                                classmate.name,
                                style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.x2),
                            if (waiting != null)
                              Semantics(
                                liveRegion: true,
                                child: Text.rich(
                                  TextSpan(
                                    text: '${l.gameInviteWaiting} ',
                                    children: [
                                      TextSpan(
                                        text: clockOf(waiting.closesAt.difference(now)),
                                        style: AppType.tabular(AppType.footnote.copyWith(color: c.text, fontWeight: FontWeight.w700)),
                                      ),
                                    ],
                                  ),
                                  style: AppType.footnote.copyWith(color: c.textSecondary),
                                ),
                              )
                            else
                              Opacity(
                                opacity: _waiting == null && !_sending ? 1 : AppSizes.disabledOpacity,
                                child: Semantics(
                                  label: '${l.gameInvite}: ${classmate.name}',
                                  excludeSemantics: true,
                                  button: true,
                                  child: Pill(label: l.gameInvite, tone: PillTone.primary, outlined: true, onTap: () => _invite(classmate)),
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
          ],
        ),
      ),
    );
  }
}

/// 05d: a classmate's challenge, wherever the student is in the app.
class InviteCard extends ConsumerStatefulWidget {
  const InviteCard({super.key, required this.incoming});

  final IncomingInvite incoming;

  @override
  ConsumerState<InviteCard> createState() => _InviteCardState();
}

class _InviteCardState extends ConsumerState<InviteCard> {
  Timer? _timer;
  bool _busy = false;

  Duration get _left => widget.incoming.closesAt.difference(ref.read(clockProvider)());

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      // The 60 seconds are up: the card goes away by itself.
      if (_left <= Duration.zero) return Navigator.of(context).pop();
      setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _answer(bool accept) async {
    if (_busy) return;
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() => _busy = true);
    try {
      final matchId = await ref.read(gameRepositoryProvider).answerInvite(widget.incoming.invite.id, accept: accept);
      if (!mounted) return;
      Navigator.of(context).pop();
      if (matchId != null) {
        unawaited(router.push(Routes.match(matchId)));
      } else if (accept) {
        messenger.showSnackBar(SnackBar(content: Text(l.gameInviteGone)));
      }
    } catch (error) {
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger.showSnackBar(SnackBar(content: Text(gameFailureText(error, l))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final invite = widget.incoming.invite;
    final left = _left.isNegative ? Duration.zero : _left;
    return Dialog(
      backgroundColor: c.elevated,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.card)),
      insetPadding: const EdgeInsets.all(AppSpacing.x6),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.x5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: PlayerBadge(initials: initialsOf(invite.from), mine: false, size: AppSizes.avatar),
            ),
            const SizedBox(height: AppSpacing.x3),
            Text(
              l.gameInvitedYou(invite.from),
              textAlign: TextAlign.center,
              style: AppType.headline.copyWith(color: c.text),
            ),
            const SizedBox(height: AppSpacing.x1),
            Text(
              bankLabel(invite.subject, invite.level),
              textAlign: TextAlign.center,
              style: AppType.body.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.x4),
            Center(
              child: TimerRing(fraction: left.inMilliseconds / 60000, label: clockOf(left), semanticLabel: l.gameSecondsLeft(left.inSeconds)),
            ),
            const SizedBox(height: AppSpacing.x4),
            PrimaryButton(label: l.gameAccept, busy: _busy, onPressed: () => _answer(true)),
            const SizedBox(height: AppSpacing.x3),
            SecondaryButton(label: l.gameDecline, onPressed: _busy ? null : () => _answer(false)),
          ],
        ),
      ),
    );
  }
}

/// Shows a challenge card when one arrives, unless a match is on screen.
class InviteListener extends ConsumerStatefulWidget {
  const InviteListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<InviteListener> createState() => _InviteListenerState();
}

class _InviteListenerState extends ConsumerState<InviteListener> {
  final _shown = <String>{};
  bool _open = false;

  Future<void> _show(IncomingInvite incoming) async {
    _open = true;
    _shown.add(incoming.invite.id);
    await showDialog<void>(
      context: context,
      useRootNavigator: true,
      barrierDismissible: false,
      builder: (_) => InviteCard(incoming: incoming),
    );
    _open = false;
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(incomingInvitesProvider, (_, next) {
      final now = ref.read(clockProvider)();
      final fresh = (next.value ?? const <IncomingInvite>[])
          .where((incoming) => !_shown.contains(incoming.invite.id) && incoming.closesAt.isAfter(now))
          .firstOrNull;
      if (fresh == null || _open || !mounted) return;
      // Not over a match: the player is busy, and could not accept anyway.
      if (GoRouter.of(context).routerDelegate.currentConfiguration.uri.path.startsWith('/game/match')) return;
      unawaited(_show(fresh));
    });
    return widget.child;
  }
}
