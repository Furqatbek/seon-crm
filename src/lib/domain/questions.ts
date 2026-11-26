// Game question banks — docs/STUDENT_APP_SPEC.md → "Rules → 1v1 game" and
// "CRM changes" (Points → Questions). Pure: reading an import file's rows,
// and the too-hard / too-easy flags. The database has the same shape rules.

export const QUESTION_LANGUAGES = ["uz", "ru", "en", "ko"] as const;
export type QuestionLanguage = (typeof QUESTION_LANGUAGES)[number];

export const OPTION_IDS = ["a", "b", "c", "d"] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export const QUESTION_TEXT_MAX = 500;
export const OPTION_TEXT_MAX = 200;
export const EXPLANATION_MAX = 500;
/** The most rows one file may bring. */
export const IMPORT_MAX_ROWS = 1000;

/** A bank: the questions of one subject and level. */
export type Bank = { subject: string; level: string };

/** The TOPIK banks' subject, and the levels as the database writes them. */
export const TOPIK_SUBJECT = "TOPIK";

/** "TOPIK II", "topik 2", "topik2" → "topik2"; likewise for I. Anything else → null. */
export function topikLevel(text: string): "topik1" | "topik2" | null {
  const value = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(topik ?)?(ii|2)$/.test(value)) return "topik2";
  if (/^(topik ?)?(i|1)$/.test(value)) return "topik1";
  return null;
}

// ── Flags ──

/** Fewer answers than this say nothing yet. */
export const FLAG_MIN_USES = 20;
/** Below 15% right a question is too hard or wrong; above 95% it teaches nothing. */
export const TOO_HARD_BELOW = 0.15;
export const TOO_EASY_ABOVE = 0.95;

export type QuestionFlag = "tooHard" | "tooEasy";

/** The share of right answers, or null before anyone was shown it. */
export function correctRate(timesUsed: number, timesCorrect: number): number | null {
  return timesUsed > 0 ? timesCorrect / timesUsed : null;
}

export function questionFlag(timesUsed: number, timesCorrect: number): QuestionFlag | null {
  if (timesUsed < FLAG_MIN_USES) return null;
  const rate = timesCorrect / timesUsed;
  if (rate < TOO_HARD_BELOW) return "tooHard";
  if (rate > TOO_EASY_ABOVE) return "tooEasy";
  return null;
}

// ── Import ──

/** The columns of the import file, in the template's order. */
export const IMPORT_COLUMNS = ["subject", "level", "language", "question", "option_a", "option_b", "option_c", "option_d", "correct", "explanation", "difficulty"] as const;
type Column = (typeof IMPORT_COLUMNS)[number];
/** Columns a file must have; the others may be left out. */
const REQUIRED_COLUMNS: Column[] = ["subject", "question", "option_a", "option_b", "correct"];

export type ImportQuestion = {
  subject: string;
  level: string;
  language: QuestionLanguage;
  text: string;
  options: Array<{ id: OptionId; text: string }>;
  correct_option_id: OptionId;
  explanation: string | null;
  difficulty: 1 | 2 | 3;
};

/** Why a row was left out. The screen says each in the reader's language. */
export type RowError =
  | "subjectRequired"
  | "bankUnknown"
  | "languageInvalid"
  | "textRequired"
  | "textTooLong"
  | "optionsTooFew"
  | "optionsGap"
  | "optionTooLong"
  | "optionsRepeat"
  | "correctInvalid"
  | "explanationTooLong"
  | "difficultyInvalid"
  | "duplicateInFile"
  | "duplicateInBank";

export type FileError = "empty" | "headerInvalid" | "tooManyRows";

export type ImportReport =
  | { ok: false; error: FileError; missing?: Column[] }
  | {
      ok: true;
      /** Rows with something in them, the header not counted. */
      rows: number;
      questions: ImportQuestion[];
      /** `row` is the line in the file, the header being 1. */
      errors: Array<{ row: number; errors: RowError[] }>;
    };

const clean = (cell: unknown) => (cell === null || cell === undefined ? "" : String(cell)).replace(/\s+/g, " ").trim();

/** How two questions are told apart: the same bank and the same words. */
export const questionKey = (subject: string, level: string, text: string) => [subject, level, text].map((part) => part.trim().toLowerCase().replace(/\s+/g, " ")).join("\u0001");

/**
 * Reads the rows of an import file (the first row is the header) against the
 * banks there are. Nothing is saved: the report says which rows are ready and
 * why each of the others is not. `existing` holds questionKey() of the
 * questions already in the bank.
 */
export function readImport(table: unknown[][], banks: Bank[], existing: ReadonlySet<string> = new Set()): ImportReport {
  const rows = table.map((row) => row.map(clean));
  const header = rows[0]?.map((cell) => cell.toLowerCase().replace(/[ -]+/g, "_")) ?? [];
  const body = rows.slice(1).map((cells, index) => ({ cells, row: index + 2 })).filter(({ cells }) => cells.some((cell) => cell !== ""));
  if (header.every((cell) => cell === "")) return { ok: false, error: "empty" };
  const at = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, header.indexOf(column)])) as Record<Column, number>;
  const missing = REQUIRED_COLUMNS.filter((column) => at[column] < 0);
  if (missing.length > 0) return { ok: false, error: "headerInvalid", missing };
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.length > IMPORT_MAX_ROWS) return { ok: false, error: "tooManyRows" };

  const bankOf = new Map(banks.map((bank) => [`${bank.subject.toLowerCase()}\u0001${bank.level.toLowerCase()}`, bank]));
  const seen = new Set<string>();
  const questions: ImportQuestion[] = [];
  const errors: Array<{ row: number; errors: RowError[] }> = [];

  for (const { cells, row } of body) {
    const cell = (column: Column) => (at[column] < 0 ? "" : (cells[at[column]] ?? ""));
    const problems: RowError[] = [];

    // The bank: written as the centre writes it, in any letter case.
    const subjectText = cell("subject");
    const levelText = cell("level");
    const topik = subjectText.toLowerCase() === TOPIK_SUBJECT.toLowerCase() ? topikLevel(levelText) : null;
    const bank = bankOf.get(`${subjectText.toLowerCase()}\u0001${(topik ?? levelText).toLowerCase()}`);
    if (subjectText === "") problems.push("subjectRequired");
    else if (!bank) problems.push("bankUnknown");

    const languageText = cell("language").toLowerCase() || "uz";
    const language = (QUESTION_LANGUAGES as readonly string[]).includes(languageText) ? (languageText as QuestionLanguage) : null;
    if (!language) problems.push("languageInvalid");

    const text = cell("question");
    if (text === "") problems.push("textRequired");
    else if (text.length > QUESTION_TEXT_MAX) problems.push("textTooLong");

    // Choices A and B at least, with no hole before a later one.
    const given = OPTION_IDS.map((id) => ({ id, text: cell(`option_${id}` as Column) }));
    const last = given.reduce((latest, option, index) => (option.text !== "" ? index : latest), -1);
    const options = given.slice(0, last + 1);
    if (options.length < 2) problems.push("optionsTooFew");
    else if (options.some((option) => option.text === "")) problems.push("optionsGap");
    if (options.some((option) => option.text.length > OPTION_TEXT_MAX)) problems.push("optionTooLong");
    const texts = options.filter((option) => option.text !== "").map((option) => option.text.toLowerCase());
    if (new Set(texts).size !== texts.length) problems.push("optionsRepeat");

    const correctText = cell("correct").toLowerCase();
    const correct = options.find((option) => option.id === correctText && option.text !== "")?.id ?? null;
    if (!correct) problems.push("correctInvalid");

    const explanation = cell("explanation");
    if (explanation.length > EXPLANATION_MAX) problems.push("explanationTooLong");

    const difficultyText = cell("difficulty") || "2";
    const difficulty = ["1", "2", "3"].includes(difficultyText) ? (Number(difficultyText) as 1 | 2 | 3) : null;
    if (!difficulty) problems.push("difficultyInvalid");

    if (bank && text !== "") {
      const key = questionKey(bank.subject, bank.level, text);
      if (seen.has(key)) problems.push("duplicateInFile");
      else if (existing.has(key)) problems.push("duplicateInBank");
      seen.add(key);
    }

    if (problems.length > 0 || !bank || !language || !correct || !difficulty) {
      errors.push({ row, errors: problems });
      continue;
    }
    questions.push({ subject: bank.subject, level: bank.level, language, text, options, correct_option_id: correct, explanation: explanation || null, difficulty });
  }
  return { ok: true, rows: body.length, questions, errors };
}

/**
 * A CSV file's rows. Commas or semicolons (as Excel writes in some regions),
 * quoted cells with doubled quotes inside, and line breaks inside quotes.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** One cell of a CSV file: quoted when it must be. */
const csvCell = (value: string) => (/[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The rows as a CSV file, with the mark Excel needs to read it as UTF-8. */
export function toCsv(rows: string[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** The template: the header and two example rows. */
export function templateRows(): string[][] {
  return [
    [...IMPORT_COLUMNS],
    ["TOPIK", "TOPIK I", "ko", "‘학교’ soʻzining maʼnosi nima?", "Maktab", "Kasalxona", "Bozor", "Uy", "a", "학교 = maktab.", "1"],
    ["TOPIK", "TOPIK II", "ko", "다음 중 맞는 문장을 고르십시오.", "저는 학교에 갑니다.", "저는 학교를 갑니다에.", "", "", "a", "", "2"],
  ];
}
