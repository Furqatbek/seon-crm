"use client";

import { useLocale, useTranslations } from "next-intl";

import { MonthNav } from "@/components/shared/month-nav";
import { MARK_CLASS, MARK_ICON } from "@/components/students/attendance-tab";
import { formatDay } from "@/lib/format";
import type { GroupMonth } from "@/lib/groups/queries";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { cn } from "@/lib/utils";

import type { Weekday } from "./group-meta";
import { isoWeekday } from "@/lib/domain/time";

/** Students × lesson dates for a month. A date opens that lesson. */
export function GroupAttendanceTab({
  month,
  currentMonth,
  maxMonth,
  data,
  rates,
}: {
  month: string;
  currentMonth: string;
  maxMonth: string;
  data: GroupMonth;
  /** studentId → whole percent for the month, or null. */
  rates: Record<string, number | null>;
}) {
  const t = useTranslations("groups");
  const tDays = useTranslations("common.weekdays");
  const locale = useLocale();
  const { setParams } = useUrlState();

  return (
    <div className="flex flex-col gap-4">
      <MonthNav
        month={month}
        max={maxMonth}
        onChange={(next) => setParams({ month: next === currentMonth ? null : next })}
      />
      {data.lessons.length === 0 || data.students.length === 0 ? (
        <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
          {t(data.lessons.length === 0 ? "attendanceGrid.noLessons" : "attendanceGrid.noStudents")}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-border" data-slot="attendance-grid">
          <table className="min-w-full border-separate border-spacing-0 text-body">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-b border-border bg-bg-subtle px-4 py-2 text-left text-footnote font-normal text-text-secondary"
                >
                  {t("attendanceGrid.student")}
                </th>
                {data.lessons.map((lesson) => (
                  <th key={lesson.id} scope="col" className="border-b border-border bg-bg-subtle p-1 font-normal">
                    <button
                      type="button"
                      data-grid-lesson={lesson.lesson_date}
                      onClick={() => setParams({ lesson: lesson.id }, { push: true })}
                      aria-label={t("attendanceGrid.openLesson", { date: formatDay(lesson.lesson_date, locale) })}
                      className={cn(
                        "flex w-10 flex-col items-center rounded-inner py-1 text-caption text-text-secondary outline-none motion-fast hover:bg-border hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring",
                        lesson.status === "cancelled" && "line-through",
                      )}
                    >
                      <span>{tDays(String(isoWeekday(lesson.lesson_date)) as Weekday)}</span>
                      <span className="text-body font-medium text-text numeric">
                        {Number(lesson.lesson_date.slice(8, 10))}
                      </span>
                    </button>
                  </th>
                ))}
                <th
                  scope="col"
                  className="border-b border-border bg-bg-subtle px-4 py-2 text-right text-footnote font-normal text-text-secondary"
                >
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr key={student.id} data-grid-student={student.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-44 truncate border-b border-border bg-bg px-4 py-2 text-left font-normal whitespace-nowrap"
                  >
                    {student.full_name}
                  </th>
                  {data.lessons.map((lesson) => {
                    const enrolled =
                      student.joinedOn <= lesson.lesson_date &&
                      (student.leftOn === null || student.leftOn >= lesson.lesson_date);
                    const mark = data.marks[`${lesson.id}:${student.id}`];
                    const Icon = mark ? MARK_ICON[mark] : null;
                    const label = !enrolled
                      ? t("attendanceGrid.notEnrolled")
                      : mark
                        ? t(`lesson.mark.${mark}`)
                        : t("attendanceGrid.notMarked");
                    return (
                      <td key={lesson.id} className="border-b border-border p-1 text-center">
                        <span
                          data-mark={mark ?? (enrolled ? "none" : "out")}
                          title={label}
                          className={cn(
                            "mx-auto flex size-8 items-center justify-center rounded-inner text-text-tertiary",
                            mark && lesson.status !== "cancelled" && MARK_CLASS[mark],
                          )}
                        >
                          {Icon && lesson.status !== "cancelled" ? (
                            <Icon className="size-4" aria-hidden />
                          ) : enrolled ? (
                            "·"
                          ) : null}
                          <span className="sr-only">{label}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-b border-border px-4 py-2 text-right text-text-secondary numeric">
                    {rates[student.id] == null ? "—" : `${rates[student.id]}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
