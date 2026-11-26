"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { KpiCard } from "@/components/ui/kpi-card";
import type { Locale } from "@/i18n/routing";
import { formatMonth, formatMonthShort } from "@/lib/format";
import { EARNED_SOURCES as POINTS_SOURCES, type EarnedSource as PointsSource } from "@/lib/domain/points";
import type { PointsReport as Report } from "@/lib/reports/queries";

import { BAR_END_RIGHT, ChartCard, ChartTooltip, GRID, HOVER, Legend, SERIES, TICK, VALUE_LABEL, shorten } from "./chart-parts";

const ROW = 34;
const rowsHeight = (count: number) => count * ROW + 12;
const NAME_AXIS = 132;

// The brand orange for the main series, dark grey for the comparison, greys after that.
const SOURCE_COLOR: Record<PointsSource, string> = {
  attendance: SERIES.main,
  teacher_award: SERIES.comparison,
  perfect_month: "var(--text-secondary)",
  on_time_payment: SERIES.rest,
  referral: "var(--border-strong)",
  owner_adjustment: "var(--border)",
};

/**
 * The points report: six KPIs and five charts, each with Export CSV. Every
 * figure arrives computed from the database; a teacher gets the same report
 * for their own groups.
 */
export function PointsReport({ report, range, locale }: { report: Report; range: { from: string; to: string }; locale: Locale }) {
  const t = useTranslations("reports.points");
  const tReports = useTranslations("reports");
  const tSource = useTranslations("points.source");
  const { kpis } = report;
  const file = (name: string) => `${name}_${range.from}_${range.to}.csv`;
  const number = (value: number) => String(value);
  const sources = POINTS_SOURCES.filter((source) => report.bySource.some((row) => row[source] !== 0));

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3" data-slot="points-kpi-row">
        {(
          [
            ["earned", kpis.earned],
            ["deducted", kpis.deducted],
            ["spent", kpis.spent],
            ["unspent", kpis.unspent],
            ["rewardsGiven", kpis.rewardsGiven],
            ["studentsWithoutPoints", kpis.studentsWithoutPoints],
          ] as const
        ).flatMap(([key, value]) =>
          // A teacher's report has no spending or balances: those cards are left out.
          value === null ? [] : [
          <KpiCard key={key} label={t(`kpi.${key}`)}>
            <span data-points-kpi={key} data-value={value}>
              {value}
            </span>
          </KpiCard>,
        ])}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Points earned by source per month */}
        <ChartCard
          id="points-by-source"
          title={t("bySource.title")}
          className="lg:col-span-2"
          empty={sources.length === 0}
          csv={{
            filename: file("points-by-source"),
            headers: [tReports("month"), ...POINTS_SOURCES.map((source) => tSource(source))],
            rows: report.bySource.map((row) => [row.month, ...POINTS_SOURCES.map((source) => row[source])]),
          }}
        >
          <Legend items={sources.map((source) => ({ label: tSource(source), color: SOURCE_COLOR[source] }))} />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={report.bySource} barCategoryGap="28%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={(value: string) => formatMonthShort(value, locale)} tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={number} formatLabel={(value) => formatMonth(value, locale)} />} />
              {sources.map((source) => (
                <Bar key={source} dataKey={source} stackId="points" name={tSource(source)} fill={SOURCE_COLOR[source]} maxBarSize={40} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Awards and deductions per teacher */}
        <ChartCard
          id="points-by-teacher"
          title={t("byTeacher.title")}
          hint={t("byTeacher.hint")}
          empty={report.byTeacher.length === 0}
          csv={{
            filename: file("points-by-teacher"),
            headers: [t("byTeacher.teacher"), t("byTeacher.awards"), t("byTeacher.deductions")],
            rows: report.byTeacher.map((row) => [row.name, row.awards, row.deductions]),
          }}
        >
          <Legend
            items={[
              { label: t("byTeacher.awards"), color: SERIES.main },
              { label: t("byTeacher.deductions"), color: SERIES.comparison },
            ]}
          />
          <ResponsiveContainer width="100%" height={rowsHeight(report.byTeacher.length * 2)}>
            <BarChart data={report.byTeacher} layout="vertical" barGap={2} margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={NAME_AXIS} tickFormatter={(value: string) => shorten(value)} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={number} />} />
              <Bar dataKey="awards" name={t("byTeacher.awards")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={12} isAnimationActive={false}>
                <LabelList dataKey="awards" position="right" style={VALUE_LABEL} />
              </Bar>
              <Bar dataKey="deductions" name={t("byTeacher.deductions")} fill={SERIES.comparison} radius={BAR_END_RIGHT} barSize={12} isAnimationActive={false}>
                <LabelList dataKey="deductions" position="right" style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Top 10 students */}
        <ChartCard
          id="points-top-students"
          title={t("topStudents.title")}
          empty={report.topStudents.length === 0}
          csv={{
            filename: file("points-top-students"),
            headers: [t("topStudents.student"), t("points")],
            rows: report.topStudents.map((row) => [row.name, row.points]),
          }}
        >
          <ResponsiveContainer width="100%" height={rowsHeight(report.topStudents.length)}>
            <BarChart data={report.topStudents} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={NAME_AXIS} tickFormatter={(value: string) => shorten(value)} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={number} />} />
              <Bar dataKey="points" name={t("points")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                <LabelList dataKey="points" position="right" style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Rewards given by reward: staff only */}
        {kpis.rewardsGiven === null ? null : (
        <ChartCard
          id="points-rewards"
          title={t("rewards.title")}
          empty={report.rewards.length === 0}
          csv={{
            filename: file("rewards-given"),
            headers: [t("rewards.reward"), t("rewards.given"), t("rewards.points")],
            rows: report.rewards.map((row) => [row.name, row.given, row.points]),
          }}
        >
          <ResponsiveContainer width="100%" height={rowsHeight(report.rewards.length)}>
            <BarChart data={report.rewards} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={NAME_AXIS} tickFormatter={(value: string) => shorten(value)} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={number} />} />
              <Bar dataKey="given" name={t("rewards.given")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                <LabelList dataKey="given" position="right" style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        )}

        {/* 5. Average points per student by group */}
        <ChartCard
          id="points-by-group"
          title={t("byGroup.title")}
          hint={t("byGroup.hint")}
          empty={report.byGroup.length === 0}
          csv={{
            filename: file("points-by-group"),
            headers: [t("byGroup.group"), t("byGroup.students"), t("points"), t("byGroup.average")],
            rows: report.byGroup.map((row) => [row.name, row.students, row.points, row.average]),
          }}
        >
          <ResponsiveContainer width="100%" height={rowsHeight(report.byGroup.length)}>
            <BarChart data={report.byGroup} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={NAME_AXIS} tickFormatter={(value: string) => shorten(value)} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={number} />} />
              <Bar dataKey="average" name={t("byGroup.average")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                <LabelList dataKey="average" position="right" style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}
