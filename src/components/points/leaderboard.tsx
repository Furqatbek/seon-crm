"use client";

import { Trophy } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status-pill";
import { MonthNav } from "@/components/shared/month-nav";
import { Link } from "@/i18n/navigation";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { BoardRow } from "@/lib/points/queries";
import { BOARD_PERIODS, type BoardPeriod } from "@/lib/validation/points";
import { cn } from "@/lib/utils";

import { PointsText } from "./points-text";

/** This month or all-time, and for a month the month to look at. Kept in the URL. */
export function BoardPeriodControl({
  period,
  month,
  currentMonth,
  months = true,
}: {
  period: BoardPeriod;
  /** The month on show, "YYYY-MM". */
  month: string;
  currentMonth: string;
  /** False where only this month and all-time are offered. */
  months?: boolean;
}) {
  const t = useTranslations("points.board");
  const { setParams } = useUrlState();
  return (
    <div className="flex flex-wrap items-center gap-2" data-slot="board-period">
      <SegmentedControl
        aria-label={t("period")}
        value={period}
        onValueChange={(next) => setParams({ period: next === "month" ? null : next, month: null })}
        options={BOARD_PERIODS.map((option) => ({ value: option, label: t(`periods.${option}`) }))}
      />
      {months && period === "month" ? (
        <MonthNav month={month} max={currentMonth} onChange={(next) => setParams({ month: next === currentMonth ? null : next })} />
      ) : null}
    </div>
  );
}

/**
 * A ranked list: place, name, points. Ties share a place. Purple marks only
 * first place. Staff get links to the students and see who is hidden from the
 * TV; a teacher gets names only.
 */
export function Leaderboard({ rows, staff }: { rows: BoardRow[]; staff: boolean }) {
  const t = useTranslations("points.board");

  if (rows.length === 0) return <EmptyState icon={Trophy}>{t("empty")}</EmptyState>;

  return (
    <ol className="divide-y divide-border rounded-card border border-border" data-slot="leaderboard">
      {rows.map((row) => {
        const placed = row.points > 0;
        return (
          <li
            key={row.studentId}
            data-board-row={row.studentId}
            data-rank={placed ? row.rank : undefined}
            data-points={row.points}
            className="flex min-h-row items-center gap-3 px-4 py-2"
          >
            <span
              className={cn(
                "w-8 shrink-0 text-center numeric",
                placed && row.rank === 1 ? "font-semibold text-purple" : "text-text-secondary",
              )}
            >
              <span className="sr-only">{t("place")} </span>
              {placed ? row.rank : "—"}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {staff ? (
                <Link
                  href={`/students/${row.studentId}?tab=points`}
                  className="truncate rounded-inner font-medium text-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-focus-ring"
                >
                  {row.name}
                </Link>
              ) : (
                <span className="truncate font-medium text-text">{row.name}</span>
              )}
              {staff && row.hidden ? <StatusPill>{t("hidden")}</StatusPill> : null}
            </span>
            <PointsText value={row.points} className={cn("font-medium", placed ? "text-text" : "text-text-secondary")} />
          </li>
        );
      })}
    </ol>
  );
}
