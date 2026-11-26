import { connection, NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { templateRows, toCsv } from "@/lib/domain/questions";
import { templateXlsx } from "@/lib/questions/excel";

// The import template for Points → Questions, as Excel or CSV. For the owner
// and managers, like the import itself.
export async function GET(request: NextRequest) {
  // Answered for whoever asks, at the time they ask: never from the build.
  await connection();
  if (!(await getCurrentUser())) return new NextResponse("Not found", { status: 404 });
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(templateRows()), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="questions-template.csv"', "cache-control": "no-store" },
    });
  }
  return new NextResponse(await templateXlsx(), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="questions-template.xlsx"',
      "cache-control": "no-store",
    },
  });
}
