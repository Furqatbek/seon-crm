import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/game.dart';
import '../data/models.dart';
import 'home_state.dart';
import 'state.dart';

/// Set in main.
final gameRepositoryProvider = Provider<GameRepository>((ref) => throw UnimplementedError('gameRepositoryProvider'));

/// Haptics and sounds of the game. Set in main; tests record what was asked for.
final gameFeedbackProvider = Provider<GameFeedback>((ref) => const DeviceGameFeedback());

/// What the player feels and hears: light, and never louder than the phone allows.
abstract class GameFeedback {
  /// A choice was tapped.
  void tap();

  /// The answer was right, or wrong.
  void answered({required bool correct});

  /// The match ended.
  void finished({required bool won});
}

/// The phone's own haptics and its system click, which follows silent mode and
/// the phone's sound settings: no sound of the app's own is ever forced.
class DeviceGameFeedback implements GameFeedback {
  const DeviceGameFeedback();

  @override
  void tap() {
    unawaited(HapticFeedback.selectionClick());
    unawaited(SystemSound.play(SystemSoundType.click));
  }

  @override
  void answered({required bool correct}) => unawaited(correct ? HapticFeedback.lightImpact() : HapticFeedback.mediumImpact());

  @override
  void finished({required bool won}) {
    unawaited(won ? HapticFeedback.heavyImpact() : HapticFeedback.lightImpact());
    if (won) unawaited(SystemSound.play(SystemSoundType.click));
  }
}

/// The lobby of a group (a student) or of the profile's level (an App user: null).
final gameLobbyProvider = FutureProvider.autoDispose.family<GameLobby, String?>((ref, groupId) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  final repository = ref.watch(gameRepositoryProvider);
  // A match made for the player, or a challenge, changes what the lobby shows.
  final changes = repository.lobbyChanges().listen((_) => ref.invalidateSelf());
  ref.onDispose(changes.cancel);
  return repository.lobby(groupId);
}, retry: (_, _) => null);

/// A finished match, for its review.
final finishedMatchProvider = FutureProvider.autoDispose.family<MatchState, String>(
  (ref, matchId) => ref.watch(gameRepositoryProvider).matchState(matchId),
  retry: (_, _) => null,
);

/// A challenge waiting for the player, with the moment it closes on the phone's own clock.
class IncomingInvite {
  const IncomingInvite({required this.invite, required this.closesAt});

  final GameInvite invite;

  /// The phone's time at which the 60 seconds are up, worked out from the server's clock.
  final DateTime closesAt;
}

final classmatesProvider = FutureProvider.autoDispose.family<List<Classmate>, String>((ref, groupId) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(gameRepositoryProvider).classmates(groupId);
}, retry: (_, _) => null);

/// The challenges waiting for a student, kept live: asked for once, then again
/// whenever the server says something about the player's game changed. An App
/// user is never challenged.
final incomingInvitesProvider = StreamProvider<List<IncomingInvite>>((ref) async* {
  final profile = ref.watch(authProvider.select((auth) => auth.profile));
  // Any of the student's groups will do: the challenges are the same in each lobby.
  final groupId = ref.watch(studentHomeProvider.select((home) => home.home?.groups.firstOrNull?.id));
  if (profile == null || profile.role != AccountRole.student || groupId == null) {
    yield const [];
    return;
  }
  final repository = ref.watch(gameRepositoryProvider);
  final clock = ref.watch(clockProvider);
  Future<List<IncomingInvite>?> read() async {
    try {
      final lobby = await repository.lobby(groupId);
      final received = clock();
      return [for (final invite in lobby.invites) IncomingInvite(invite: invite, closesAt: received.add(invite.expiresAt.difference(lobby.serverNow)))];
    } catch (_) {
      return null;
    }
  }

  final first = await read();
  if (first != null) yield first;
  await for (final _ in repository.lobbyChanges()) {
    final next = await read();
    if (next != null) yield next;
  }
});

/// The server's clock, as far as the phone can tell. Every answer from the
/// server carries its time; the difference to the phone's own clock is kept,
/// so a countdown is right even on a phone whose clock is wrong, and is
/// corrected with every answer.
class ServerClock {
  ServerClock(this._local);

  final DateTime Function() _local;
  Duration _offset = Duration.zero;
  bool _synced = false;

  bool get synced => _synced;

  /// How far the server is ahead of the phone.
  Duration get offset => _offset;

  /// The server said it was [serverNow], in answer to a request sent at
  /// [sentAt] on the phone's clock: the answer is taken to have been written
  /// halfway through the round trip.
  void sync(DateTime serverNow, {DateTime? sentAt}) {
    final received = _local();
    final midpoint = sentAt == null ? received : sentAt.add(received.difference(sentAt) ~/ 2);
    _offset = serverNow.difference(midpoint);
    _synced = true;
  }

  DateTime now() => _local().add(_offset);

  /// How long until a moment of the server's clock; never negative.
  Duration until(DateTime serverMoment) {
    final left = serverMoment.difference(now());
    return left.isNegative ? Duration.zero : left;
  }
}

const heartbeatEvery = Duration(seconds: 5);
const answerTime = Duration(seconds: 10);

/// One match as the screen follows it: the last state the server gave, the
/// server's clock, the heartbeat every 5 seconds, and what to ask for when a
/// countdown or a deadline runs out. With the connection gone it keeps trying,
/// and says so; the server's state is the truth again as soon as one answer
/// comes through.
class MatchSession extends ChangeNotifier {
  MatchSession({required this.matchId, required this.repository, required DateTime Function() now, this.feedback}) : _local = now, clock = ServerClock(now);

  final String matchId;
  final GameRepository repository;
  final DateTime Function() _local;
  final GameFeedback? feedback;
  final ServerClock clock;

  MatchState? _state;
  MatchQuestion? _lastQuestion;
  bool _reconnecting = false;
  bool _notFound = false;
  bool _disposed = false;
  String? _sending;
  final _myAnswers = <int, ({String option, bool? correct})>{};
  Timer? _heartbeat;
  Timer? _next;
  StreamSubscription<void>? _changes;
  bool _announcedEnd = false;

  MatchState? get state => _state;

  /// The server cannot be reached; the session keeps trying.
  bool get reconnecting => _reconnecting;

  /// This is not the player's match, or it is gone.
  bool get notFound => _notFound;

  /// The question to show: the one that is open, or the one just settled while
  /// the next has not been shown yet.
  MatchQuestion? get question => _state?.question ?? (_lastQuestion?.index == _state?.previous?.index ? _lastQuestion : null);

  /// The choice being sent, before the server has answered.
  String? get sending => _sending;

  /// What the player answered to a question, and whether it was right once known.
  ({String option, bool? correct})? answerTo(int index) => _myAnswers[index];

  /// The open question's seconds left, by the server's clock.
  Duration get timeLeft => _state == null ? Duration.zero : clock.until(_state!.deadline);

  /// Until the first question, while the match counts down 3-2-1.
  Duration get countdownLeft => _state == null ? Duration.zero : clock.until(_state!.questionStartedAt);

  void start() {
    _changes = repository.matchChanges(matchId).listen((_) => unawaited(_ask(() => repository.matchState(matchId))));
    _heartbeat = Timer.periodic(heartbeatEvery, (_) => unawaited(_ask(() => repository.heartbeat(matchId))));
    unawaited(_ask(() => repository.heartbeat(matchId)));
  }

  /// Asks the server now: when the app comes back to the front.
  Future<void> refresh() => _ask(() => repository.heartbeat(matchId));

  Future<void> _ask(Future<MatchState> Function() call) async {
    final sentAt = _local();
    try {
      final next = await call();
      if (_disposed) return;
      _reconnecting = false;
      _take(next, sentAt: sentAt);
    } on GameException {
      if (_disposed) return;
      _notFound = true;
      _stop();
      notifyListeners();
    } catch (_) {
      if (_disposed) return;
      // Offline, or the server stumbled: the heartbeat asks again.
      _reconnecting = true;
      notifyListeners();
    }
  }

  void _take(MatchState next, {DateTime? sentAt}) {
    clock.sync(next.serverNow, sentAt: sentAt);
    // Answers arrive out of order when the connection is poor: an older one never replaces a newer.
    final current = _state;
    if (current != null && !next.over && (next.currentIndex < current.currentIndex || (current.over))) return;
    _state = next;
    if (next.question != null) _lastQuestion = next.question;
    if (next.youAnswered && next.yourOption != null && next.question != null) {
      _myAnswers.putIfAbsent(next.question!.index, () => (option: next.yourOption!, correct: null));
    }
    final settled = next.previous;
    if (settled != null && settled.yourOption != null) {
      _myAnswers[settled.index] = (option: settled.yourOption!, correct: settled.yourOption == settled.correctOptionId);
    }
    if (next.over) {
      _stop();
      if (!_announcedEnd && next.result != null) {
        _announcedEnd = true;
        feedback?.finished(won: next.result!.outcome == MatchOutcome.win);
      }
    } else {
      _schedule(next);
    }
    notifyListeners();
  }

  /// When the countdown or the question's time runs out, the server is asked to move on.
  void _schedule(MatchState state) {
    _next?.cancel();
    final target = clock.now().isBefore(state.questionStartedAt) ? state.questionStartedAt : state.deadline;
    // A little after, so the server's clock has certainly passed it.
    final wait = target.difference(clock.now()) + const Duration(milliseconds: 150);
    _next = Timer(wait.isNegative ? const Duration(milliseconds: 150) : wait, () => unawaited(_ask(() => repository.advance(matchId))));
  }

  /// The player taps a choice. Once per question; the server decides whether it counted.
  Future<void> answer(String optionId) async {
    final state = _state;
    final question = state?.question;
    if (state == null || question == null || state.over || _sending != null || _myAnswers.containsKey(question.index)) return;
    _sending = optionId;
    feedback?.tap();
    notifyListeners();
    final sentAt = _local();
    try {
      final result = await repository.submit(matchId, question.index, optionId);
      if (_disposed) return;
      _reconnecting = false;
      if (result.accepted) {
        _myAnswers[question.index] = (option: optionId, correct: result.isCorrect);
        if (result.isCorrect != null) feedback?.answered(correct: result.isCorrect!);
      }
      _sending = null;
      _take(result.state, sentAt: sentAt);
    } catch (_) {
      if (_disposed) return;
      // Not sent: the choice can be tapped again while the question is open.
      _sending = null;
      _reconnecting = true;
      notifyListeners();
    }
  }

  void _stop() {
    _heartbeat?.cancel();
    _next?.cancel();
    unawaited(_changes?.cancel());
  }

  @override
  void dispose() {
    _disposed = true;
    _stop();
    super.dispose();
  }
}
