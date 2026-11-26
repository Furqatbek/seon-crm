import ExcelJS from "exceljs";
import { connection, NextResponse } from "next/server";

import { getSignedInUser } from "@/lib/auth";
import { examTemplateRows } from "@/lib/domain/exams";

// The import template for a mock exam, as Excel. For whoever builds exams:
// the owner, managers and teachers.
export async function GET() {
  // Answered for whoever asks, at the time they ask: never from the build.
  await connection();
  if (!(await getSignedInUser())) return new NextResponse("Not found", { status: 404 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Exam");
  const rows = examTemplateRows();
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column, index) => (column.width = Math.min(48, Math.max(12, ...rows.map((row) => (row[index] ?? "").length + 2)))));
  return new NextResponse((await workbook.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="exam-template.xlsx"',
      "cache-control": "no-store",
    },
  });
}
