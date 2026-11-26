import 'dart:async';

import 'package:student/core/game_state.dart';
import 'package:student/data/game.dart';

// The game server in memory, with the rules of
// supabase/migrations/20261210100000_game.sql: the queue, challenges, the
// countdown, ten questions of ten seconds, the rope, heartbeats and forfeits,
// and coins for a win between two students within the daily limits. Several
// players use it at once, each through their own FakeGameRepository.

class FakeQuestion {
  const FakeQuestion(this.text, this.options, this.correct, [this.explanation]);

  final String text;
  final List<String> options;

  /// 'a'…'d'
  final String correct;
  final String? explanation;

  List<QuestionOption> get choices => [for (final (index, option) in options.indexed) QuestionOption(id: 'abcd'[index], text: option)];
}

/// Ten Korean particle questions, as in the designs.
const sampleQuestions = [
  FakeQuestion('저는 학생__.', ['입니다', '습니다', '있습니다', '합니다'], 'a'),
  FakeQuestion('이것__ 책입니다.', ['을', '은', '에', '의'], 'b'),
  FakeQuestion('물__ 마셔요.', ['이', '에', '을', '는'], 'c'),
  FakeQuestion('친구__ 만나요.', ['에', '가', '은', '를'], 'd'),
  FakeQuestion('집__ 쉬어요.', ['에서', '를', '이', '은'], 'a'),
  FakeQuestion('저는 학교__ 가요.', ['에', '를', '이', '은'], 'a', 'Boradigan joy 에 qoʻshimchasi bilan bildiriladi.'),
  FakeQuestion('어제 영화를 __.', ['봐요', '봤어요', '볼 거예요', '보세요'], 'b'),
  FakeQuestion('날씨__ 좋아요.', ['를', '에', '가', '의'], 'c'),
  FakeQuestion('한국어__ 공부해요.', ['가', '에', '은', '를'], 'd'),
  FakeQuestion('주말__ 뭐 해요?', ['에', '를', '이', '은'], 'a'),
];

class FakePlayer {
  FakePlayer(this.id, this.name, {this.student = true, this.groupId = 'g-1', this.subject = 'TOPIK', this.level = 'topik2'});

  final String id;

  /// "Jasur T."
  final String name;
  final bool student;
  final String? groupId;
  final String subject;
  final String level;
  int rewardedWinsToday = 0;
}

class _Answer {
  _Answer(this.option, this.correct, this.at, this.ms);

  final String option;
  final bool correct;
  final DateTime at;
  final int ms;
}

class _Match {
  _Match(this.id, this.kind, this.a, this.b, this.startedAt)
    : lastSeenA = startedAt.subtract(const Duration(seconds: 3)),
      lastSeenB = startedAt.subtract(const Duration(seconds: 3));

  final String id;
  final MatchKind kind;
  final FakePlayer a;

  /// null = the computer
  final FakePlayer? b;
  MatchStatus status = MatchStatus.countdown;
  int index = 0;
  DateTime startedAt;
  int rope = 0;
  String? winner;
  String? forfeitedBy;
  bool rewarded = false;
  bool eligible = false;
  DateTime lastSeenA;
  DateTime lastSeenB;
  DateTime? finishedAt;
  final answers = <String, _Answer>{};

  bool get over => status == MatchStatus.finished || status == MatchStatus.cancelled;
  String? sideOf(String playerId) => a.id == playerId ? 'a' : (b?.id == playerId ? 'b' : null);
}

class _Invite {
  _Invite(this.id, this.from, this.to, this.expiresAt);

  final String id;
  final FakePlayer from;
  final FakePlayer to;
  final DateTime expiresAt;
  InviteStatus status = InviteStatus.pending;
  String? matchId;
}

class FakeGameServer {
  FakeGameServer({required this.now, List<FakeQuestion>? questions}) : questions = questions ?? sampleQuestions;

  DateTime Function() now;
  final List<FakeQuestion> questions;
  final players = <String, FakePlayer>{};
  final recent = <String, List<RecentMatch>>{};

  /// The bank of a student's other groups, by group id: (subject, level).
  final groupBanks = <String, (String, String)>{};

  /// Whether Play now and challenges are open: the bank has enough questions.
  bool randomOpen = true;
  int winCoins = 5;
  int dailyRewardedWins = 5;
  int pairDailyCap = 2;

  /// How the computer answers question `index`: the option and after how many milliseconds.
  ({String option, int ms}) Function(int index, FakeQuestion question) computer = (index, question) =>
      (option: index.isEven ? question.correct : 'd', ms: 5000);

  /// Thrown by the next calls: an [OfflineException] for a lost connection.
  Object? failure;
  final _queue = <({FakePlayer player, DateTime joinedAt})>[];
  final _matches = <String, _Match>{};
  final _invites = <String, _Invite>{};
  final _rewardedPairs = <String, int>{};
  final _changes = StreamController<void>.broadcast();
  var _next = 1;

  Stream<void> get changes => _changes.stream;

  FakePlayer add(FakePlayer player) => players[player.id] = player;

  void _check() {
    if (failure != null) throw failure!;
  }

  FakePlayer _me(String id) => players[id] ?? (throw const GameException(GameFailure.notAllowed));

  _Match? _active(String playerId) => _matches.values.where((match) => !match.over && match.sideOf(playerId) != null).firstOrNull;

  _Match _create(MatchKind kind, FakePlayer a, FakePlayer? b) {
    final match = _Match('m-${_next++}', kind, a, b, now().add(const Duration(seconds: 3)))
      ..lastSeenA = now()
      ..lastSeenB = now()
      ..eligible = kind != MatchKind.practice && a.student && (b?.student ?? false);
    _matches[match.id] = match;
    _queue.removeWhere((entry) => entry.player == a || entry.player == b);
    if (b == null) _computerAnswer(match);
    _changes.add(null);
    return match;
  }

  void _computerAnswer(_Match match) {
    final question = questions[match.index];
    final answer = computer(match.index, question);
    match.answers['b${match.index}'] = _Answer(
      answer.option,
      answer.option == question.correct,
      match.startedAt.add(Duration(milliseconds: answer.ms)),
      answer.ms,
    );
  }

  void _finish(_Match match, String winner, {String? forfeitedBy}) {
    match
      ..status = MatchStatus.finished
      ..winner = winner
      ..forfeitedBy = forfeitedBy
      ..finishedAt = now();
    if (winner != 'draw' && match.eligible) {
      final who = winner == 'a' ? match.a : match.b!;
      final pair = ([match.a.id, match.b!.id]..sort()).join('|');
      if (who.rewardedWinsToday < dailyRewardedWins && (_rewardedPairs[pair] ?? 0) < pairDailyCap) {
        match.rewarded = true;
        who.rewardedWinsToday++;
        _rewardedPairs[pair] = (_rewardedPairs[pair] ?? 0) + 1;
      }
    }
    for (final player in [match.a, ?match.b]) {
      final mine = match.sideOf(player.id)!;
      final other = mine == 'a' ? match.b : match.a;
      recent
          .putIfAbsent(player.id, () => [])
          .insert(
            0,
            RecentMatch(
              id: match.id,
              finishedAt: match.finishedAt!,
              outcome: winner == 'draw' ? MatchOutcome.draw : (winner == mine ? MatchOutcome.win : MatchOutcome.loss),
              coins: match.rewarded && winner == mine ? winCoins : 0,
              opponent: other?.name,
              computer: other == null,
            ),
          );
    }
  }

  static int _pull(_Answer? a, _Answer? b) {
    final aOk = a?.correct ?? false;
    final bOk = b?.correct ?? false;
    if (aOk && bOk) return a!.ms < b!.ms ? 1 : (b.ms < a.ms ? -1 : 0);
    return aOk ? 1 : (bOk ? -1 : 0);
  }

  _Answer? _answer(_Match match, String side, int index) {
    final answer = match.answers['$side$index'];
    return answer != null && !answer.at.isAfter(now()) ? answer : null;
  }

  /// Moves a match on as far as the clock allows.
  void _tick(_Match match) {
    while (!match.over) {
      final aGone = match.lastSeenA.isBefore(now().subtract(const Duration(seconds: 20)));
      final bGone = match.b != null && match.lastSeenB.isBefore(now().subtract(const Duration(seconds: 20)));
      if (aGone && (bGone || match.b == null)) {
        match
          ..status = MatchStatus.cancelled
          ..finishedAt = now();
        break;
      } else if (aGone) {
        _finish(match, 'b', forfeitedBy: 'a');
        break;
      } else if (bGone) {
        _finish(match, 'a', forfeitedBy: 'b');
        break;
      }
      if (now().isBefore(match.startedAt)) return;
      match.status = MatchStatus.playing;
      final a = _answer(match, 'a', match.index);
      final b = _answer(match, 'b', match.index);
      if (!(a != null && b != null) && now().isBefore(match.startedAt.add(const Duration(seconds: 10)))) return;
      match.rope = (match.rope + _pull(a, b)).clamp(-5, 5);
      if (match.rope.abs() >= 5 || match.index >= 9) {
        _finish(match, match.rope > 0 ? 'a' : (match.rope < 0 ? 'b' : 'draw'));
        break;
      }
      match
        ..index += 1
        ..startedAt = now().add(const Duration(seconds: 2));
      if (match.b == null) _computerAnswer(match);
    }
    _changes.add(null);
  }

  MatchState _state(_Match match, String playerId) {
    final me = match.sideOf(playerId) ?? (throw const GameException(GameFailure.notAllowed));
    final them = me == 'a' ? 'b' : 'a';
    final sign = me == 'a' ? 1 : -1;
    final shown = !match.over && !now().isBefore(match.startedAt);
    final question = questions[match.index];
    final mine = match.answers['$me${match.index}'];
    final finished = match.status == MatchStatus.finished;
    final previousIndex = finished && match.forfeitedBy == null ? match.index : (match.index > 0 ? match.index - 1 : null);
    final played = match.index + (!(match.finishedAt ?? now()).isBefore(match.startedAt) ? 1 : 0);
    final opponent = me == 'a' ? match.b : match.a;
    return MatchState(
      id: match.id,
      kind: match.kind,
      status: shown && match.status == MatchStatus.countdown ? MatchStatus.playing : match.status,
      subject: match.a.subject,
      level: match.a.level,
      opponentName: opponent?.name,
      opponentIsComputer: opponent == null,
      coinsEligible: match.eligible,
      rope: match.rope * sign,
      total: 10,
      currentIndex: match.index,
      serverNow: now(),
      questionStartedAt: match.startedAt,
      deadline: match.startedAt.add(const Duration(seconds: 10)),
      question: shown ? MatchQuestion(index: match.index, text: question.text, options: question.choices) : null,
      youAnswered: shown && mine != null,
      yourOption: shown ? mine?.option : null,
      opponentAnswered: shown && _answer(match, them, match.index) != null,
      previous: previousIndex == null || match.status == MatchStatus.cancelled
          ? null
          : SettledQuestion(
              index: previousIndex,
              correctOptionId: questions[previousIndex].correct,
              yourOption: match.answers['$me$previousIndex']?.option,
              opponentOption: _answer(match, them, previousIndex)?.option,
              pull: _pull(match.answers['$me$previousIndex'], _answer(match, them, previousIndex)),
            ),
      result: !finished
          ? null
          : MatchResult(
              outcome: match.winner == 'draw' ? MatchOutcome.draw : (match.winner == me ? MatchOutcome.win : MatchOutcome.loss),
              forfeit: match.forfeitedBy != null,
              rewarded: match.rewarded && match.winner == me,
              coins: match.rewarded && match.winner == me ? winCoins : 0,
              review: [
                for (var index = 0; index < played; index++)
                  ReviewItem(
                    index: index,
                    text: questions[index].text,
                    options: questions[index].choices,
                    correctOptionId: questions[index].correct,
                    explanation: questions[index].explanation,
                    yourOption: match.answers['$me$index']?.option,
                    opponentOption: match.answers['$them$index']?.option,
                  ),
              ],
            ),
    );
  }

  _Match _matchOf(String matchId, String playerId) {
    final match = _matches[matchId];
    if (match == null || match.sideOf(playerId) == null) throw const GameException(GameFailure.notAllowed);
    return match;
  }

  // ── What a player's app asks for ──

  GameLobby lobby(String playerId, [String? groupId]) {
    _check();
    final me = _me(playerId);
    final bank = groupBanks[groupId] ?? (me.subject, me.level);
    return GameLobby(
      subject: bank.$1,
      level: bank.$2,
      randomOpen: randomOpen,
      challengeOpen: me.student && randomOpen,
      coins: me.student,
      winCoins: winCoins,
      dailyRewardedWins: dailyRewardedWins,
      rewardedWinsToday: me.rewardedWinsToday,
      serverNow: now(),
      activeMatchId: _active(playerId)?.id,
      queuedAt: _queue.where((entry) => entry.player == me).firstOrNull?.joinedAt,
      invites: [
        for (final invite in _invites.values)
          if (invite.to == me && invite.status == InviteStatus.pending && invite.expiresAt.isAfter(now()))
            GameInvite(id: invite.id, from: invite.from.name, subject: invite.from.subject, level: invite.from.level, expiresAt: invite.expiresAt),
      ],
      recent: (recent[playerId] ?? const []).take(20).toList(),
    );
  }

  JoinResult joinQueue(String playerId) {
    _check();
    final me = _me(playerId);
    final active = _active(playerId);
    if (active != null) {
      _tick(active);
      if (!active.over) return JoinResult(matchId: active.id);
    }
    if (!randomOpen) throw const GameException(GameFailure.bankNotReady);
    final other = _queue
        .where((entry) => entry.player != me && entry.player.subject == me.subject && entry.player.level == me.level && _active(entry.player.id) == null)
        .firstOrNull;
    if (other != null) return JoinResult(matchId: _create(MatchKind.random, other.player, me).id);
    final mine = _queue.where((entry) => entry.player == me).firstOrNull;
    if (mine == null) _queue.add((player: me, joinedAt: now()));
    return JoinResult(queuedAt: mine?.joinedAt ?? now(), serverNow: now());
  }

  void leaveQueue(String playerId) => _queue.removeWhere((entry) => entry.player.id == playerId);

  String startPractice(String playerId) {
    _check();
    final me = _me(playerId);
    final active = _active(playerId);
    if (active != null) return active.id;
    final mine = _queue.where((entry) => entry.player == me).firstOrNull;
    if (mine == null || mine.joinedAt.isAfter(now().subtract(const Duration(seconds: 30)))) throw const GameException(GameFailure.practiceNotYet);
    return _create(MatchKind.practice, me, null).id;
  }

  List<Classmate> classmates(String playerId) {
    _check();
    final me = _me(playerId);
    if (!me.student) throw const GameException(GameFailure.notAllowed);
    return [
      for (final player in players.values)
        if (player != me && player.student && player.groupId == me.groupId) Classmate(profileId: player.id, name: player.name),
    ];
  }

  String sendInvite(String playerId, String toId) {
    _check();
    final me = _me(playerId);
    if (!me.student) throw const GameException(GameFailure.notAllowed);
    final to = players[toId];
    if (to == null || !to.student || to.groupId != me.groupId || to == me) throw const GameException(GameFailure.notClassmate);
    if (_active(playerId) != null) throw const GameException(GameFailure.inMatch);
    for (final invite in _invites.values) {
      if (invite.from == me && invite.status == InviteStatus.pending) invite.status = InviteStatus.expired;
    }
    final invite = _Invite('i-${_next++}', me, to, now().add(const Duration(seconds: 60)));
    _invites[invite.id] = invite;
    _queue.removeWhere((entry) => entry.player == me);
    _changes.add(null);
    return invite.id;
  }

  InviteState? inviteState(String inviteId) {
    _check();
    final invite = _invites[inviteId];
    if (invite == null) return null;
    if (invite.status == InviteStatus.pending && !invite.expiresAt.isAfter(now())) invite.status = InviteStatus.expired;
    return InviteState(status: invite.status, matchId: invite.matchId, expiresAt: invite.expiresAt);
  }

  String? answerInvite(String playerId, String inviteId, {required bool accept}) {
    _check();
    final invite = _invites[inviteId];
    if (invite == null || invite.to.id != playerId) throw const GameException(GameFailure.notAllowed);
    if (invite.status != InviteStatus.pending || !invite.expiresAt.isAfter(now())) {
      if (invite.status == InviteStatus.pending) invite.status = InviteStatus.expired;
      _changes.add(null);
      return null;
    }
    if (!accept) {
      invite.status = InviteStatus.declined;
      _changes.add(null);
      return null;
    }
    if (_active(playerId) != null) throw const GameException(GameFailure.inMatch);
    final match = _create(MatchKind.friend, invite.from, invite.to);
    invite
      ..status = InviteStatus.accepted
      ..matchId = match.id;
    _changes.add(null);
    return match.id;
  }

  MatchState matchState(String playerId, String matchId) {
    _check();
    return _state(_matchOf(matchId, playerId), playerId);
  }

  MatchState heartbeat(String playerId, String matchId) {
    _check();
    final match = _matchOf(matchId, playerId);
    _tick(match);
    if (!match.over) {
      if (match.sideOf(playerId) == 'a') {
        match.lastSeenA = now();
      } else {
        match.lastSeenB = now();
      }
    }
    return _state(match, playerId);
  }

  MatchState advance(String playerId, String matchId) {
    _check();
    final match = _matchOf(matchId, playerId);
    _tick(match);
    return _state(match, playerId);
  }

  AnswerResult submit(String playerId, String matchId, int index, String option) {
    _check();
    final match = _matchOf(matchId, playerId);
    final me = match.sideOf(playerId)!;
    _tick(match);
    String? reason;
    bool? correct;
    if (match.over || index != match.index) {
      reason = match.over || index < match.index ? 'late' : 'not_open';
    } else if (now().isBefore(match.startedAt)) {
      reason = 'not_open';
    } else if (now().isAfter(match.startedAt.add(const Duration(seconds: 10)))) {
      reason = 'late';
    } else if (!questions[index].choices.any((choice) => choice.id == option)) {
      reason = 'invalid';
    } else if (match.answers.containsKey('$me$index')) {
      reason = 'already';
    } else {
      correct = option == questions[index].correct;
      match.answers['$me$index'] = _Answer(option, correct, now(), now().difference(match.startedAt).inMilliseconds);
      if (me == 'a') {
        match.lastSeenA = now();
      } else {
        match.lastSeenB = now();
      }
      _tick(match);
      _changes.add(null);
    }
    return AnswerResult(accepted: reason == null, isCorrect: correct, reason: reason, state: _state(match, playerId));
  }

  /// The job that runs every minute.
  void closeAbandoned() {
    for (final match in _matches.values.toList()) {
      if (!match.over) _tick(match);
    }
  }
}

/// One player's connection to the game server.
class FakeGameRepository implements GameRepository {
  FakeGameRepository(this.server, this.playerId);

  final FakeGameServer server;
  String playerId;
  final calls = <String>[];

  T _call<T>(String name, T Function() run) {
    calls.add(name);
    return run();
  }

  @override
  Future<GameLobby> lobby(String? groupId) async => _call('lobby', () => server.lobby(playerId, groupId));

  @override
  Future<JoinResult> joinQueue(String? groupId) async => _call('joinQueue', () => server.joinQueue(playerId));

  @override
  Future<void> leaveQueue() async => _call('leaveQueue', () => server.leaveQueue(playerId));

  @override
  Future<String> startPractice() async => _call('startPractice', () => server.startPractice(playerId));

  @override
  Future<List<Classmate>> classmates(String groupId) async => _call('classmates', () => server.classmates(playerId));

  @override
  Future<String> sendInvite(String toProfile, String groupId) async => _call('sendInvite', () => server.sendInvite(playerId, toProfile));

  @override
  Future<InviteState?> inviteState(String inviteId) async => _call('inviteState', () => server.inviteState(inviteId));

  @override
  Future<String?> answerInvite(String inviteId, {required bool accept}) async =>
      _call('answerInvite', () => server.answerInvite(playerId, inviteId, accept: accept));

  @override
  Future<MatchState> matchState(String matchId) async => _call('matchState', () => server.matchState(playerId, matchId));

  @override
  Future<MatchState> heartbeat(String matchId) async => _call('heartbeat', () => server.heartbeat(playerId, matchId));

  @override
  Future<MatchState> advance(String matchId) async => _call('advance', () => server.advance(playerId, matchId));

  @override
  Future<AnswerResult> submit(String matchId, int questionIndex, String optionId) async =>
      _call('submit', () => server.submit(playerId, matchId, questionIndex, optionId));

  @override
  Stream<void> matchChanges(String matchId) => server.changes;

  @override
  Stream<void> lobbyChanges() => server.changes;
}

/// Haptics and sounds, written down instead of played.
class FakeGameFeedback implements GameFeedback {
  final events = <String>[];

  @override
  void tap() => events.add('tap');

  @override
  void answered({required bool correct}) => events.add(correct ? 'right' : 'wrong');

  @override
  void finished({required bool won}) => events.add(won ? 'won' : 'finished');
}
