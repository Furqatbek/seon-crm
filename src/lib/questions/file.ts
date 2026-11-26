import "server-only";

import { parseCsv, readImport, questionKey, type Bank, type ImportReport } from "@/lib/domain/questions";
import type { QuestionErrorKey } from "@/lib/validation/questions";
import { IMPORT_MAX_BYTES } from "@/lib/validation/questions";

import { xlsxRows } from "./excel";

// Reading an import file. Server only: the Excel library never reaches the browser.

/** The rows of a CSV or .xlsx file, or why it cannot be read. */
export async function fileRows(file: File): Promise<{ ok: true; rows: string[][] } | { ok: false; error: QuestionErrorKey }> {
  if (file.size === 0) return { ok: false, error: "empty" };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: "fileTooLarge" };
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".csv")) {
      return { ok: true, rows: parseCsv(new TextDecoder("utf-8").decode(await file.arrayBuffer())) };
    }
    if (name.endsWith(".xlsx")) {
      const rows = await xlsxRows(await file.arrayBuffer());
      return rows ? { ok: true, rows } : { ok: false, error: "empty" };
    }
  } catch {
    return { ok: false, error: "fileInvalid" };
  }
  return { ok: false, error: "fileInvalid" };
}

export async function reportOf(file: File, banks: Bank[], existing: Array<{ subject: string; level: string; text: string }>): Promise<ImportReport | { ok: false; error: QuestionErrorKey }> {
  const read = await fileRows(file);
  if (!read.ok) return read;
  return readImport(read.rows, banks, new Set(existing.map((question) => questionKey(question.subject, question.level, question.text))));
}
