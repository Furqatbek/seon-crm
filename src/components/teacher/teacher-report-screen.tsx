"use client";

import { useLocale, useTranslations } from "next-intl";

import { PointsReport } from "@/components/reports/points-report";
import { PeriodPicker } from "@/components/reports/reports-screen";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import type { ReportPeriod } from "@/lib/domain/report-period";
import type { PointsReport as Report } from "@/lib/reports/queries";

/** A teacher's points report: their own groups, the same charts as the staff see. */
export function TeacherReportScreen({
  report,
  range,
  monthOptions,
}: {
  report: Report;
  range: { period: ReportPeriod; from: string; to: string };
  monthOptions: string[];
}) {
  const t = useTranslations("reports");
  const locale = useLocale() as Locale;
  return (
    <>
      <PageHeader title={t("teacherTitle")}>
        <PeriodPicker range={range} monthOptions={monthOptions} />
      </PageHeader>
      <PointsReport report={report} range={range} locale={locale} />
    </>
  );
}
