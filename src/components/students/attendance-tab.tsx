"use client";

import { Check, ChevronLeft, ChevronRight, Clock, Minus, X, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/domain/attendance";
import { formatDay, formatMonth } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { StudentLesson } from "@/lib/students/queries";
import { cn } from "@/lib/utils";

const MARK_ICON: Record<AttendanceStatus, LucideIcon> = {
  present: Check,
  late: Clock,
  absent: X,
  excused: Minus,
};

const MARK_CLASS: Record<AttendanceStatus, string> = {
  present: "bg-success-tint text-success",
  late: "bg-warning-tint text-warning",
  absent: "bg-danger-tint text-danger",
  excused: "bg-bg-subtle text-text-secondary",
};

export type AttendanceGroup = {
  id: string;
  name: string;
  /** Whole percent, or null when nothing was marked. */
  rate: number | null;
  lessons: StudentLesson[];
};

function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}

function LessonCell({ lesson }: { lesson: StudentLesson }) {
  const t = useTranslations("students.attendance");
  const locale = useLocale();
  const cancelled = lesson.status === "cancelled";
  const Icon = lesson.mark ? MARK_ICON[lesson.mark] : null;
  const label = cancelled ? t("cancelled") : lesson.mark ? t(`mark.${lesson.mark}`) : t("notMarked");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li
          tabIndex={0}
          data-mark={cancelled ? "cancelled" : (lesson.mark ?? "none")}
          className={cn(
            "flex size-11 flex-col items-center justify-center rounded-control border border-border text-caption outline-none focus-visible:ring-3 focus-visible:ring-focus-ring",
            lesson.mark && !cancelled && cn("border-transparent", MARK_CLASS[lesson.mark]),
            cancelled && "text-text-tertiary line-through",
            !lesson.mark && !cancelled && "text-text-secondary",
          )}
        >
          <span className="numeric">{Number(lesson.lesson_date.slice(8, 10))}</span>
          {Icon && !cancelled ? <Icon className="size-3.5" aria-hidden /> : null}
          <span className="sr-only">{label}</span>
        </li>
      </TooltipTrigger>
      <TooltipContent>
        {formatDay(lesson.lesson_date, locale)} · {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** A month of lessons per group with the student's marks and attendance rate. */
export function AttendanceTab({
  month,
  currentMonth,
  groups,
}: {
  /** "YYYY-MM" */
  month: string;
  currentMonth: string;
  groups: AttendanceGroup[];
}) {
  const t = useTranslations("students.attendance");
  const locale = useLocale();
  const { setParams } = useUrlState();
  const go = (next: string) => setParams({ month: next === currentMonth ? null : next });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={t("previousMonth")} onClick={() => go(shiftMonth(month, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <span className="min-w-36 text-center text-body font-medium text-text" data-attendance-month={month}>
          {formatMonth(month, locale)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("nextMonth")}
          disabled={month >= currentMonth}
          onClick={() => go(shiftMonth(month, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            aria-label={group.name}
            className="flex flex-col gap-3 rounded-card border border-border p-4"
          >
            <h2 className="flex flex-wrap items-center justify-between gap-2 text-headline text-text">
              {group.name}
              <span className="text-body font-normal text-text-secondary numeric" data-attendance-rate={group.rate ?? ""}>
                {group.rate === null ? t("noRate") : t("rate", { rate: group.rate })}
              </span>
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {group.lessons.map((lesson) => (
                <LessonCell key={lesson.id} lesson={lesson} />
              ))}
            </ul>
          </section>
        ))
      )}

      <ul className="flex flex-wrap gap-2" aria-label={t("legend")}>
        {ATTENDANCE_STATUSES.map((status) => (
          <li key={status}>
            <StatusPill
              tone={status === "present" ? "success" : status === "late" ? "warning" : status === "absent" ? "danger" : "neutral"}
              icon={MARK_ICON[status]}
            >
              {t(`mark.${status}`)}
            </StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}
