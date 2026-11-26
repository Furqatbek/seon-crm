import { describe, expect, it } from "vitest";

import { EXAM_IMPORT_COLUMNS, EXAM_PRESETS, audioExtension, checkThresholds, estimateLevel, examTemplateRows, presetSections, readExamImport } from "./exams";

// docs/STUDENT_APP_SPEC.md → "Rules → Mock exams" and "CRM changes" (Points → Mock exams).

describe("presets", () => {
  it("are the four in the spec, with their questions and minutes", () => {
    const table = EXAM_PRESETS.map((preset) => [preset.key, preset.level, preset.listening.questions, preset.listening.minutes, preset.reading.questions, preset.reading.minutes]);
    expect(table).toEqual([
      ["topik1_paper", "topik1", 30, 40, 40, 60],
      ["topik2_paper", "topik2", 50, 60, 50, 70],
      ["topik1_internet", "topik1", 26, 30, 26, 40],
      ["topik2_internet", "topik2", 30, 35, 30, 40],
    ]);
  });

  it("make a listening section first, then reading, with the time in seconds", () => {
    expect(presetSections(EXAM_PRESETS[0])).toEqual([
      { kind: "listening", position: 1, question_count: 30, time_limit_sec: 2400 },
      { kind: "reading", position: 2, question_count: 40, time_limit_sec: 3600 },
    ]);
    for (const preset of EXAM_PRESETS) {
      const [listening, reading] = presetSections(preset);
      expect([listening.kind, listening.position, reading.kind, reading.position]).toEqual(["listening", 1, "reading", 2]);
      expect(listening.time_limit_sec).toBe(preset.listening.minutes * 60);
      expect(reading.question_count).toBe(preset.reading.questions);
    }
  });
});

describe("the practice estimate", () => {
  const thresholds = [{ level: 3, min_correct: 40 }, { level: 4, min_correct: 60 }, { level: 5, min_correct: 75 }];

  it("is the highest level whose threshold is reached", () => {
    expect(estimateLevel(thresholds, 39)).toBeNull();
    expect(estimateLevel(thresholds, 40)).toBe(3);
    expect(estimateLevel(thresholds, 74)).toBe(4);
    expect(estimateLevel(thresholds, 100)).toBe(5);
  });

  it("is not given without thresholds", () => {
    expect(estimateLevel(null, 100)).toBeNull();
    expect(estimateLevel([], 100)).toBeNull();
    expect(estimateLevel(undefined, 0)).toBeNull();
  });

  it("thresholds name the exam's own levels, fit its questions and rise with the level", () => {
    expect(checkThresholds(thresholds, "topik2", 100)).toBeNull();
    expect(checkThresholds([{ level: 1, min_correct: 30 }, { level: 2, min_correct: 50 }], "topik1", 70)).toBeNull();
    expect(checkThresholds([], "topik1", 70)).toBeNull();
    // TOPIK I has no level 3; a level is named once.
    expect(checkThresholds([{ level: 3, min_correct: 30 }], "topik1", 70)).toBe("levelInvalid");
    expect(checkThresholds([{ level: 1, min_correct: 30 }, { level: 1, min_correct: 40 }], "topik1", 70)).toBe("levelInvalid");
    expect(checkThresholds([{ level: 1, min_correct: 0 }], "topik1", 70)).toBe("minInvalid");
    expect(checkThresholds([{ level: 1, min_correct: 71 }], "topik1", 70)).toBe("minInvalid");
    expect(checkThresholds([{ level: 1, min_correct: 1.5 }], "topik1", 70)).toBe("minInvalid");
    expect(checkThresholds([{ level: 2, min_correct: 30 }, { level: 1, min_correct: 30 }], "topik1", 70)).toBe("order");
    expect(checkThresholds([{ level: 1, min_correct: 50 }, { level: 2, min_correct: 40 }], "topik1", 70)).toBe("order");
  });
});

describe("audio files", () => {
  it("MP3 or M4A up to 10 MB", () => {
    expect(audioExtension({ name: "a.mp3", type: "audio/mpeg", size: 1000 })).toBe("mp3");
    expect(audioExtension({ name: "a.m4a", type: "audio/mp4", size: 1000 })).toBe("m4a");
    expect(audioExtension({ name: "a.m4a", type: "audio/x-m4a", size: 10 * 1024 * 1024 })).toBe("m4a");
    // Some browsers give no type: the name decides.
    expect(audioExtension({ name: "Track.MP3", type: "", size: 1000 })).toBe("mp3");
    expect(audioExtension({ name: "a.mp3", type: "audio/mpeg", size: 10 * 1024 * 1024 + 1 })).toBeNull();
    expect(audioExtension({ name: "a.mp3", type: "audio/mpeg", size: 0 })).toBeNull();
    expect(audioExtension({ name: "a.wav", type: "audio/wav", size: 1000 })).toBeNull();
    expect(audioExtension({ name: "a.mp3", type: "video/mp4", size: 1000 })).toBeNull();
  });
});

describe("reading an import", () => {
  const header = [...EXAM_IMPORT_COLUMNS];
  const listening = ["listening", "L1", "", "one.mp3", "What is he doing?", "Reading", "Listening", "", "", "b", "He listens."];
  const reading = ["reading", "R1", "A short text.", "", "What did they do?", "Film", "Book", "Trip", "", "a", ""];
  const withRow = (base: string[], changes: Partial<Record<(typeof EXAM_IMPORT_COLUMNS)[number], string>>) => header.map((column, index) => changes[column] ?? base[index]);
  const errorsOf = (row: string[], audio = ["one.mp3"]) => {
    const report = readExamImport([header, row], audio);
    if (!report.ok) throw new Error(report.error);
    return report.errors[0]?.errors ?? [];
  };

  it("rows that share a passage label share one passage; audio is matched by file name", () => {
    const report = readExamImport(
      [header, listening, withRow(listening, { question: "Where is he?", audio: "", correct: "a" }), reading, withRow(reading, { passage_text: "", question: "How was it?", correct: "b" }), withRow(reading, { passage: "", passage_text: "", question: "On its own" })],
      ["sub/One.MP3", "extra.mp3"],
    );
    expect(report).toMatchObject({ ok: true, rows: 5, errors: [], unusedAudio: ["extra.mp3"] });
    if (!report.ok) return;
    expect(report.passages).toEqual([
      // The name in the sheet finds the chosen file whatever its letter case or folder.
      { key: "listening:l1", section: "listening", kind: "audio", text: null, audio: "sub/One.MP3" },
      { key: "reading:r1", section: "reading", kind: "text", text: "A short text.", audio: null },
    ]);
    expect(report.questions.map((question) => [question.section, question.passage, question.prompt, question.correct_option_id, question.options.length])).toEqual([
      ["listening", "listening:l1", "What is he doing?", "b", 2],
      ["listening", "listening:l1", "Where is he?", "a", 2],
      ["reading", "reading:r1", "What did they do?", "a", 3],
      ["reading", "reading:r1", "How was it?", "b", 3],
      ["reading", null, "On its own", "a", 3],
    ]);
    expect(report.questions[0].explanation).toBe("He listens.");
    expect(report.questions[2].explanation).toBeNull();
  });

  it("a text or an audio without a label is a passage of that one question; the same label in the two sections is two passages", () => {
    const report = readExamImport([header, withRow(listening, { passage: "" }), withRow(reading, { passage: "" }), withRow(listening, { passage: "X", audio: "" }), withRow(reading, { passage: "X" })], ["one.mp3"]);
    expect(report.ok && report.passages.map((passage) => [passage.key, passage.kind])).toEqual([["listening:#1", "audio"], ["reading:#2", "text"], ["reading:x", "text"]]);
    // The listening "X" had neither text nor audio: its question stands on its own.
    expect(report.ok && report.questions.map((question) => question.passage)).toEqual(["listening:#1", "reading:#2", null, "reading:x"]);
  });

  it("says why a row is left out", () => {
    expect(errorsOf(withRow(listening, { section: "writing" }))).toEqual(["sectionInvalid"]);
    expect(errorsOf(withRow(listening, { section: "" }))).toEqual(["sectionInvalid"]);
    expect(errorsOf(withRow(listening, { question: "" }))).toEqual(["promptRequired"]);
    expect(errorsOf(withRow(listening, { question: "x".repeat(1001) }))).toEqual(["promptTooLong"]);
    expect(errorsOf(withRow(listening, { option_b: "" }))).toEqual(["optionsTooFew", "correctInvalid"]);
    expect(errorsOf(withRow(listening, { option_b: "", option_c: "C", correct: "a" }))).toEqual(["optionsGap"]);
    expect(errorsOf(withRow(listening, { option_a: "y".repeat(301) }))).toEqual(["optionTooLong"]);
    expect(errorsOf(withRow(listening, { correct: "c" }))).toEqual(["correctInvalid"]);
    expect(errorsOf(withRow(listening, { correct: "" }))).toEqual(["correctInvalid"]);
    expect(errorsOf(withRow(listening, { explanation: "z".repeat(2001) }))).toEqual(["explanationTooLong"]);
    expect(errorsOf(withRow(reading, { passage_text: "t".repeat(6001) }))).toEqual(["passageTooLong"]);
    // The audio the row names was not chosen with the sheet.
    expect(errorsOf(listening, [])).toEqual(["audioMissing"]);
    expect(errorsOf(withRow(listening, { audio: "two.mp3" }))).toEqual(["audioMissing"]);
    // Reading has no audio.
    expect(errorsOf(withRow(reading, { audio: "one.mp3" }))).toEqual(["audioInReading"]);
    expect(errorsOf(withRow(reading, { audio: "nine.mp3" }))).toEqual(["audioMissing", "audioInReading"]);

    const report = readExamImport([header, listening, [], withRow(reading, { correct: "z" }), reading], ["one.mp3"]);
    expect(report).toMatchObject({ ok: true, rows: 3, errors: [{ row: 4, errors: ["correctInvalid"] }] });
    expect(report.ok && report.questions).toHaveLength(2);
  });

  it("refuses a file without its columns, without rows, or with too many", () => {
    expect(readExamImport([], [])).toEqual({ ok: false, error: "empty" });
    expect(readExamImport([header], [])).toEqual({ ok: false, error: "empty" });
    expect(readExamImport([["section", "question"], listening], [])).toEqual({ ok: false, error: "headerInvalid", missing: ["option_a", "option_b", "correct"] });
    const many = [header, ...Array.from({ length: 401 }, (_, index) => withRow(reading, { question: `Q${index}` }))];
    expect(readExamImport(many, [])).toEqual({ ok: false, error: "tooManyRows" });
  });

  it("the template reads back without errors once its audio file is chosen", () => {
    expect(readExamImport(examTemplateRows(), ["listening-01.mp3"])).toMatchObject({ ok: true, rows: 3, errors: [], unusedAudio: [] });
    expect(readExamImport(examTemplateRows(), [])).toMatchObject({ ok: true, errors: [{ row: 2, errors: ["audioMissing"] }] });
  });
});
