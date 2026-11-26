import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// The 1v1 game — docs/STUDENT_APP_SPEC.md → "Rules → 1v1 game". The server
// decides everything: who plays whom, which questions, whether an answer is
// right and in time, where the rope is and who gets coins. The app shows the
// state it is told and sends taps.

/// A bank as people call it: "TOPIK II", "Matematika · 7-sinf", "Ingliz tili".
String bankLabel(String subject, String level) {
  if (subject == 'TOPIK') return level == 'topik2' ? 'TOPIK II' : (level == 'topik1' ? 'TOPIK I' : subject);
  return level.isEmpty ? subject : '$subject · $level';
}

DateTime _time(Object? value) => DateTime.parse(value! as String).toUtc();
DateTime? _maybeTime(Object? value) => value is String ? DateTime.parse(value).toUtc() : null;
Map<String, dynamic> _map(Object? value) => Map<String, dynamic>.from(value! as Map);

enum MatchOutcome { win, loss, draw }

MatchOutcome _outcome(Object? value) => MatchOutcome.values.firstWhere((outcome) => outcome.name == value, orElse: () => MatchOutcome.draw);

/// A challenge from a classmate, open until [expiresAt].
class GameInvite {
  const GameInvite({required this.id, required this.from, required this.subject, required this.level, required this.expiresAt});

  final String id;

  /// "Jasur T."
  final String from;
  final String subject;
  final String level;
  final DateTime expiresAt;

  factory GameInvite.fromJson(Map<String, dynamic> json) => GameInvite(
    id: '${json['id']}',
    from: '${json['from'] ?? ''}',
    subject: '${json['subject']}',
    level: '${json['level']}',
    expiresAt: _time(json['expires_at']),
  );
}

class RecentMatch {
  const RecentMatch({required this.id, required this.finishedAt, required this.outcome, required this.coins, this.opponent, this.computer = false});

  final String id;
  final DateTime finishedAt;
  final MatchOutcome outcome;
  final int coins;

  /// "Jasur T."; null for the computer.
  final String? opponent;
  final bool computer;

  factory RecentMatch.fromJson(Map<String, dynamic> json) => RecentMatch(
    id: '${json['id']}',
    finishedAt: _time(json['finished_at']),
    outcome: _outcome(json['outcome']),
    coins: (json['coins'] as num?)?.toInt() ?? 0,
    opponent: json['opponent'] as String?,
    computer: json['computer'] == true,
  );
}

/// What the lobby shows for one bank.
class GameLobby {
  const GameLobby({
    required this.subject,
    required this.level,
    required this.randomOpen,
    required this.challengeOpen,
    required this.coins,
    required this.winCoins,
    required this.dailyRewardedWins,
    required this.rewardedWinsToday,
    required this.serverNow,
    this.activeMatchId,
    this.queuedAt,
    this.invites = const [],
    this.recent = const [],
  });

  final String subject;
  final String level;

  /// Play now is open: the bank has enough questions.
  final bool randomOpen;

  /// A classmate can be challenged: a student, and the bank has ten questions.
  final bool challengeOpen;

  /// Wins can pay coins: a linked student, with the coins programme on.
  final bool coins;
  final int winCoins;
  final int dailyRewardedWins;
  final int rewardedWinsToday;
  final DateTime serverNow;
  final String? activeMatchId;
  final DateTime? queuedAt;
  final List<GameInvite> invites;
  final List<RecentMatch> recent;

  String get label => bankLabel(subject, level);

  factory GameLobby.fromJson(Map<String, dynamic> json) => GameLobby(
    subject: '${json['subject']}',
    level: '${json['level'] ?? ''}',
    randomOpen: json['random_open'] == true,
    challengeOpen: json['challenge_open'] == true,
    coins: json['coins'] == true,
    winCoins: (json['win_coins'] as num?)?.toInt() ?? 0,
    dailyRewardedWins: (json['daily_rewarded_wins'] as num?)?.toInt() ?? 0,
    rewardedWinsToday: (json['rewarded_wins_today'] as num?)?.toInt() ?? 0,
    serverNow: _time(json['server_now']),
    activeMatchId: json['active_match_id'] as String?,
    queuedAt: _maybeTime(json['queued_at']),
    invites: [for (final invite in json['invites'] as List? ?? const []) GameInvite.fromJson(_map(invite))],
    recent: [for (final match in json['recent'] as List? ?? const []) RecentMatch.fromJson(_map(match))],
  );
}

class Classmate {
  const Classmate({required this.profileId, required this.name});

  final String profileId;

  /// "Jasur T."
  final String name;
}

/// Play now: a match at once, or a place in the queue.
class JoinResult {
  const JoinResult({this.matchId, this.queuedAt, this.serverNow});

  final String? matchId;
  final DateTime? queuedAt;
  final DateTime? serverNow;
}

enum InviteStatus { pending, accepted, declined, expired }

/// Where a challenge the player sent stands.
class InviteState {
  const InviteState({required this.status, this.matchId, this.expiresAt});

  final InviteStatus status;
  final String? matchId;
  final DateTime? expiresAt;
}

class QuestionOption {
  const QuestionOption({required this.id, required this.text});

  final String id;
  final String text;

  static List<QuestionOption> listFrom(Object? json) => [
    for (final option in json as List? ?? const []) QuestionOption(id: '${option['id']}', text: '${option['text']}'),
  ];
}

/// The question on screen. Its answer is not here.
class MatchQuestion {
  const MatchQuestion({required this.index, required this.text, required this.options, this.imagePath});

  final int index;
  final String text;
  final List<QuestionOption> options;
  final String? imagePath;
}

/// The question that has just been settled: now its answer is told.
class SettledQuestion {
  const SettledQuestion({required this.index, required this.correctOptionId, required this.pull, this.yourOption, this.opponentOption});

  final int index;
  final String correctOptionId;

  /// How it moved the rope: 1 towards the player, −1 towards the opponent, 0 not at all.
  final int pull;
  final String? yourOption;
  final String? opponentOption;
}

class ReviewItem {
  const ReviewItem({
    required this.index,
    required this.text,
    required this.options,
    required this.correctOptionId,
    this.explanation,
    this.yourOption,
    this.opponentOption,
  });

  final int index;
  final String text;
  final List<QuestionOption> options;
  final String correctOptionId;
  final String? explanation;
  final String? yourOption;
  final String? opponentOption;

  String textOf(String? optionId) => options.where((option) => option.id == optionId).firstOrNull?.text ?? '';
}

class MatchResult {
  const MatchResult({required this.outcome, required this.forfeit, required this.rewarded, required this.coins, required this.review});

  final MatchOutcome outcome;

  /// It ended because a player stopped answering the server.
  final bool forfeit;
  final bool rewarded;
  final int coins;
  final List<ReviewItem> review;

  int get yourCorrect => review.where((item) => item.yourOption == item.correctOptionId).length;
  int get opponentCorrect => review.where((item) => item.opponentOption == item.correctOptionId).length;
}

enum MatchStatus { countdown, playing, finished, cancelled }

enum MatchKind { random, friend, practice }

/// Everything a player may know about their match at a moment.
class MatchState {
  const MatchState({
    required this.id,
    required this.kind,
    required this.status,
    required this.subject,
    required this.level,
    required this.opponentIsComputer,
    required this.coinsEligible,
    required this.rope,
    required this.total,
    required this.currentIndex,
    required this.serverNow,
    required this.questionStartedAt,
    required this.deadline,
    this.opponentName,
    this.question,
    this.youAnswered = false,
    this.yourOption,
    this.opponentAnswered = false,
    this.previous,
    this.result,
  });

  final String id;
  final MatchKind kind;
  final MatchStatus status;
  final String subject;
  final String level;
  final String? opponentName;
  final bool opponentIsComputer;
  final bool coinsEligible;

  /// −5…5, positive on the player's side.
  final int rope;
  final int total;
  final int currentIndex;
  final DateTime serverNow;

  /// When the current question is, or will be, shown.
  final DateTime questionStartedAt;
  final DateTime deadline;
  final MatchQuestion? question;
  final bool youAnswered;
  final String? yourOption;
  final bool opponentAnswered;
  final SettledQuestion? previous;
  final MatchResult? result;

  bool get over => status == MatchStatus.finished || status == MatchStatus.cancelled;

  factory MatchState.fromJson(Map<String, dynamic> json) {
    final question = json['question'] is Map ? _map(json['question']) : null;
    final answered = json['answered'] is Map ? _map(json['answered']) : null;
    final previous = json['previous'] is Map ? _map(json['previous']) : null;
    final result = json['result'] is Map ? _map(json['result']) : null;
    final opponent = json['opponent'] is Map ? _map(json['opponent']) : const <String, dynamic>{};
    return MatchState(
      id: '${json['id']}',
      kind: MatchKind.values.firstWhere((kind) => kind.name == json['kind'], orElse: () => MatchKind.random),
      status: MatchStatus.values.firstWhere((status) => status.name == json['status'], orElse: () => MatchStatus.playing),
      subject: '${json['subject']}',
      level: '${json['level'] ?? ''}',
      opponentName: opponent['name'] as String?,
      opponentIsComputer: opponent['computer'] == true,
      coinsEligible: json['coins_eligible'] == true,
      rope: (json['rope'] as num?)?.toInt() ?? 0,
      total: (json['total'] as num?)?.toInt() ?? 10,
      currentIndex: (json['current_index'] as num?)?.toInt() ?? 0,
      serverNow: _time(json['server_now']),
      questionStartedAt: _time(json['question_started_at']),
      deadline: _time(json['deadline']),
      question: question == null
          ? null
          : MatchQuestion(
              index: (question['index'] as num).toInt(),
              text: '${question['text']}',
              imagePath: question['image_path'] as String?,
              options: QuestionOption.listFrom(question['options']),
            ),
      youAnswered: answered?['you'] == true,
      yourOption: answered?['your_option'] as String?,
      opponentAnswered: answered?['opponent'] == true,
      previous: previous == null
          ? null
          : SettledQuestion(
              index: (previous['index'] as num).toInt(),
              correctOptionId: '${previous['correct_option_id']}',
              pull: (previous['pull'] as num?)?.toInt() ?? 0,
              yourOption: previous['your_option'] as String?,
              opponentOption: previous['opponent_option'] as String?,
            ),
      result: result == null
          ? null
          : MatchResult(
              outcome: _outcome(result['outcome']),
              forfeit: result['forfeit'] == true,
              rewarded: result['rewarded'] == true,
              coins: (result['coins'] as num?)?.toInt() ?? 0,
              review: [
                for (final item in result['review'] as List? ?? const [])
                  ReviewItem(
                    index: (item['index'] as num).toInt(),
                    text: '${item['text']}',
                    options: QuestionOption.listFrom(item['options']),
                    correctOptionId: '${item['correct_option_id']}',
                    explanation: item['explanation'] as String?,
                    yourOption: item['your_option'] as String?,
                    opponentOption: item['opponent_option'] as String?,
                  ),
              ],
            ),
    );
  }
}

/// What the server said to an answer.
class AnswerResult {
  const AnswerResult({required this.accepted, required this.state, this.isCorrect, this.reason});

  final bool accepted;

  /// Whether it was right, when it was accepted.
  final bool? isCorrect;

  /// late, already, not_open or invalid, when it was not.
  final String? reason;
  final MatchState state;
}

/// Why the server refused.
enum GameFailure { bankNotReady, inMatch, inviteClosed, notClassmate, practiceNotYet, notAllowed }

class GameException implements Exception {
  const GameException(this.failure);

  final GameFailure failure;

  static GameException? fromCode(String? code) => switch (code) {
    'EG001' => const GameException(GameFailure.bankNotReady),
    'EG002' => const GameException(GameFailure.inMatch),
    'EG003' => const GameException(GameFailure.inviteClosed),
    'EG004' => const GameException(GameFailure.notClassmate),
    'EG005' => const GameException(GameFailure.practiceNotYet),
    '42501' => const GameException(GameFailure.notAllowed),
    _ => null,
  };
}

abstract class GameRepository {
  /// The lobby of a student's group, or of an App user's level (no group).
  Future<GameLobby> lobby(String? groupId);

  /// Play now. Asking again while waiting keeps the place in the line.
  Future<JoinResult> joinQueue(String? groupId);

  Future<void> leaveQueue();

  /// A match against the computer, after 30 seconds of waiting. Returns its id.
  Future<String> startPractice();

  Future<List<Classmate>> classmates(String groupId);

  /// Challenges a classmate. Returns the invite's id.
  Future<String> sendInvite(String toProfile, String groupId);

  /// Where an invite the player sent stands, or null when it is gone.
  Future<InviteState?> inviteState(String inviteId);

  /// Accepts or declines. Returns the match's id when one was made.
  Future<String?> answerInvite(String inviteId, {required bool accept});

  Future<MatchState> matchState(String matchId);

  /// "I am still here", every 5 seconds. Also moves the match on.
  Future<MatchState> heartbeat(String matchId);

  /// Called when a deadline has passed.
  Future<MatchState> advance(String matchId);

  Future<AnswerResult> submit(String matchId, int questionIndex, String optionId);

  /// Fires when the match changes on the server.
  Stream<void> matchChanges(String matchId);

  /// Fires when a match is made for the player, or a challenge to or from them changes.
  Stream<void> lobbyChanges();
}

class SupabaseGameRepository implements GameRepository {
  SupabaseGameRepository(this._client);

  final SupabaseClient _client;

  Future<T> _ask<T>(Future<T> Function() call) => reachServer(() async {
    try {
      return await call();
    } on PostgrestException catch (error) {
      throw GameException.fromCode(error.code) ?? error;
    }
  });

  @override
  Future<GameLobby> lobby(String? groupId) => _ask(() async => GameLobby.fromJson(_map(await _client.rpc('game_lobby', params: {'p_group_id': groupId}))));

  @override
  Future<JoinResult> joinQueue(String? groupId) => _ask(() async {
    final answer = _map(await _client.rpc('join_queue', params: {'p_group_id': groupId}));
    return JoinResult(matchId: answer['match_id'] as String?, queuedAt: _maybeTime(answer['queued_at']), serverNow: _maybeTime(answer['server_now']));
  });

  @override
  Future<void> leaveQueue() => _ask(() async {
    await _client.rpc('leave_queue');
  });

  @override
  Future<String> startPractice() => _ask(() async => '${_map(await _client.rpc('start_practice'))['match_id']}');

  @override
  Future<List<Classmate>> classmates(String groupId) => _ask(() async {
    final rows = await _client.rpc('game_classmates', params: {'p_group_id': groupId}) as List;
    return [for (final row in rows) Classmate(profileId: '${row['profile_id']}', name: '${row['display_name']}')];
  });

  @override
  Future<String> sendInvite(String toProfile, String groupId) =>
      _ask(() async => '${await _client.rpc('send_invite', params: {'p_to_profile': toProfile, 'p_group_id': groupId})}');

  @override
  Future<InviteState?> inviteState(String inviteId) => _ask(() async {
    // Row level security shows a player the invites to and from them.
    final row = await _client.from('match_invites').select('status, match_id, expires_at').eq('id', inviteId).maybeSingle();
    if (row == null) return null;
    return InviteState(
      status: InviteStatus.values.firstWhere((status) => status.name == row['status'], orElse: () => InviteStatus.expired),
      matchId: row['match_id'] as String?,
      expiresAt: _maybeTime(row['expires_at']),
    );
  });

  @override
  Future<String?> answerInvite(String inviteId, {required bool accept}) =>
      _ask(() async => _map(await _client.rpc('answer_invite', params: {'p_invite_id': inviteId, 'p_accept': accept}))['match_id'] as String?);

  @override
  Future<MatchState> matchState(String matchId) =>
      _ask(() async => MatchState.fromJson(_map(await _client.rpc('match_state', params: {'p_match_id': matchId}))));

  @override
  Future<MatchState> heartbeat(String matchId) => _ask(() async => MatchState.fromJson(_map(await _client.rpc('heartbeat', params: {'p_match_id': matchId}))));

  @override
  Future<MatchState> advance(String matchId) =>
      _ask(() async => MatchState.fromJson(_map(await _client.rpc('advance_match', params: {'p_match_id': matchId}))));

  @override
  Future<AnswerResult> submit(String matchId, int questionIndex, String optionId) => _ask(() async {
    final answer = _map(await _client.rpc('submit_answer', params: {'p_match_id': matchId, 'p_question_index': questionIndex, 'p_option_id': optionId}));
    return AnswerResult(
      accepted: answer['accepted'] == true,
      isCorrect: answer['is_correct'] as bool?,
      reason: answer['reason'] as String?,
      state: MatchState.fromJson(_map(answer['state'])),
    );
  });

  /// A stream that listens to Realtime while someone listens to it.
  Stream<void> _live(String name, RealtimeChannel Function(RealtimeChannel channel, void Function() changed) subscribe) {
    late final StreamController<void> controller;
    RealtimeChannel? channel;
    controller = StreamController<void>.broadcast(
      onListen: () => channel = subscribe(_client.channel(name), () => controller.add(null)).subscribe(),
      onCancel: () {
        final open = channel;
        channel = null;
        if (open != null) _client.removeChannel(open);
      },
    );
    return controller.stream;
  }

  @override
  Stream<void> matchChanges(String matchId) => _live(
    'match:$matchId',
    (channel, changed) => channel.onPostgresChanges(
      event: PostgresChangeEvent.update,
      schema: 'public',
      table: 'matches',
      filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'id', value: matchId),
      callback: (_) => changed(),
    ),
  );

  @override
  Stream<void> lobbyChanges() {
    final id = _client.auth.currentUser?.id;
    if (id == null) return const Stream.empty();
    // Realtime sends only rows the player may read: their own matches and invites.
    return _live(
      'game:$id',
      (channel, changed) => channel
          .onPostgresChanges(event: PostgresChangeEvent.insert, schema: 'public', table: 'matches', callback: (_) => changed())
          .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'match_invites', callback: (_) => changed()),
    );
  }
}
