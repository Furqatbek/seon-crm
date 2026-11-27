import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// Mock exams — docs/STUDENT_APP_SPEC.md → "Rules → Mock exams". The server
// keeps the clock, counts the audio plays, marks the answers and gives the
// coins. The right answers are not in anything the app receives until the
// attempt is over. The app shows the state it is told and sends taps.

DateTime _time(Object? value) => DateTime.parse(value! as String).toUtc();
DateTime? _maybeTime(Object? value) => value is String ? DateTime.parse(value).toUtc() : null;
Map<String, dynamic> _map(Object? value) => Map<String, dynamic>.from(value! as Map);
List<Map<String, dynamic>> _list(Object? value) => [for (final item in (value as List? ?? const [])) _map(item)];
int _int(Object? value) => (value as num?)?.toInt() ?? 0;

enum ExamLevel {
  topik1,
  topik2;

  static ExamLevel parse(Object? value) => value == 'topik2' ? topik2 : topik1;
}

enum ExamSectionKind {
  listening,
  reading;

  static ExamSectionKind? parse(Object? value) => switch (value) {
    'listening' => listening,
    'reading' => reading,
    _ => null,
  };
}

class ExamSection {
  const ExamSection({required this.kind, required this.questionCount, required this.timeLimit});

  final ExamSectionKind kind;
  final int questionCount;
  final Duration timeLimit;

  factory ExamSection.fromJson(Map<String, dynamic> json) => ExamSection(
    kind: ExamSectionKind.parse(json['kind']) ?? ExamSectionKind.listening,
    questionCount: _int(json['question_count']),
    timeLimit: Duration(seconds: _int(json['time_limit_sec'])),
  );
}

/// The caller's last finished attempt of an exam.
class ExamLastResult {
  const ExamLastResult({required this.attemptId, required this.correct});

  final String attemptId;
  final int correct;
}

/// An exam in the list, with what the caller has done with it.
class ExamSummary {
  const ExamSummary({
    required this.id,
    required this.title,
    required this.level,
    required this.audioMaxPlays,
    required this.coinsPerCorrect,
    required this.sections,
    required this.attempts,
    this.openAttemptId,
    this.last,
  });

  final String id;
  final String title;
  final ExamLevel level;
  final int audioMaxPlays;

  /// 0 when exams give no coins.
  final int coinsPerCorrect;
  final List<ExamSection> sections;

  /// Finished attempts.
  final int attempts;

  /// The attempt in progress, if there is one.
  final String? openAttemptId;
  final ExamLastResult? last;

  int get questions => sections.fold(0, (sum, section) => sum + section.questionCount);
  Duration get time => sections.fold(Duration.zero, (sum, section) => sum + section.timeLimit);
  ExamSection? section(ExamSectionKind kind) => sections.where((section) => section.kind == kind).firstOrNull;

  /// Only the first completed attempt is paid.
  bool get pays => attempts == 0 && coinsPerCorrect > 0;

  factory ExamSummary.fromJson(Map<String, dynamic> json) {
    final last = json['last'] is Map ? _map(json['last']) : null;
    return ExamSummary(
      id: '${json['id']}',
      title: '${json['title']}',
      level: ExamLevel.parse(json['level']),
      audioMaxPlays: _int(json['audio_max_plays']),
      coinsPerCorrect: _int(json['coins_per_correct']),
      sections: [for (final section in _list(json['sections'])) ExamSection.fromJson(section)],
      attempts: _int(json['attempts']),
      openAttemptId: json['open_attempt_id'] as String?,
      last: last == null ? null : ExamLastResult(attemptId: '${last['attempt_id']}', correct: _int(last['correct'])),
    );
  }
}

class ExamOption {
  const ExamOption({required this.id, this.text, this.imagePath});

  final String id;
  final String? text;
  final String? imagePath;

  factory ExamOption.fromJson(Map<String, dynamic> json) =>
      ExamOption(id: '${json['id']}', text: json['text'] as String?, imagePath: json['image_path'] as String?);
}

class ExamPassage {
  const ExamPassage({required this.id, required this.audio, this.text, this.imagePath, this.audioPath, this.playsLeft});

  final String id;
  final bool audio;

  /// A reading text; for a recording, what it says, and only in the review.
  final String? text;
  final String? imagePath;
  final String? audioPath;

  /// How many times the recording can still be started; null in the review.
  final int? playsLeft;

  ExamPassage withPlaysLeft(int left) => ExamPassage(id: id, audio: audio, text: text, imagePath: imagePath, audioPath: audioPath, playsLeft: left);

  factory ExamPassage.fromJson(Map<String, dynamic> json) => ExamPassage(
    id: '${json['id']}',
    audio: json['kind'] == 'audio',
    text: json['text'] as String?,
    imagePath: json['image_path'] as String?,
    audioPath: json['audio_path'] as String?,
    playsLeft: (json['plays_left'] as num?)?.toInt(),
  );
}

/// A question of the section that is open. Nothing here says which choice is right.
class ExamQuestion {
  const ExamQuestion({
    required this.id,
    required this.number,
    required this.prompt,
    required this.options,
    this.passageId,
    this.yourOption,
    this.flagged = false,
  });

  final String id;

  /// Its number in the section, from 1.
  final int number;
  final String prompt;
  final List<ExamOption> options;
  final String? passageId;
  final String? yourOption;
  final bool flagged;

  factory ExamQuestion.fromJson(Map<String, dynamic> json) => ExamQuestion(
    id: '${json['id']}',
    number: _int(json['position']),
    prompt: '${json['prompt']}',
    options: [for (final option in _list(json['options'])) ExamOption.fromJson(option)],
    passageId: json['passage_id'] as String?,
    yourOption: json['your_option'] as String?,
    flagged: json['flagged'] == true,
  );
}

/// A question in the review of a finished attempt.
class ExamReviewItem {
  const ExamReviewItem({
    required this.id,
    required this.section,
    required this.number,
    required this.prompt,
    required this.options,
    required this.correctOptionId,
    this.passageId,
    this.explanation,
    this.yourOption,
  });

  final String id;
  final ExamSectionKind section;
  final int number;
  final String prompt;
  final List<ExamOption> options;
  final String correctOptionId;
  final String? passageId;
  final String? explanation;
  final String? yourOption;

  bool get correct => yourOption == correctOptionId;

  factory ExamReviewItem.fromJson(Map<String, dynamic> json) => ExamReviewItem(
    id: '${json['id']}',
    section: ExamSectionKind.parse(json['section']) ?? ExamSectionKind.listening,
    number: _int(json['position']),
    prompt: '${json['prompt']}',
    options: [for (final option in _list(json['options'])) ExamOption.fromJson(option)],
    correctOptionId: '${json['correct_option_id']}',
    passageId: json['passage_id'] as String?,
    explanation: json['explanation'] as String?,
    yourOption: json['your_option'] as String?,
  );
}

class ExamResult {
  const ExamResult({
    required this.correctListening,
    required this.correctReading,
    required this.correct,
    required this.questions,
    required this.coins,
    required this.coinsLocked,
    required this.firstAttempt,
    required this.review,
    required this.passages,
    this.estimatedLevel,
  });

  final int correctListening;
  final int correctReading;
  final int correct;
  final int questions;
  final int coins;

  /// The coins wait until the person joins the centre.
  final bool coinsLocked;
  final bool firstAttempt;

  /// A practice estimate from the exam's own thresholds; null without any.
  final int? estimatedLevel;
  final List<ExamReviewItem> review;
  final List<ExamPassage> passages;

  factory ExamResult.fromJson(Map<String, dynamic> json) => ExamResult(
    correctListening: _int(json['correct_listening']),
    correctReading: _int(json['correct_reading']),
    correct: _int(json['correct']),
    questions: _int(json['questions']),
    coins: _int(json['coins']),
    coinsLocked: json['coins_locked'] == true,
    firstAttempt: json['first_attempt'] == true,
    estimatedLevel: (json['estimated_level'] as num?)?.toInt(),
    review: [for (final item in _list(json['review'])) ExamReviewItem.fromJson(item)],
    passages: [for (final passage in _list(json['passages'])) ExamPassage.fromJson(passage)],
  );
}

/// What the player may know about their attempt now.
class ExamState {
  const ExamState({
    required this.attemptId,
    required this.inProgress,
    required this.serverNow,
    required this.examId,
    required this.title,
    required this.level,
    required this.audioMaxPlays,
    required this.sections,
    required this.passages,
    required this.questions,
    this.currentSection,
    this.deadline,
    this.result,
  });

  final String attemptId;
  final bool inProgress;
  final DateTime serverNow;
  final String examId;
  final String title;
  final ExamLevel level;
  final int audioMaxPlays;
  final List<ExamSection> sections;

  /// The section that is open; null once the attempt is over.
  final ExamSectionKind? currentSection;

  /// When the open section closes, on the server's clock.
  final DateTime? deadline;

  /// The open section's passages and questions.
  final List<ExamPassage> passages;
  final List<ExamQuestion> questions;
  final ExamResult? result;

  ExamSection? section(ExamSectionKind kind) => sections.where((section) => section.kind == kind).firstOrNull;

  factory ExamState.fromJson(Map<String, dynamic> json) {
    final exam = _map(json['exam']);
    return ExamState(
      attemptId: '${json['attempt_id']}',
      inProgress: json['status'] == 'in_progress',
      serverNow: _time(json['server_now']),
      examId: '${exam['id']}',
      title: '${exam['title']}',
      level: ExamLevel.parse(exam['level']),
      audioMaxPlays: _int(exam['audio_max_plays']),
      sections: [for (final section in _list(json['sections'])) ExamSection.fromJson(section)],
      currentSection: ExamSectionKind.parse(json['current_section']),
      deadline: _maybeTime(json['deadline']),
      passages: [for (final passage in _list(json['passages'])) ExamPassage.fromJson(passage)],
      questions: [for (final question in _list(json['questions'])) ExamQuestion.fromJson(question)],
      result: json['result'] is Map ? ExamResult.fromJson(_map(json['result'])) : null,
    );
  }
}

/// The server's word on an answer: saved, or why not (the section or the attempt is closed).
class ExamAnswerResult {
  const ExamAnswerResult({required this.saved, required this.inProgress, this.currentSection});

  final bool saved;
  final bool inProgress;
  final ExamSectionKind? currentSection;
}

/// The server's word on starting a recording.
class AudioPlayResult {
  const AudioPlayResult({required this.allowed, required this.playsLeft});

  final bool allowed;
  final int playsLeft;
}

enum ExamFailure { notOpen, notAllowed }

class ExamException implements Exception {
  const ExamException(this.failure);

  final ExamFailure failure;

  static ExamException? fromCode(String? code) => switch (code) {
    'EX003' => const ExamException(ExamFailure.notOpen),
    '42501' => const ExamException(ExamFailure.notAllowed),
    _ => null,
  };

  @override
  String toString() => 'ExamException(${failure.name})';
}

abstract class ExamRepository {
  /// The published exams and what the caller has done with each.
  Future<List<ExamSummary>> exams();

  /// Starts an exam, or returns the attempt already in progress. The attempt's id.
  Future<String> start(String examId);

  Future<ExamState> state(String attemptId);

  /// Chooses an answer (null clears it) and sets the flag.
  Future<ExamAnswerResult> answer(String attemptId, String questionId, String? optionId, {required bool flagged});

  /// The player starts the recording of a question: counted on the server.
  Future<AudioPlayResult> recordPlay(String attemptId, String questionId);

  /// Hands in the open section; after reading the attempt is finished.
  Future<ExamState> submitSection(String attemptId);

  /// A link to an exam's recording or picture, for a while; null when there is none.
  Future<String?> mediaUrl(String path);
}

class SupabaseExamRepository implements ExamRepository {
  SupabaseExamRepository(this._client);

  final SupabaseClient _client;

  Future<T> _ask<T>(Future<T> Function() call) => reachServer(() async {
    try {
      return await call();
    } on PostgrestException catch (error) {
      throw ExamException.fromCode(error.code) ?? error;
    }
  });

  @override
  Future<List<ExamSummary>> exams() => _ask(() async => [for (final exam in _list(await _client.rpc('exam_list'))) ExamSummary.fromJson(exam)]);

  @override
  Future<String> start(String examId) => _ask(() async => '${await _client.rpc('start_exam', params: {'p_exam_id': examId})}');

  @override
  Future<ExamState> state(String attemptId) => _ask(() async => ExamState.fromJson(_map(await _client.rpc('exam_state', params: {'p_attempt_id': attemptId}))));

  @override
  Future<ExamAnswerResult> answer(String attemptId, String questionId, String? optionId, {required bool flagged}) => _ask(() async {
    final json = _map(
      await _client.rpc('answer_exam', params: {'p_attempt_id': attemptId, 'p_question_id': questionId, 'p_option_id': optionId, 'p_flagged': flagged}),
    );
    return ExamAnswerResult(
      saved: json['saved'] == true,
      inProgress: json['status'] == 'in_progress',
      currentSection: ExamSectionKind.parse(json['current_section']),
    );
  });

  @override
  Future<AudioPlayResult> recordPlay(String attemptId, String questionId) => _ask(() async {
    final json = _map(await _client.rpc('record_audio_play', params: {'p_attempt_id': attemptId, 'p_question_id': questionId}));
    return AudioPlayResult(allowed: json['allowed'] == true, playsLeft: _int(json['plays_left']));
  });

  @override
  Future<ExamState> submitSection(String attemptId) =>
      _ask(() async => ExamState.fromJson(_map(await _client.rpc('submit_section', params: {'p_attempt_id': attemptId}))));

  @override
  Future<String?> mediaUrl(String path) async {
    try {
      // The bucket is private: the server signs a link for someone with an attempt on the exam.
      return await _client.storage.from('exam-media').createSignedUrl(path, 3600);
    } catch (_) {
      return null;
    }
  }
}
