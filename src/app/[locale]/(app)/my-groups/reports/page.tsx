import { Suspense } from "react";

import { TeacherReportScreen } from "@/components/teacher/teacher-report-screen";
import { ChartsSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { MAX_REPORT_MONTHS, monthsBetween, resolvePeriod } from "@/lib/domain/report-period";
import { shiftMonth, tashkentDate } from "@/lib/domain/time";
import { getPointsReport } from "@/lib/reports/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { reportsSearchSchema } from "@/lib/validation/reports";

// The points report for a teacher: the same as the staff's Points tab, which
// the database narrows to the groups they teach.
async function Report({ searchParams }: { searchParams: SearchParams }) {
  const search = reportsSearchSchema.parse(firstValues(await searchParams));
  const user = await getTeacherUser();
  if (!user) return null;

  const currentMonth = tashkentDate(new Date()).slice(0, 7);
  const range = resolvePeriod(search, currentMonth);
  const monthOptions = monthsBetween(shiftMonth(currentMonth, 1 - MAX_REPORT_MONTHS), currentMonth).reverse();
  return <TeacherReportScreen report={await getPointsReport(range)} range={range} monthOptions={monthOptions} />;
}

export default async function TeacherReportPage({ params, searchParams }: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<ChartsSkeleton />}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}
