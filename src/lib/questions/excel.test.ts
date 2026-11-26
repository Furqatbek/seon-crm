import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { readImport } from "../domain/questions.ts";
import { templateXlsx, xlsxRows } from "./excel.ts";

const banks = [{ subject: "TOPIK", level: "topik1" }, { subject: "TOPIK", level: "topik2" }];

describe("Excel import files", () => {
  it("the template is an Excel file the import reads back without errors", async () => {
    const rows = await xlsxRows(await templateXlsx());
    expect(rows?.[0]).toEqual(["subject", "level", "language", "question", "option_a", "option_b", "option_c", "option_d", "correct", "explanation", "difficulty"]);
    const report = readImport(rows ?? [], banks);
    expect(report).toMatchObject({ ok: true, rows: 2, errors: [] });
    expect(report.ok && report.questions.map((question) => [question.level, question.options.length, question.correct_option_id])).toEqual([["topik1", 4, "a"], ["topik2", 2, "a"]]);
  });

  it("reads numbers, formulas and formatted text as the person sees them", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Any name");
    sheet.addRow(["subject", "level", "question", "option_a", "option_b", "correct", "difficulty"]);
    sheet.addRow(["TOPIK", 1, { richText: [{ text: "2 + 2 " }, { font: { bold: true }, text: "= ?" }] }, 3, { formula: "2+2", result: 4 }, "B", 3]);
    sheet.addRow([]);
    sheet.addRow(["TOPIK", "TOPIK II", "", "a", "b", "a", 1]);
    const rows = await xlsxRows((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const report = readImport(rows ?? [], banks);
    expect(report).toMatchObject({
      ok: true,
      rows: 2,
      questions: [{ subject: "TOPIK", level: "topik1", text: "2 + 2 = ?", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }], correct_option_id: "b", difficulty: 3 }],
      errors: [{ row: 4, errors: ["textRequired"] }],
    });
  });
});
