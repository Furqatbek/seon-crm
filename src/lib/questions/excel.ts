import ExcelJS from "exceljs";

import { IMPORT_MAX_ROWS, templateRows } from "../domain/questions.ts";

// Excel in and out for the question import. Used on the server only (the
// actions and the template route), and kept apart from them so it can be tested.

/** A cell as the person sees it in Excel. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value);
}

/** The first sheet's rows as text, or null when the file has no sheet. */
export async function xlsxRows(data: ArrayBuffer): Promise<string[][] | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) return null;
  const rows: string[][] = [];
  // One more than the limit is enough to say "too many".
  const last = Math.min(sheet.rowCount, IMPORT_MAX_ROWS + 2);
  for (let number = 1; number <= last; number++) {
    const row = sheet.getRow(number);
    const cells: string[] = [];
    for (let column = 1; column <= Math.min(sheet.columnCount, 40); column++) cells.push(cellText(row.getCell(column).value));
    rows.push(cells);
  }
  return rows;
}

/** The template as an Excel file: the header and two example rows. */
export async function templateXlsx(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions");
  const rows = templateRows();
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column, index) => (column.width = Math.min(48, Math.max(12, ...rows.map((row) => (row[index] ?? "").length + 2)))));
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
