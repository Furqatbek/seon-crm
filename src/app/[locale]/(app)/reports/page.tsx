import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { ReportsScreen } from "@/components/reports/reports-screen";
import { ChartsSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { MAX_REPORT_MONTHS, monthsBetween, resolvePeriod } from "@/lib/domain/report-period";
import { shiftMonth, tashkentDate } from "@/lib/domain/time";
import { getPointsReport, getReport } from "@/lib/reports/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { reportsSearchSchema } from "@/lib/validation/reports";

async function Reports({ searchParams }: { searchParams: SearchParams }) {
  const search = reportsSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  const currentMonth = tashkentDate(new Date()).slice(0, 7);
  const range = resolvePeriod(search, currentMonth);
  // Only the open tab is asked for. A manager's overview has no money in it:
  // the database is not even asked.
  const [report, points] = await Promise.all([
    search.tab === "overview" ? getReport(range, user.role) : null,
    search.tab === "points" ? getPointsReport(range) : null,
  ]);
  const monthOptions = monthsBetween(shiftMonth(currentMonth, 1 - MAX_REPORT_MONTHS), currentMonth).reverse();

  return <ReportsScreen tab={search.tab} report={report} points={points} range={range} monthOptions={monthOptions} />;
}

function Fallback() {
  const t = useTranslations("nav");
  return <ChartsSkeleton title={t("reports")} />;
}

export default async function ReportsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}
