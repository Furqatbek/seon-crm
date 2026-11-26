import { describe, expect, it } from "vitest";

import { IMPORT_COLUMNS, correctRate, parseCsv, questionFlag, questionKey, readImport, templateRows, toCsv, topikLevel, type Bank } from "./questions";

// docs/STUDENT_APP_SPEC.md → "CRM changes" (Points → Questions): CSV/XLSX
// import with a row-error report before saving; flags below 15% or above 95% correct.

const banks: Bank[] = [
  { subject: "TOPIK", level: "topik1" },
  { subject: "TOPIK", level: "topik2" },
  { subject: "Matematika", level: "7-sinf" },
  { subject: "Ingliz tili", level: "" },
];

const header = [...IMPORT_COLUMNS];
const good = ["TOPIK", "TOPIK I", "ko", "학교?", "Maktab", "Bozor", "Uy", "", "a", "학교 = maktab", "1"];
const withRow = (changes: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>) => header.map((column, index) => changes[column] ?? good[index]);
const errorsOf = (row: string[]) => {
  const report = readImport([header, row], banks);
  if (!report.ok) throw new Error(report.error);
  return report.errors[0]?.errors ?? [];
};

describe("flags", () => {
  it("below 15% right is too hard, above 95% too easy, in between nothing", () => {
    expect(questionFlag(100, 14)).toBe("tooHard");
    expect(questionFlag(100, 15)).toBeNull();
    expect(questionFlag(100, 95)).toBeNull();
    expect(questionFlag(100, 96)).toBe("tooEasy");
    expect(questionFlag(40, 0)).toBe("tooHard");
    expect(questionFlag(40, 40)).toBe("tooEasy");
  });

  it("says nothing before 20 answers", () => {
    expect(questionFlag(19, 0)).toBeNull();
    expect(questionFlag(19, 19)).toBeNull();
    expect(questionFlag(20, 0)).toBe("tooHard");
    expect(questionFlag(0, 0)).toBeNull();
    expect(correctRate(0, 0)).toBeNull();
    expect(correctRate(8, 2)).toBe(0.25);
  });
});

describe("reading an import", () => {
  it("a good row becomes a question in its bank, with its choices lettered", () => {
    const report = readImport([header, good, withRow({ subject: "matematika", level: "7-SINF", language: "", question: "2 + 2 = ?", option_a: "3", option_b: "4", option_c: "", correct: "B", explanation: "", difficulty: "" })], banks);
    expect(report).toEqual({
      ok: true,
      rows: 2,
      errors: [],
      questions: [
        { subject: "TOPIK", level: "topik1", language: "ko", text: "학교?", options: [{ id: "a", text: "Maktab" }, { id: "b", text: "Bozor" }, { id: "c", text: "Uy" }], correct_option_id: "a", explanation: "학교 = maktab", difficulty: 1 },
        // The bank as the centre writes it, Uzbek and middle difficulty by default.
        { subject: "Matematika", level: "7-sinf", language: "uz", text: "2 + 2 = ?", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }], correct_option_id: "b", explanation: null, difficulty: 2 },
      ],
    });
  });

  it("TOPIK levels are read however they are written", () => {
    for (const [text, level] of [["TOPIK I", "topik1"], ["topik 1", "topik1"], ["I", "topik1"], ["1", "topik1"], ["topik1", "topik1"], ["TOPIK II", "topik2"], ["Topik 2", "topik2"], ["II", "topik2"], ["topik2", "topik2"]] as const) {
      expect(topikLevel(text), text).toBe(level);
    }
    expect(topikLevel("TOPIK III")).toBeNull();
    expect(topikLevel("B2")).toBeNull();
    const report = readImport([header, withRow({ level: "topik ii" })], banks);
    expect(report.ok && report.questions[0].level).toBe("topik2");
  });

  it("says why a row is left out, by the line in the file", () => {
    expect(errorsOf(withRow({ subject: "" }))).toEqual(["subjectRequired"]);
    expect(errorsOf(withRow({ subject: "Fizika" }))).toEqual(["bankUnknown"]);
    expect(errorsOf(withRow({ level: "TOPIK III" }))).toEqual(["bankUnknown"]);
    expect(errorsOf(withRow({ subject: "Ingliz tili", level: "B2" }))).toEqual(["bankUnknown"]);
    expect(errorsOf(withRow({ language: "de" }))).toEqual(["languageInvalid"]);
    expect(errorsOf(withRow({ question: "" }))).toEqual(["textRequired"]);
    expect(errorsOf(withRow({ question: "x".repeat(501) }))).toEqual(["textTooLong"]);
    expect(errorsOf(withRow({ option_b: "", option_c: "" }))).toEqual(["optionsTooFew"]);
    expect(errorsOf(withRow({ option_b: "", option_c: "Uy" }))).toEqual(["optionsGap"]);
    expect(errorsOf(withRow({ option_a: "y".repeat(201) }))).toEqual(["optionTooLong"]);
    expect(errorsOf(withRow({ option_b: "maktab" }))).toEqual(["optionsRepeat"]);
    expect(errorsOf(withRow({ correct: "" }))).toEqual(["correctInvalid"]);
    expect(errorsOf(withRow({ correct: "e" }))).toEqual(["correctInvalid"]);
    // D is empty in this row: it cannot be the right answer.
    expect(errorsOf(withRow({ correct: "d" }))).toEqual(["correctInvalid"]);
    expect(errorsOf(withRow({ explanation: "z".repeat(501) }))).toEqual(["explanationTooLong"]);
    expect(errorsOf(withRow({ difficulty: "5" }))).toEqual(["difficultyInvalid"]);
    // Several things wrong at once are all said.
    expect(errorsOf(withRow({ subject: "", question: "", correct: "x" }))).toEqual(["subjectRequired", "textRequired", "correctInvalid"]);

    const report = readImport([header, good, [], withRow({ question: "" }), withRow({ question: "Another" }), withRow({ correct: "z", question: "Third" })], banks);
    expect(report).toMatchObject({ ok: true, rows: 4, errors: [{ row: 4, errors: ["textRequired"] }, { row: 6, errors: ["correctInvalid"] }] });
    expect(report.ok && report.questions).toHaveLength(2);
  });

  it("the same question twice in the file, or one the bank already has, is left out", () => {
    const existing = new Set([questionKey("TOPIK", "topik1", "  Bor   savol ")]);
    const report = readImport([header, good, withRow({ question: "학교? " }), withRow({ question: "bor savol" }), withRow({ question: "학교?", level: "TOPIK II" })], banks, existing);
    expect(report).toMatchObject({ ok: true, errors: [{ row: 3, errors: ["duplicateInFile"] }, { row: 4, errors: ["duplicateInBank"] }] });
    // The same words in another bank are another question.
    expect(report.ok && report.questions.map((question) => question.level)).toEqual(["topik1", "topik2"]);
  });

  it("refuses a file without its columns, without rows, or with too many", () => {
    expect(readImport([], banks)).toEqual({ ok: false, error: "empty" });
    expect(readImport([header], banks)).toEqual({ ok: false, error: "empty" });
    expect(readImport([header, ["", "", ""]], banks)).toEqual({ ok: false, error: "empty" });
    expect(readImport([["subject", "question", "option_a"], good], banks)).toEqual({ ok: false, error: "headerInvalid", missing: ["option_b", "correct"] });
    const many = [header, ...Array.from({ length: 1001 }, (_, index) => withRow({ question: `Q${index}` }))];
    expect(readImport(many, banks)).toEqual({ ok: false, error: "tooManyRows" });
    expect(readImport(many.slice(0, 1001), banks)).toMatchObject({ ok: true, rows: 1000 });
  });

  it("reads the header in any order and letter case, and leaves optional columns out", () => {
    const report = readImport([["Question", "Option A", "option-b", "CORRECT", "Subject", "Level"], ["2 + 2 = ?", "3", "4", "b", "Matematika", "7-sinf"]], banks);
    expect(report).toMatchObject({ ok: true, questions: [{ subject: "Matematika", level: "7-sinf", language: "uz", difficulty: 2, correct_option_id: "b", explanation: null }] });
    // A bank without a level.
    const blank = readImport([["subject", "question", "option_a", "option_b", "correct"], ["Ingliz tili", "Cat?", "Mushuk", "It", "a"]], banks);
    expect(blank.ok && blank.questions[0]).toMatchObject({ subject: "Ingliz tili", level: "" });
  });
});

describe("CSV", () => {
  it("reads commas, quotes, doubled quotes and line breaks inside quotes", () => {
    expect(parseCsv('a,b,c\r\n1,"two, 2","say ""hi"""\n"line\nbreak",,x')).toEqual([["a", "b", "c"], ["1", "two, 2", 'say "hi"'], ["line\nbreak", "", "x"]]);
  });

  it("reads semicolons as Excel writes them in some regions, and skips the UTF-8 mark", () => {
    expect(parseCsv("﻿subject;question\nTOPIK;학교, 집?")).toEqual([["subject", "question"], ["TOPIK", "학교, 집?"]]);
  });

  it("the template is a file the import reads back without errors", () => {
    const csv = toCsv(templateRows());
    expect(csv.startsWith("﻿")).toBe(true);
    const report = readImport(parseCsv(csv), banks);
    expect(report).toMatchObject({ ok: true, rows: 2, errors: [] });
    expect(report.ok && report.questions.map((question) => [question.level, question.options.length])).toEqual([["topik1", 4], ["topik2", 2]]);
  });

  it("writes cells that need quoting so they read back the same", () => {
    const rows = [["a,b", 'say "hi"', "two\nlines", "plain"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
