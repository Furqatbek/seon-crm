import 'package:flutter/foundation.dart';
import 'package:student/core/exam_state.dart';
import 'package:student/data/exams.dart';
import 'package:student/data/home.dart';

// The mock exam server in memory, with the rules of
// supabase/migrations/20261212100000_mock_exams.sql: listening first, a
// deadline for each section on the server's clock, any call after a deadline
// closing that section, a play count for each recording, the right answers
// only once the attempt is over, and coins for the first completed attempt
// only: to a student's balance, locked for an App user.

class FakeExamPassage {
  const FakeExamPassage(this.id, {required this.audio, this.text, this.imagePath});

  final String id;
  final bool audio;
  final String? text;
  final String? imagePath;
}

class FakeExamQuestion {
  const FakeExamQuestion(this.id, this.section, this.prompt, this.options, this.correct, {this.passageId, this.explanation, this.pictures = false});

  final String id;
  final ExamSectionKind section;
  final String prompt;
  final List<String> options;

  /// 'a'…'d'
  final String correct;
  final String? passageId;
  final String? explanation;

  /// The choices are pictures.
  final bool pictures;

  List<ExamOption> get choices => [
    for (final (index, option) in options.indexed)
      pictures ? ExamOption(id: 'abcd'[index], imagePath: 'exam/$id-$index.png') : ExamOption(id: 'abcd'[index], text: option),
  ];
}

class FakeExam {
  FakeExam({
    required this.id,
    required this.title,
    required this.passages,
    required this.questions,
    this.level = ExamLevel.topik1,
    this.audioMaxPlays = 2,
    this.coinsPerCorrect = 1,
    this.listeningTime = const Duration(minutes: 40),
    this.readingTime = const Duration(minutes: 60),
    this.thresholds = const {},
    this.published = true,
  });

  final String id;
  final String title;
  final ExamLevel level;
  int audioMaxPlays;
  int coinsPerCorrect;
  final Duration listeningTime;
  final Duration readingTime;

  /// Level → the fewest right answers for it.
  final Map<int, int> thresholds;
  final List<FakeExamPassage> passages;
  final List<FakeExamQuestion> questions;
  bool published;

  List<FakeExamQuestion> of(ExamSectionKind kind) => questions.where((question) => question.section == kind).toList();

  List<ExamSection> get sections => [
    ExamSection(kind: ExamSectionKind.listening, questionCount: of(ExamSectionKind.listening).length, timeLimit: listeningTime),
    ExamSection(kind: ExamSectionKind.reading, questionCount: of(ExamSectionKind.reading).length, timeLimit: readingTime),
  ];
}

const _readingText = '저는 주말에 친구와 같이 한강 공원에 갔습니다. 날씨가 좋아서 자전거를 탔습니다. 저녁에는 치킨을 먹었습니다.';

/// An exam like the designs': every listening question has its own recording
/// (the first two share one), the twelfth has picture choices, and the reading
/// questions come two to a text. The right answer is always the third choice
/// of a reading question and the second of a listening one.
FakeExam sampleExam({
  String id = 'exam-3',
  String title = 'TOPIK I — Mock 3',
  ExamLevel level = ExamLevel.topik1,
  int listening = 30,
  int reading = 40,
  Duration listeningTime = const Duration(minutes: 40),
  Duration readingTime = const Duration(minutes: 60),
  int audioMaxPlays = 2,
  int coinsPerCorrect = 1,
  Map<int, int> thresholds = const {1: 28, 2: 49},
}) {
  final passages = <FakeExamPassage>[];
  final questions = <FakeExamQuestion>[];
  for (var i = 1; i <= listening; i++) {
    final passage = '$id-a${i == 2 ? 1 : i}';
    if (i != 2) passages.add(FakePassageAudio(passage, i));
    questions.add(
      FakeExamQuestion(
        '$id-l$i',
        ExamSectionKind.listening,
        i == 12 ? '다음을 듣고 알맞은 그림을 고르십시오.' : '다음을 듣고 물음에 맞는 대답을 고르십시오.',
        const ['네, 학생입니다.', '아니요, 책이 없습니다.', '네, 학교에 갑니다.', '아니요, 친구가 옵니다.'],
        'b',
        passageId: passage,
        explanation: i == 1 ? '질문은 책에 대한 것입니다.' : null,
        pictures: i == 12,
      ),
    );
  }
  for (var i = 1; i <= reading; i++) {
    final passage = '$id-t${(i + 1) ~/ 2}';
    if (i.isOdd) passages.add(FakeExamPassage(passage, audio: false, text: _readingText));
    questions.add(
      FakeExamQuestion(
        '$id-r$i',
        ExamSectionKind.reading,
        '이 글의 내용과 같은 것을 고르십시오.',
        const ['저는 혼자 공원에 갔습니다.', '날씨가 안 좋았습니다.', '친구와 자전거를 탔습니다.', '아침에 치킨을 먹었습니다.'],
        'c',
        passageId: passage,
        explanation: i == 1 ? '“친구와 같이 … 자전거를 탔습니다”라고 했습니다.' : null,
      ),
    );
  }
  return FakeExam(
    id: id,
    title: title,
    level: level,
    passages: passages,
    questions: questions,
    listeningTime: listeningTime,
    readingTime: readingTime,
    audioMaxPlays: audioMaxPlays,
    coinsPerCorrect: coinsPerCorrect,
    thresholds: thresholds,
  );
}

/// A recording, with what it says for the review.
class FakePassageAudio extends FakeExamPassage {
  FakePassageAudio(super.id, int number) : super(audio: true, text: number == 1 ? '여자: 책이 있습니까? 남자: 아니요, 책이 없습니다.' : null);
}

class FakeAttempt {
  FakeAttempt(this.id, this.exam, this.profileId, this.startedAt, this.firstAttempt)
    : current = ExamSectionKind.listening,
      listeningDeadline = startedAt.add(exam.listeningTime),
      readingDeadline = startedAt.add(exam.listeningTime + exam.readingTime);

  final String id;
  final FakeExam exam;
  final String profileId;
  final DateTime startedAt;
  final bool firstAttempt;
  ExamSectionKind? current;
  DateTime listeningDeadline;
  DateTime readingDeadline;
  final answers = <String, String?>{};
  final flags = <String, bool>{};

  /// Passage → how many times its recording was started.
  final plays = <String, int>{};
  bool expired = false;
  DateTime? submittedAt;
  int correctListening = 0;
  int correctReading = 0;
  int coins = 0;
  bool coinsLocked = false;

  bool get inProgress => current != null;
}

class FakeExamServer {
  FakeExamServer({required this.now});

  DateTime Function() now;
  final exams = <FakeExam>[];
  final attempts = <String, FakeAttempt>{};

  /// Profiles that are linked students: their coins go to their balance.
  final students = <String>{};

  /// Exam coins given, by profile: to the balance, and locked.
  final earned = <String, int>{};
  final locked = <String, int>{};
  int _next = 0;

  FakeExam _exam(String id) => exams.firstWhere((exam) => exam.id == id, orElse: () => throw const ExamException(ExamFailure.notOpen));

  FakeAttempt _mine(String profileId, String attemptId) {
    final attempt = attempts[attemptId];
    if (attempt == null || attempt.profileId != profileId) throw const ExamException(ExamFailure.notAllowed);
    _sync(attempt);
    return attempt;
  }

  /// Closes what has run out.
  void _sync(FakeAttempt attempt) {
    if (!attempt.inProgress) return;
    if (attempt.current == ExamSectionKind.listening && !now().isBefore(attempt.listeningDeadline)) attempt.current = ExamSectionKind.reading;
    if (attempt.current == ExamSectionKind.reading && !now().isBefore(attempt.readingDeadline)) _finish(attempt, expired: true);
  }

  void _finish(FakeAttempt attempt, {bool expired = false}) {
    if (!attempt.inProgress) return;
    int right(ExamSectionKind kind) => attempt.exam.of(kind).where((question) => attempt.answers[question.id] == question.correct).length;
    attempt
      ..correctListening = right(ExamSectionKind.listening)
      ..correctReading = right(ExamSectionKind.reading);
    final paid =
        attempt.firstAttempt &&
        !attempts.values.any((other) => other != attempt && other.exam == attempt.exam && other.profileId == attempt.profileId && !other.inProgress);
    final coins = paid ? attempt.exam.coinsPerCorrect * (attempt.correctListening + attempt.correctReading) : 0;
    if (coins > 0) {
      final toBalance = students.contains(attempt.profileId);
      (toBalance ? earned : locked).update(attempt.profileId, (sum) => sum + coins, ifAbsent: () => coins);
      attempt.coinsLocked = !toBalance;
    }
    attempt
      ..coins = coins
      ..current = null
      ..expired = expired
      ..submittedAt = now();
  }

  /// A finished attempt from before, for lists that show past results.
  FakeAttempt addFinished(String profileId, String examId, {required int correctListening, required int correctReading}) {
    final exam = _exam(examId);
    final attempt = FakeAttempt('attempt-${++_next}', exam, profileId, now().subtract(const Duration(days: 2)), true)
      ..current = null
      ..correctListening = correctListening
      ..correctReading = correctReading
      ..submittedAt = now().subtract(const Duration(days: 2));
    for (final (index, question) in exam.of(ExamSectionKind.listening).indexed) {
      attempt.answers[question.id] = index < correctListening ? question.correct : 'a';
    }
    for (final (index, question) in exam.of(ExamSectionKind.reading).indexed) {
      attempt.answers[question.id] = index < correctReading ? question.correct : 'a';
    }
    attempts[attempt.id] = attempt;
    return attempt;
  }

  List<ExamSummary> list(String profileId) {
    return [
      for (final exam in exams.where((exam) => exam.published))
        () {
          final mine = attempts.values.where((attempt) => attempt.exam == exam && attempt.profileId == profileId).toList();
          for (final attempt in mine) {
            _sync(attempt);
          }
          final done = mine.where((attempt) => !attempt.inProgress).toList()..sort((a, b) => b.submittedAt!.compareTo(a.submittedAt!));
          return ExamSummary(
            id: exam.id,
            title: exam.title,
            level: exam.level,
            audioMaxPlays: exam.audioMaxPlays,
            coinsPerCorrect: exam.coinsPerCorrect,
            sections: exam.sections,
            attempts: done.length,
            openAttemptId: mine.where((attempt) => attempt.inProgress).firstOrNull?.id,
            last: done.isEmpty ? null : ExamLastResult(attemptId: done.first.id, correct: done.first.correctListening + done.first.correctReading),
          );
        }(),
    ];
  }

  String start(String profileId, String examId) {
    final exam = _exam(examId);
    final open = attempts.values.where((attempt) => attempt.exam == exam && attempt.profileId == profileId && attempt.inProgress).firstOrNull;
    if (open != null) {
      _sync(open);
      if (open.inProgress) return open.id;
    }
    if (!exam.published) throw const ExamException(ExamFailure.notOpen);
    final first = !attempts.values.any((attempt) => attempt.exam == exam && attempt.profileId == profileId && !attempt.inProgress);
    final attempt = FakeAttempt('attempt-${++_next}', exam, profileId, now(), first);
    attempts[attempt.id] = attempt;
    return attempt.id;
  }

  ExamState state(String profileId, String attemptId) {
    final attempt = _mine(profileId, attemptId);
    final exam = attempt.exam;
    final current = attempt.current;
    final open = current == null ? const <FakeExamQuestion>[] : exam.of(current);
    ExamPassage passage(FakeExamPassage passage, {required bool review}) => ExamPassage(
      id: passage.id,
      audio: passage.audio,
      // What a recording says is for the review.
      text: passage.audio && !review ? null : passage.text,
      imagePath: passage.imagePath,
      audioPath: passage.audio ? 'exam/${passage.id}.mp3' : null,
      playsLeft: passage.audio && !review ? (exam.audioMaxPlays - (attempt.plays[passage.id] ?? 0)).clamp(0, exam.audioMaxPlays) : null,
    );
    final total = attempt.correctListening + attempt.correctReading;
    final levels = exam.thresholds.entries.where((entry) => entry.value <= total).map((entry) => entry.key);
    return ExamState(
      attemptId: attempt.id,
      inProgress: attempt.inProgress,
      serverNow: now(),
      examId: exam.id,
      title: exam.title,
      level: exam.level,
      audioMaxPlays: exam.audioMaxPlays,
      sections: exam.sections,
      currentSection: current,
      deadline: current == null ? null : (current == ExamSectionKind.listening ? attempt.listeningDeadline : attempt.readingDeadline),
      passages: [
        for (final item in exam.passages)
          if (open.any((question) => question.passageId == item.id)) passage(item, review: false),
      ],
      questions: [
        for (final (index, question) in open.indexed)
          ExamQuestion(
            id: question.id,
            number: index + 1,
            prompt: question.prompt,
            options: question.choices,
            passageId: question.passageId,
            yourOption: attempt.answers[question.id],
            flagged: attempt.flags[question.id] ?? false,
          ),
      ],
      result: attempt.inProgress
          ? null
          : ExamResult(
              correctListening: attempt.correctListening,
              correctReading: attempt.correctReading,
              correct: total,
              questions: exam.questions.length,
              coins: attempt.coins,
              coinsLocked: attempt.coinsLocked,
              firstAttempt: attempt.firstAttempt,
              estimatedLevel: levels.isEmpty ? null : levels.reduce((a, b) => a > b ? a : b),
              review: [
                for (final kind in ExamSectionKind.values)
                  for (final (index, question) in exam.of(kind).indexed)
                    ExamReviewItem(
                      id: question.id,
                      section: kind,
                      number: index + 1,
                      prompt: question.prompt,
                      options: question.choices,
                      correctOptionId: question.correct,
                      passageId: question.passageId,
                      explanation: question.explanation,
                      yourOption: attempt.answers[question.id],
                    ),
              ],
              passages: [for (final item in exam.passages) passage(item, review: true)],
            ),
    );
  }

  FakeExamQuestion? _openQuestion(FakeAttempt attempt, String questionId) =>
      attempt.current == null ? null : attempt.exam.of(attempt.current!).where((question) => question.id == questionId).firstOrNull;

  ExamAnswerResult answer(String profileId, String attemptId, String questionId, String? optionId, bool flagged) {
    final attempt = _mine(profileId, attemptId);
    final question = _openQuestion(attempt, questionId);
    final saved = question != null && (optionId == null || question.choices.any((choice) => choice.id == optionId));
    if (saved) {
      attempt.answers[questionId] = optionId;
      attempt.flags[questionId] = flagged;
    }
    return ExamAnswerResult(saved: saved, inProgress: attempt.inProgress, currentSection: attempt.current);
  }

  AudioPlayResult recordPlay(String profileId, String attemptId, String questionId) {
    final attempt = _mine(profileId, attemptId);
    final passageId = _openQuestion(attempt, questionId)?.passageId;
    if (passageId == null || !attempt.exam.passages.any((passage) => passage.id == passageId && passage.audio)) {
      return const AudioPlayResult(allowed: false, playsLeft: 0);
    }
    final played = attempt.plays[passageId] ?? 0;
    if (played >= attempt.exam.audioMaxPlays) return const AudioPlayResult(allowed: false, playsLeft: 0);
    attempt.plays[passageId] = played + 1;
    return AudioPlayResult(allowed: true, playsLeft: attempt.exam.audioMaxPlays - played - 1);
  }

  ExamState submitSection(String profileId, String attemptId) {
    final attempt = _mine(profileId, attemptId);
    if (attempt.current == ExamSectionKind.listening) {
      // Reading starts now, with its full time.
      attempt
        ..current = ExamSectionKind.reading
        ..listeningDeadline = now()
        ..readingDeadline = now().add(attempt.exam.readingTime);
    } else if (attempt.inProgress) {
      _finish(attempt);
    }
    return state(profileId, attemptId);
  }
}

/// One person's connection to the fake server.
class FakeExamRepository implements ExamRepository {
  FakeExamRepository(this.server, this.profileId);

  final FakeExamServer server;
  final String profileId;

  /// Every call fails with this while it is set: the phone is offline.
  Object? failure;
  final calls = <String>[];

  Future<T> _call<T>(String name, T Function() run) async {
    calls.add(name);
    if (failure != null) throw failure!;
    return run();
  }

  void goOffline() => failure = const OfflineException();

  @override
  Future<List<ExamSummary>> exams() => _call('exams', () => server.list(profileId));

  @override
  Future<String> start(String examId) => _call('start', () => server.start(profileId, examId));

  @override
  Future<ExamState> state(String attemptId) => _call('state', () => server.state(profileId, attemptId));

  @override
  Future<ExamAnswerResult> answer(String attemptId, String questionId, String? optionId, {required bool flagged}) =>
      _call('answer', () => server.answer(profileId, attemptId, questionId, optionId, flagged));

  @override
  Future<AudioPlayResult> recordPlay(String attemptId, String questionId) => _call('recordPlay', () => server.recordPlay(profileId, attemptId, questionId));

  @override
  Future<ExamState> submitSection(String attemptId) => _call('submitSection', () => server.submitSection(profileId, attemptId));

  /// Recordings have a link; pictures have none here, so screens show their plain mark.
  @override
  Future<String?> mediaUrl(String path) async => failure == null && path.endsWith('.mp3') ? 'https://media.test/$path' : null;
}

/// A player that plays nothing and remembers what it was asked.
class FakeExamAudio implements ExamAudio {
  final _status = ValueNotifier(const AudioStatus());

  /// The links that were started, in order.
  final played = <String>[];
  int stops = 0;

  @override
  ValueListenable<AudioStatus> get status => _status;

  @override
  Future<void> play(String passageId, String url) async {
    played.add(url);
    _status.value = AudioStatus(passageId: passageId, playing: true);
  }

  /// The recording is this far.
  void at(double fraction) => _status.value = AudioStatus(passageId: _status.value.passageId, playing: true, fraction: fraction);

  /// The recording reached its end.
  void end() => _status.value = AudioStatus(passageId: _status.value.passageId, fraction: 1);

  @override
  Future<void> stop() async {
    if (_status.value.playing) stops++;
    _status.value = AudioStatus(passageId: _status.value.passageId);
  }

  /// Kept for the next attempt screen of the same test.
  @override
  void dispose() {}
}
