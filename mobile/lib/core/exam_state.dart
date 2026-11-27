import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import '../data/exams.dart';
import '../data/models.dart';
import 'game_state.dart' show ServerClock;
import 'state.dart';

/// Set in main.
final examRepositoryProvider = Provider<ExamRepository>((ref) => throw UnimplementedError('examRepositoryProvider'));

/// Makes the player of an attempt's recordings. Tests give one that only records what was asked.
final examAudioProvider = Provider<ExamAudio Function()>((ref) => JustAudioExamAudio.new);

/// The published exams with the person's own results.
final examListProvider = FutureProvider.autoDispose<List<ExamSummary>>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(examRepositoryProvider).exams();
}, retry: (_, _) => null);

/// A link to one of an exam's pictures; null when it cannot be had.
final examMediaUrlProvider = FutureProvider.autoDispose.family<String?, String>(
  (ref, path) => ref.watch(examRepositoryProvider).mediaUrl(path),
  retry: (_, _) => null,
);

/// The exams of a person's level: Beginners practise with the TOPIK I exams.
ExamLevel examLevelOf(KoreanLevel? level) => level == KoreanLevel.topik2 ? ExamLevel.topik2 : ExamLevel.topik1;

/// The exam to suggest: one in progress first, then the first never finished, of the level.
ExamSummary? nextUnfinishedExam(List<ExamSummary> exams, ExamLevel level) {
  final mine = exams.where((exam) => exam.level == level);
  return mine.where((exam) => exam.openAttemptId != null).firstOrNull ?? mine.where((exam) => exam.attempts == 0).firstOrNull;
}

/// What a recording is doing.
class AudioStatus {
  const AudioStatus({this.passageId, this.playing = false, this.fraction = 0});

  /// The passage whose recording was started last.
  final String? passageId;
  final bool playing;

  /// How far it has played, from 0 to 1.
  final double fraction;
}

/// Plays a recording from its start to its end. There is no seeking and no
/// pausing: a play that was started is a play that was used.
abstract class ExamAudio {
  ValueListenable<AudioStatus> get status;

  Future<void> play(String passageId, String url);

  Future<void> stop();

  void dispose();
}

class JustAudioExamAudio implements ExamAudio {
  JustAudioExamAudio() {
    _subscriptions = [
      _player.positionStream.listen((position) {
        final length = _player.duration;
        if (length == null || length == Duration.zero || !_status.value.playing) return;
        _status.value = AudioStatus(
          passageId: _status.value.passageId,
          playing: true,
          fraction: (position.inMilliseconds / length.inMilliseconds).clamp(0.0, 1.0),
        );
      }),
      _player.playerStateStream.listen((state) {
        if (state.processingState == ProcessingState.completed) _status.value = AudioStatus(passageId: _status.value.passageId, fraction: 1);
      }),
    ];
  }

  final _player = AudioPlayer();
  final _status = ValueNotifier(const AudioStatus());
  late final List<StreamSubscription<Object?>> _subscriptions;

  @override
  ValueListenable<AudioStatus> get status => _status;

  @override
  Future<void> play(String passageId, String url) async {
    _status.value = AudioStatus(passageId: passageId, playing: true);
    try {
      await _player.setUrl(url);
      unawaited(_player.play());
    } catch (_) {
      _status.value = AudioStatus(passageId: passageId);
      rethrow;
    }
  }

  @override
  Future<void> stop() async {
    _status.value = AudioStatus(passageId: _status.value.passageId);
    await _player.stop();
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    unawaited(_player.dispose());
    _status.dispose();
  }
}

/// One attempt as the screen follows it: the last state the server gave, the
/// server's clock, the question on screen, and what to ask for when the
/// section's time runs out. The deadline is the server's: when the phone's
/// countdown reaches it the server is asked, and its answer (the next section,
/// or the result) is what is shown. Reopening the app asks again.
class ExamSession extends ChangeNotifier {
  ExamSession({required this.attemptId, required this.repository, required DateTime Function() now, required this.audio})
    : _local = now,
      clock = ServerClock(now);

  final String attemptId;
  final ExamRepository repository;
  final ExamAudio audio;
  final DateTime Function() _local;
  final ServerClock clock;

  ExamState? _state;
  int _index = 0;
  bool _reconnecting = false;
  bool _notFound = false;
  bool _submitting = false;
  bool _audioFailed = false;
  bool _disposed = false;
  Timer? _deadline;
  final _answers = <String, String?>{};
  final _flags = <String, bool>{};
  final _playsLeft = <String, int>{};

  /// Taps on their way to the server: its older word does not undo them.
  final _sending = <String>{};

  ExamState? get state => _state;

  /// The server cannot be reached.
  bool get reconnecting => _reconnecting;

  /// This is not the person's attempt, or it is gone.
  bool get notFound => _notFound;

  bool get submitting => _submitting;

  /// The recording could not be played.
  bool get audioFailed => _audioFailed;

  /// The place of the question on screen in the open section, from 0.
  int get index => _index;

  List<ExamQuestion> get questions => _state?.questions ?? const [];

  ExamQuestion? get question => _index < questions.length ? questions[_index] : null;

  ExamPassage? passageOf(ExamQuestion question) => _state?.passages.where((passage) => passage.id == question.passageId).firstOrNull;

  String? answerTo(String questionId) => _answers[questionId];

  bool flagged(String questionId) => _flags[questionId] ?? false;

  int get answered => questions.where((question) => _answers[question.id] != null).length;

  /// How many times a recording can still be started, as the server last said.
  int playsLeft(ExamPassage passage) => _playsLeft[passage.id] ?? passage.playsLeft ?? 0;

  /// The open section's time left, by the server's clock.
  Duration get timeLeft => _state?.deadline == null ? Duration.zero : clock.until(_state!.deadline!);

  void start() => unawaited(refresh());

  /// Asks the server where the attempt is: at the start, when the app comes
  /// back to the front, and when the section's time has run out.
  Future<void> refresh() => _ask(() => repository.state(attemptId));

  Future<void> _ask(Future<ExamState> Function() call) async {
    final sentAt = _local();
    try {
      final next = await call();
      if (_disposed) return;
      _reconnecting = false;
      _take(next, sentAt: sentAt);
    } on ExamException {
      if (_disposed) return;
      _notFound = true;
      _deadline?.cancel();
      notifyListeners();
    } catch (_) {
      if (_disposed) return;
      _reconnecting = true;
      // The deadline still stands: asked again soon.
      _deadline?.cancel();
      _deadline = Timer(const Duration(seconds: 3), () => unawaited(refresh()));
      notifyListeners();
    }
  }

  void _take(ExamState next, {DateTime? sentAt}) {
    clock.sync(next.serverNow, sentAt: sentAt);
    final moved = _state == null || _state!.currentSection != next.currentSection;
    _state = next;
    for (final question in next.questions) {
      if (_sending.contains(question.id)) continue;
      _answers[question.id] = question.yourOption;
      _flags[question.id] = question.flagged;
    }
    for (final passage in next.passages) {
      if (passage.playsLeft != null) _playsLeft[passage.id] = passage.playsLeft!;
    }
    if (moved) {
      unawaited(audio.stop());
      _audioFailed = false;
      // Back in an attempt: at the first question still without an answer.
      final open = next.questions.indexWhere((question) => question.yourOption == null);
      _index = open < 0 ? 0 : open;
    }
    _deadline?.cancel();
    if (next.inProgress && next.deadline != null) {
      // A little after, so the server's clock has certainly passed it.
      _deadline = Timer(clock.until(next.deadline!) + const Duration(milliseconds: 300), () => unawaited(refresh()));
    }
    notifyListeners();
  }

  /// Shows another question of the open section. A recording that belongs to
  /// a different passage stops: its play was used.
  void goTo(int index) {
    if (index < 0 || index >= questions.length || index == _index) return;
    final playing = audio.status.value;
    if (playing.playing && playing.passageId != questions[index].passageId) unawaited(audio.stop());
    _index = index;
    _audioFailed = false;
    notifyListeners();
  }

  /// The player taps a choice (again to keep it; another to change it).
  Future<void> choose(String questionId, String optionId) => _save(questionId, optionId, flagged(questionId));

  /// Marks a question to come back to, or clears the mark.
  Future<void> toggleFlag(String questionId) => _save(questionId, _answers[questionId], !flagged(questionId));

  Future<void> _save(String questionId, String? optionId, bool flag) async {
    if (_state?.inProgress != true || _sending.contains(questionId)) return;
    final before = (_answers[questionId], flagged(questionId));
    _answers[questionId] = optionId;
    _flags[questionId] = flag;
    _sending.add(questionId);
    notifyListeners();
    try {
      final result = await repository.answer(attemptId, questionId, optionId, flagged: flag);
      if (_disposed) return;
      _sending.remove(questionId);
      _reconnecting = false;
      if (!result.saved) {
        // The section closed meanwhile: the server says where the attempt is now.
        _answers[questionId] = before.$1;
        _flags[questionId] = before.$2;
        await refresh();
      } else {
        notifyListeners();
      }
    } catch (_) {
      if (_disposed) return;
      // Not saved: the screen shows what the server has.
      _sending.remove(questionId);
      _answers[questionId] = before.$1;
      _flags[questionId] = before.$2;
      _reconnecting = true;
      notifyListeners();
    }
  }

  /// Starts the recording of the question on screen. The server counts the
  /// play and says whether it may start.
  Future<void> play() async {
    final current = question;
    final passage = current == null ? null : passageOf(current);
    if (current == null || passage == null || !passage.audio || passage.audioPath == null) return;
    if (audio.status.value.playing || playsLeft(passage) <= 0) return;
    _audioFailed = false;
    try {
      // The link first: a play is not spent on a recording that cannot be reached.
      final url = await repository.mediaUrl(passage.audioPath!);
      if (_disposed) return;
      if (url == null) {
        _audioFailed = true;
        return notifyListeners();
      }
      final result = await repository.recordPlay(attemptId, current.id);
      if (_disposed) return;
      _reconnecting = false;
      _playsLeft[passage.id] = result.playsLeft;
      notifyListeners();
      if (!result.allowed) return;
      await audio.play(passage.id, url);
    } catch (_) {
      if (_disposed) return;
      _audioFailed = true;
      notifyListeners();
    }
  }

  /// Hands in the open section: reading starts, or the attempt is finished.
  Future<void> submitSection() async {
    if (_submitting || _state?.inProgress != true) return;
    _submitting = true;
    notifyListeners();
    await _ask(() => repository.submitSection(attemptId));
    if (_disposed) return;
    _submitting = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _deadline?.cancel();
    audio.dispose();
    super.dispose();
  }
}
