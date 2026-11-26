// Mock exams — docs/STUDENT_APP_SPEC.md → "Rules → Mock exams". Pure: the
// presets an exam starts from, the practice estimate, and reading an import
// file's rows. The database has the same shape rules and does the scoring.

export const EXAM_LEVELS = ["topik1", "topik2"] as const;
export type ExamLevel = (typeof EXAM_LEVELS)[number];
export const SECTION_KINDS = ["listening", "reading"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export type ExamPreset = {
  key: "topik1_paper" | "topik2_paper" | "topik1_internet" | "topik2_internet";
  level: ExamLevel;
  listening: { questions: number; minutes: number };
  reading: { questions: number; minutes: number };
};

/** The four presets. Every number stays editable once the exam is made. */
export const EXAM_PRESETS: readonly ExamPreset[] = [
  { key: "topik1_paper", level: "topik1", listening: { questions: 30, minutes: 40 }, reading: { questions: 40, minutes: 60 } },
  { key: "topik2_paper", level: "topik2", listening: { questions: 50, minutes: 60 }, reading: { questions: 50, minutes: 70 } },
  { key: "topik1_internet", level: "topik1", listening: { questions: 26, minutes: 30 }, reading: { questions: 26, minutes: 40 } },
  { key: "topik2_internet", level: "topik2", listening: { questions: 30, minutes: 35 }, reading: { questions: 30, minutes: 40 } },
];

/** The two sections a preset makes, as the database keeps them. Listening comes first. */
export function presetSections(preset: ExamPreset) {
  return [
    { kind: "listening" as const, position: 1, question_count: preset.listening.questions, time_limit_sec: preset.listening.minutes * 60 },
    { kind: "reading" as const, position: 2, question_count: preset.reading.questions, time_limit_sec: preset.reading.minutes * 60 },
  ];
}

/** TOPIK I gives levels 1 and 2; TOPIK II levels 3 to 6. */
export const LEVELS_OF: Record<ExamLevel, readonly number[]> = { topik1: [1, 2], topik2: [3, 4, 5, 6] };

export type Threshold = { level: number; min_correct: number };

/**
 * The practice estimate for a score: the highest level whose threshold is
 * reached, or null (no thresholds, or below all of them). Never an official result.
 */
export function estimateLevel(thresholds: readonly Threshold[] | null | undefined, correct: number): number | null {
  const reached = (thresholds ?? []).filter((threshold) => threshold.min_correct <= correct).map((threshold) => threshold.level);
  return reached.length > 0 ? Math.max(...reached) : null;
}

export type ThresholdError = "levelInvalid" | "minInvalid" | "order";

/** Thresholds must name this exam's levels, fit its questions, and rise with the level. */
export function checkThresholds(thresholds: readonly Threshold[], level: ExamLevel, questions: number): ThresholdError | null {
  const sorted = [...thresholds].sort((a, b) => a.level - b.level);
  if (sorted.some((threshold) => !LEVELS_OF[level].includes(threshold.level)) || new Set(sorted.map((threshold) => threshold.level)).size !== sorted.length) return "levelInvalid";
  if (sorted.some((threshold) => !Number.isInteger(threshold.min_correct) || threshold.min_correct < 1 || threshold.min_correct > questions)) return "minInvalid";
  if (sorted.some((threshold, index) => index > 0 && threshold.min_correct <= sorted[index - 1].min_correct)) return "order";
  return null;
}

// ── Media ──

/** Listening audio: MP3 or M4A, up to 10 MB. */
export const AUDIO_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "m4a" };
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
export const EXAM_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const EXAM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Whether a chosen file is an audio the exam takes, by its type or, when the browser gives none, its name. */
export function audioExtension(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0 || file.size > AUDIO_MAX_BYTES) return null;
  if (file.type in AUDIO_TYPES) return AUDIO_TYPES[file.type];
  const extension = file.name.toLowerCase().split(".").pop();
  return file.type === "" && (extension === "mp3" || extension === "m4a") ? extension : null;
}

// ── Import ──

export const EXAM_OPTION_IDS = ["a", "b", "c", "d"] as const;
export type ExamOptionId = (typeof EXAM_OPTION_IDS)[number];
export const PROMPT_MAX = 1000;
export const EXAM_OPTION_MAX = 300;
export const EXAM_EXPLANATION_MAX = 2000;
export const PASSAGE_TEXT_MAX = 6000;
export const EXAM_IMPORT_MAX_ROWS = 400;

/** The columns of the import file, in the template's order. */
export const EXAM_IMPORT_COLUMNS = ["section", "passage", "passage_text", "audio", "question", "option_a", "option_b", "option_c", "option_d", "correct", "explanation"] as const;
type Column = (typeof EXAM_IMPORT_COLUMNS)[number];
const REQUIRED: Column[] = ["section", "question", "option_a", "option_b", "correct"];

export type ImportPassage = { key: string; section: SectionKind; kind: "text" | "audio"; text: string | null; audio: string | null };
export type ImportExamQuestion = {
  section: SectionKind;
  /** The passage it belongs to, by its key in `passages`; null for a question on its own. */
  passage: string | null;
  prompt: string;
  options: Array<{ id: ExamOptionId; text: string }>;
  correct_option_id: ExamOptionId;
  explanation: string | null;
};

export type ExamRowError =
  | "sectionInvalid"
  | "promptRequired"
  | "promptTooLong"
  | "optionsTooFew"
  | "optionsGap"
  | "optionTooLong"
  | "correctInvalid"
  | "explanationTooLong"
  | "passageTooLong"
  | "audioMissing"
  | "audioInReading";

export type ExamFileError = "empty" | "headerInvalid" | "tooManyRows";

export type ExamImportReport =
  | { ok: false; error: ExamFileError; missing?: Column[] }
  | {
      ok: true;
      rows: number;
      passages: ImportPassage[];
      questions: ImportExamQuestion[];
      /** `row` is the line in the file, the header being 1. */
      errors: Array<{ row: number; errors: ExamRowError[] }>;
      /** Audio files that were chosen and that no row names. */
      unusedAudio: string[];
    };

const clean = (cell: unknown) => (cell === null || cell === undefined ? "" : String(cell)).replace(/[ \t]+/g, " ").trim();
/** File names are matched without regard to letter case or the folder they came from. */
export const audioKey = (name: string) => name.trim().toLowerCase().split(/[\\/]/).pop() ?? "";

/**
 * Reads the rows of an exam import (the first row is the header). Rows that
 * share a `passage` label in the same section share one passage: its text
 * and its audio are taken from the first row that gives them. An audio file
 * is matched by name against the files chosen with the sheet. Nothing is
 * saved: the report says which rows are ready and why each other is not.
 */
export function readExamImport(table: unknown[][], audioFiles: readonly string[]): ExamImportReport {
  const rows = table.map((row) => row.map(clean));
  const header = rows[0]?.map((cell) => cell.toLowerCase().replace(/[ -]+/g, "_")) ?? [];
  if (header.every((cell) => cell === "")) return { ok: false, error: "empty" };
  const at = Object.fromEntries(EXAM_IMPORT_COLUMNS.map((column) => [column, header.indexOf(column)])) as Record<Column, number>;
  const missing = REQUIRED.filter((column) => at[column] < 0);
  if (missing.length > 0) return { ok: false, error: "headerInvalid", missing };
  const body = rows.slice(1).map((cells, index) => ({ cells, row: index + 2 })).filter(({ cells }) => cells.some((cell) => cell !== ""));
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.length > EXAM_IMPORT_MAX_ROWS) return { ok: false, error: "tooManyRows" };

  const chosen = new Map(audioFiles.map((name) => [audioKey(name), name]));
  const used = new Set<string>();
  const passages = new Map<string, ImportPassage>();
  const questions: ImportExamQuestion[] = [];
  const errors: Array<{ row: number; errors: ExamRowError[] }> = [];
  let lonely = 0;

  for (const { cells, row } of body) {
    const cell = (column: Column) => (at[column] < 0 ? "" : (cells[at[column]] ?? ""));
    const problems: ExamRowError[] = [];

    const sectionText = cell("section").toLowerCase();
    const section = (SECTION_KINDS as readonly string[]).includes(sectionText) ? (sectionText as SectionKind) : null;
    if (!section) problems.push("sectionInvalid");

    const prompt = cell("question");
    if (prompt === "") problems.push("promptRequired");
    else if (prompt.length > PROMPT_MAX) problems.push("promptTooLong");

    const given = EXAM_OPTION_IDS.map((id) => ({ id, text: cell(`option_${id}` as Column) }));
    const last = given.reduce((latest, option, index) => (option.text !== "" ? index : latest), -1);
    const options = given.slice(0, last + 1);
    if (options.length < 2) problems.push("optionsTooFew");
    else if (options.some((option) => option.text === "")) problems.push("optionsGap");
    if (options.some((option) => option.text.length > EXAM_OPTION_MAX)) problems.push("optionTooLong");

    const correctText = cell("correct").toLowerCase();
    const correct = options.find((option) => option.id === correctText && option.text !== "")?.id ?? null;
    if (!correct) problems.push("correctInvalid");

    const explanation = cell("explanation");
    if (explanation.length > EXAM_EXPLANATION_MAX) problems.push("explanationTooLong");

    const passageText = cell("passage_text");
    if (passageText.length > PASSAGE_TEXT_MAX) problems.push("passageTooLong");
    const audioName = cell("audio");
    const audio = audioName === "" ? null : (chosen.get(audioKey(audioName)) ?? null);
    if (audioName !== "" && !audio) problems.push("audioMissing");
    if (audioName !== "" && section === "reading") problems.push("audioInReading");

    if (problems.length > 0 || !section || !correct) {
      errors.push({ row, errors: problems });
      continue;
    }

    // The passage: rows with the same label share it; a row with a text or an audio and no label has its own.
    const label = cell("passage");
    let passageKey: string | null = null;
    if (label !== "" || passageText !== "" || audio) {
      passageKey = label !== "" ? `${section}:${label.toLowerCase()}` : `${section}:#${++lonely}`;
      const known = passages.get(passageKey);
      if (!known) passages.set(passageKey, { key: passageKey, section, kind: audio ? "audio" : "text", text: passageText || null, audio });
      else {
        // A later row may bring what the first left out.
        if (!known.text && passageText) known.text = passageText;
        if (!known.audio && audio) {
          known.audio = audio;
          known.kind = "audio";
        }
      }
    }
    if (audio) used.add(audioKey(audio));
    questions.push({ section, passage: passageKey, prompt, options, correct_option_id: correct, explanation: explanation || null });
  }

  // A labelled passage with neither a text nor an audio is only a grouping: its questions stand on their own.
  for (const [key, passage] of passages) {
    if (!passage.text && !passage.audio) {
      passages.delete(key);
      for (const question of questions) if (question.passage === key) question.passage = null;
    }
  }
  const unusedAudio = audioFiles.filter((name) => !used.has(audioKey(name)));
  return { ok: true, rows: body.length, passages: [...passages.values()], questions, errors, unusedAudio };
}

/** The template: the header and three example rows. */
export function examTemplateRows(): string[][] {
  return [
    [...EXAM_IMPORT_COLUMNS],
    ["listening", "L1", "", "listening-01.mp3", "남자는 무엇을 하고 있습니까?", "책을 읽습니다", "음악을 듣습니다", "운동을 합니다", "요리를 합니다", "b", "남자는 음악을 듣고 있습니다."],
    ["reading", "R1", "저는 주말에 친구와 영화를 봤습니다. 영화가 아주 재미있었습니다.", "", "이 사람은 주말에 무엇을 했습니까?", "영화를 봤습니다", "책을 읽었습니다", "여행을 갔습니다", "", "a", ""],
    ["reading", "R1", "", "", "영화는 어땠습니까?", "재미없었습니다", "재미있었습니다", "", "", "b", ""],
  ];
}
