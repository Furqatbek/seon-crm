"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KpiCard } from "@/components/ui/kpi-card";
import { MoneyText } from "@/components/ui/money-text";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Locale } from "@/i18n/routing";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/domain/report-period";
import { formatMoney, formatMoneyAxis, formatMonth, formatMonthShort, formatPercent } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { Report } from "@/lib/reports/queries";

import {
  BAR_END_RIGHT,
  BAR_END_TOP,
  ChartCard,
  ChartTooltip,
  GRID,
  HOVER,
  Legend,
  SERIES,
  TICK,
  VALUE_LABEL,
  shorten,
} from "./chart-parts";

const ROW = 34;
const rowsHeight = (count: number) => count * ROW + 12;
const NAME_AXIS = 132;
/** Room to the right of a bar for its amount, so the label is never wrapped. */
const MONEY_LABEL = 124;
// A full amount does not fit half a phone screen: money KPIs take the whole row there.
const MONEY_KPI = "col-span-2 sm:col-span-1";

type Range = { period: ReportPeriod; from: string; to: string };

function PeriodPicker({ range, monthOptions }: { range: Range; monthOptions: string[] }) {
  const t = useTranslations("reports.period");
  const locale = useLocale() as Locale;
  const { setParams } = useUrlState();
  const month = (value: string) => formatMonth(value, locale);

  return (
    <>
      <Select
        value={range.period}
        onValueChange={(value) =>
          setParams(
            value === "custom"
              ? { period: "custom", from: range.from, to: range.to }
              : { period: value === "this" ? null : value, from: null, to: null },
          )
        }
      >
        <SelectTrigger aria-label={t("label")} className="w-full sm:w-52">
          <SelectValue>{t(range.period)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {REPORT_PERIODS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Each end changes only itself, so two quick changes never undo one another;
          the other end moves only when the range would otherwise run backwards. */}
      {range.period === "custom" ? (
        <div className="flex w-full gap-2 sm:w-auto">
          <Select value={range.from} onValueChange={(from) => setParams(from > range.to ? { from, to: from } : { from })}>
            <SelectTrigger aria-label={t("from")} className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <SelectValue>{month(range.from)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {month(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range.to} onValueChange={(to) => setParams(range.from > to ? { to, from: to } : { to })}>
            <SelectTrigger aria-label={t("to")} className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <SelectValue>{month(range.to)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {month(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <span className="text-footnote text-text-secondary numeric" data-slot="period-range" data-from={range.from} data-to={range.to}>
          {range.from === range.to ? month(range.from) : `${month(range.from)} – ${month(range.to)}`}
        </span>
      )}
    </>
  );
}

/**
 * Reports: period picker, KPI row and the charts. Every figure arrives
 * computed from the database; this screen only draws it. A manager gets the
 * lead, attendance and student-count parts (`report.money` is null).
 */
export function ReportsScreen({
  report,
  range,
  monthOptions,
}: {
  report: Report;
  range: Range;
  /** The months a custom range can start or end on, newest first. */
  monthOptions: string[];
}) {
  const t = useTranslations("reports");
  const tNav = useTranslations("nav");
  const tLeads = useTranslations("leads");
  const locale = useLocale() as Locale;
  const [revenueBy, setRevenueBy] = useState<"group" | "subject">("group");

  const { kpis, money } = report;
  const file = (name: string) => `${name}_${range.from}_${range.to}.csv`;
  const monthTick = (value: string) => formatMonthShort(value, locale);
  const monthLabel = (value: string) => formatMonth(value, locale);
  const moneyValue = (value: number) => formatMoney(value, locale);
  const percentValue = (value: number) => formatPercent(value, locale);

  const stages = report.funnel
    .filter((row) => row.dimension === "stage")
    .map((row) => ({ ...row, name: tLeads(`status.${row.key}` as "status.new") }));
  const sources = report.funnel
    .filter((row) => row.dimension === "source")
    .map((row) => ({ ...row, name: tLeads(`source.${row.key}` as "source.other") }));
  const noLeads = stages.every((row) => row.leads === 0);
  const attendance = report.attendance.filter((row) => row.rate !== null);
  const revenue = money?.revenue.filter((row) => row.dimension === revenueBy) ?? [];

  return (
    <>
      <PageHeader title={tNav("reports")}>
        <PeriodPicker range={range} monthOptions={monthOptions} />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4" data-slot="kpi-row">
        {money ? (
          <>
            <KpiCard label={t("kpi.collected")} className={MONEY_KPI}>
              <span data-kpi="collected" data-value={kpis.collected}>
                <MoneyText amount={kpis.collected ?? 0} />
              </span>
            </KpiCard>
            <KpiCard label={t("kpi.costs")} className={MONEY_KPI}>
              <span data-kpi="costs" data-value={kpis.costs}>
                <MoneyText amount={kpis.costs ?? 0} />
              </span>
            </KpiCard>
            <KpiCard label={t("kpi.profit")} className={MONEY_KPI}>
              <span data-kpi="profit" data-value={kpis.profit}>
                <MoneyText amount={kpis.profit ?? 0} debt />
              </span>
            </KpiCard>
            <KpiCard label={t("kpi.totalDebt")} className={MONEY_KPI}>
              <span data-kpi="total-debt" data-value={kpis.totalDebt}>
                <MoneyText amount={kpis.totalDebt ?? 0} className={kpis.totalDebt ? "text-danger" : undefined} />
              </span>
            </KpiCard>
          </>
        ) : null}
        <KpiCard label={t("kpi.activeStudents")}>
          <span data-kpi="active-students">{kpis.activeStudents}</span>
        </KpiCard>
        <KpiCard label={t("kpi.newLeads")}>
          <span data-kpi="new-leads">{kpis.newLeads}</span>
        </KpiCard>
        <KpiCard label={t("kpi.leadConversion")}>
          <span data-kpi="lead-conversion">
            {kpis.leadConversion === null ? "—" : percentValue(kpis.leadConversion)}
          </span>
        </KpiCard>
        <KpiCard label={t("kpi.attendanceRate")}>
          <span data-kpi="attendance-rate">
            {kpis.attendanceRate === null ? "—" : percentValue(kpis.attendanceRate)}
          </span>
        </KpiCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Collected vs expenses by month */}
        {money ? (
          <ChartCard
            id="money"
            title={t("money.title")}
            className="lg:col-span-2"
            empty={money.months.length === 0}
            csv={{
              filename: file("collected-vs-expenses"),
              headers: [t("month"), t("money.collected"), t("money.expenses"), t("money.salaries"), t("money.costs")],
              rows: money.months.map((row) => [row.month, row.collected, row.expenses, row.salaries, row.costs]),
            }}
          >
            <Legend
              items={[
                { label: t("money.collected"), color: SERIES.main },
                { label: t("money.costs"), color: SERIES.comparison },
              ]}
            />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={money.months} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={monthTick} tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis
                  tickFormatter={(value: number) => formatMoneyAxis(value, locale)}
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: HOVER }}
                  content={<ChartTooltip formatValue={moneyValue} formatLabel={monthLabel} />}
                />
                <Bar dataKey="collected" name={t("money.collected")} fill={SERIES.main} radius={BAR_END_TOP} maxBarSize={28} isAnimationActive={false} />
                <Bar dataKey="costs" name={t("money.costs")} fill={SERIES.comparison} radius={BAR_END_TOP} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 2. Revenue by group and by subject */}
        {money ? (
          <ChartCard
            id="revenue"
            title={t("revenue.title")}
            empty={revenue.length === 0}
            csv={{
              filename: file(`revenue-by-${revenueBy}`),
              headers: [t(`revenue.${revenueBy}Column`), t("revenue.collected")],
              rows: revenue.map((row) => [row.name, row.collected]),
            }}
            controls={
              <SegmentedControl
                aria-label={t("revenue.by")}
                value={revenueBy}
                onValueChange={setRevenueBy}
                options={[
                  { value: "group", label: t("revenue.group") },
                  { value: "subject", label: t("revenue.subject") },
                ]}
                className="self-start"
              />
            }
          >
            <ResponsiveContainer width="100%" height={rowsHeight(revenue.length)}>
              <BarChart data={revenue} layout="vertical" margin={{ top: 0, right: MONEY_LABEL, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={NAME_AXIS} tickFormatter={(value: string) => shorten(value)} tick={TICK} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={moneyValue} />} />
                <Bar dataKey="collected" name={t("revenue.collected")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                  <LabelList dataKey="collected" position="right" formatter={(value: unknown) => moneyValue(Number(value))} style={VALUE_LABEL} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {/* 5. Attendance rate by group */}
        <ChartCard
          id="attendance"
          title={t("attendance.title")}
          className={money ? undefined : "lg:col-span-2"}
          empty={attendance.length === 0}
          csv={{
            filename: file("attendance-by-group"),
            headers: [
              t("attendance.group"),
              t("attendance.rate"),
              t("attendance.present"),
              t("attendance.late"),
              t("attendance.absent"),
              t("attendance.excused"),
            ],
            rows: attendance.map((row) => [row.groupName, row.rate, row.present, row.late, row.absent, row.excused]),
          }}
        >
          <ResponsiveContainer width="100%" height={rowsHeight(attendance.length)}>
            <BarChart data={attendance} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="groupName" width={NAME_AXIS} tickFormatter={(value: string) => shorten(value)} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={percentValue} />} />
              <Bar dataKey="rate" name={t("attendance.rate")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                <LabelList dataKey="rate" position="right" formatter={(value: unknown) => percentValue(Number(value))} style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {/* 3. Lead funnel by stage, split by source */}
        <ChartCard
          id="funnel"
          title={t("funnel.title")}
          empty={noLeads}
          csv={{
            filename: file("lead-funnel"),
            headers: [t("funnel.dimension"), t("funnel.stage"), t("funnel.leads"), t("funnel.won")],
            rows: [
              ...stages.map((row) => [t("funnel.stage"), row.name, row.leads, row.won]),
              ...sources.map((row) => [t("funnel.source"), row.name, row.leads, row.won]),
            ],
          }}
        >
          <ResponsiveContainer width="100%" height={rowsHeight(stages.length)}>
            <BarChart data={stages} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={NAME_AXIS} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={String} />} />
              <Bar dataKey="leads" name={t("funnel.leads")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                <LabelList dataKey="leads" position="right" style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <h3 className="text-body font-medium text-text">{t("funnel.bySource")}</h3>
            <Legend
              items={[
                { label: t("funnel.leads"), color: SERIES.comparison },
                { label: t("funnel.won"), color: SERIES.main },
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={sources.length * 44 + 12}>
            <BarChart data={sources} layout="vertical" barGap={2} margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={NAME_AXIS} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={String} />} />
              <Bar dataKey="leads" name={t("funnel.leads")} fill={SERIES.comparison} radius={BAR_END_RIGHT} barSize={10} isAnimationActive={false}>
                <LabelList dataKey="leads" position="right" style={VALUE_LABEL} />
              </Bar>
              <Bar dataKey="won" name={t("funnel.won")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={10} isAnimationActive={false}>
                <LabelList dataKey="won" position="right" style={VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Active students over time, with joins and leaves */}
        <ChartCard
          id="students"
          title={t("students.title")}
          empty={report.students.length === 0}
          csv={{
            filename: file("active-students"),
            headers: [t("month"), t("students.active"), t("students.joined"), t("students.left")],
            rows: report.students.map((row) => [row.month, row.active, row.joined, row.left]),
          }}
        >
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={report.students} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={monthTick} tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} padding={{ left: 16, right: 16 }} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip cursor={{ stroke: GRID }} content={<ChartTooltip formatValue={String} formatLabel={monthLabel} />} />
              <Line
                type="linear"
                dataKey="active"
                name={t("students.active")}
                stroke={SERIES.main}
                strokeWidth={2}
                dot={{ r: 4, fill: SERIES.main, stroke: "var(--bg)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: SERIES.main, stroke: "var(--bg)", strokeWidth: 2 }}
                isAnimationActive={false}
              >
                {/* Only the latest point is labelled: the rest are read off the axis or the tooltip. */}
                <LabelList
                  dataKey="active"
                  position="top"
                  style={VALUE_LABEL}
                  formatter={(value: unknown) => String(value)}
                  content={({ index, x, y, value }) =>
                    index === report.students.length - 1 ? (
                      <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" style={VALUE_LABEL}>
                        {String(value)}
                      </text>
                    ) : null
                  }
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <h3 className="text-body font-medium text-text">{t("students.flow")}</h3>
            <Legend
              items={[
                { label: t("students.joined"), color: SERIES.main },
                { label: t("students.left"), color: SERIES.comparison },
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={report.students} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={monthTick} tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip cursor={{ fill: HOVER }} content={<ChartTooltip formatValue={String} formatLabel={monthLabel} />} />
              <Bar dataKey="joined" name={t("students.joined")} fill={SERIES.main} radius={BAR_END_TOP} maxBarSize={20} isAnimationActive={false} />
              <Bar dataKey="left" name={t("students.left")} fill={SERIES.comparison} radius={BAR_END_TOP} maxBarSize={20} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 6. Debt by age */}
        {money ? (
          <ChartCard
            id="debt-age"
            title={t("debtAge.title")}
            hint={t("debtAge.hint")}
            className="lg:col-span-2"
            empty={money.debtAge.every((row) => row.amount === 0)}
            csv={{
              filename: "debt-by-age.csv",
              headers: [t("debtAge.bucket"), t("debtAge.amount"), t("debtAge.students")],
              rows: money.debtAge.map((row) => [t(`debtAge.${row.bucket}`), row.amount, row.students]),
            }}
          >
            <ResponsiveContainer width="100%" height={rowsHeight(money.debtAge.length)}>
              <BarChart
                data={money.debtAge.map((row) => ({ ...row, name: t(`debtAge.${row.bucket}`) }))}
                layout="vertical"
                margin={{ top: 0, right: MONEY_LABEL, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={NAME_AXIS} tick={TICK} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: HOVER }}
                  content={
                    <ChartTooltip
                      formatValue={moneyValue}
                      footer={(name) => {
                        const row = money.debtAge.find((entry) => t(`debtAge.${entry.bucket}`) === name);
                        return row ? t("debtAge.studentsCount", { count: row.students }) : null;
                      }}
                    />
                  }
                />
                <Bar dataKey="amount" name={t("debtAge.amount")} fill={SERIES.main} radius={BAR_END_RIGHT} barSize={14} isAnimationActive={false}>
                  <LabelList dataKey="amount" position="right" formatter={(value: unknown) => moneyValue(Number(value))} style={VALUE_LABEL} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

      </div>
    </>
  );
}
