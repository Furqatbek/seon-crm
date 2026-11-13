"use client";

import { Ban, ClipboardCheck, Ellipsis, RotateCcw, UserRoundCog } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { MonthNav } from "@/components/shared/month-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isoWeekday } from "@/lib/domain/time";
import { formatDay } from "@/lib/format";
import { cancelLesson, restoreLesson, setLessonTeacher } from "@/lib/groups/actions";
import type { MonthLesson, TeacherOption } from "@/lib/groups/queries";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { GroupErrorKey } from "@/lib/validation/groups";

import { LESSON_TONE, hhmm, type Weekday } from "./group-meta";

type Pending = { kind: "cancel" | "substitute"; lesson: MonthLesson };

/** The month's lessons: open one to mark it, cancel or restore it, set a substitute. */
export function GroupLessonsTab({
  month,
  currentMonth,
  maxMonth,
  lessons,
  teachers,
  groupTeacherId,
}: {
  month: string;
  currentMonth: string;
  maxMonth: string;
  lessons: MonthLesson[];
  teachers: TeacherOption[];
  groupTeacherId: string;
}) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tDays = useTranslations("common.weekdays");
  const locale = useLocale();
  const { setParams } = useUrlState();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState<GroupErrorKey | null>(null);
  const [busy, startTransition] = useTransition();

  function start(next: Pending) {
    setError(null);
    setReason("");
    setTeacherId(next.lesson.teacher.id);
    setPending(next);
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: GroupErrorKey }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        if (pending) setError(result.error);
        else toast(t(`errors.${result.error}`));
        return;
      }
      setPending(null);
      toast(done);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <MonthNav
        month={month}
        max={maxMonth}
        onChange={(next) => setParams({ month: next === currentMonth ? null : next })}
      />
      {lessons.length === 0 ? (
        <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
          {t("attendanceGrid.noLessons")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("lesson.date")}</TableHead>
              <TableHead>{t("lesson.time")}</TableHead>
              <TableHead>{t("fields.teacher")}</TableHead>
              <TableHead>{t("fields.status")}</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lessons.map((lesson) => (
              <TableRow
                key={lesson.id}
                data-lesson-row={lesson.lesson_date}
                data-lesson-status={lesson.status}
                onClick={() => setParams({ lesson: lesson.id }, { push: true })}
              >
                <TableCell className="whitespace-nowrap numeric">
                  {formatDay(lesson.lesson_date, locale)}
                  <span className="text-text-secondary">
                    {" · "}
                    {tDays(String(isoWeekday(lesson.lesson_date)) as Weekday)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap numeric">{hhmm(lesson.start_time)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    {lesson.teacher.full_name}
                    {lesson.teacher.id !== groupTeacherId ? (
                      <Badge tone="purple">{t("lesson.substitute")}</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <StatusPill tone={LESSON_TONE[lesson.status]}>
                      {t(`lesson.statuses.${lesson.status}`)}
                    </StatusPill>
                    {lesson.status === "cancelled" && lesson.cancel_reason ? (
                      <span className="text-footnote text-text-secondary">{lesson.cancel_reason}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="px-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("lesson.actions", { date: formatDay(lesson.lesson_date, locale) })}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Ellipsis aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => setParams({ lesson: lesson.id }, { push: true })}>
                        <ClipboardCheck aria-hidden />
                        {t("lesson.open")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => start({ kind: "substitute", lesson })}>
                        <UserRoundCog aria-hidden />
                        {t("lesson.setSubstitute")}
                      </DropdownMenuItem>
                      {lesson.status === "cancelled" ? (
                        <DropdownMenuItem
                          onSelect={() => run(() => restoreLesson(lesson.id), t("lesson.restored"))}
                        >
                          <RotateCcw aria-hidden />
                          {t("lesson.restore")}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem variant="destructive" onSelect={() => start({ kind: "cancel", lesson })}>
                          <Ban aria-hidden />
                          {t("lesson.cancel")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          {pending ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                if (pending.kind === "cancel") {
                  run(() => cancelLesson({ lesson_id: pending.lesson.id, reason }), t("lesson.cancelled"));
                } else {
                  run(
                    () => setLessonTeacher({ lesson_id: pending.lesson.id, teacher_id: teacherId }),
                    t("lesson.substituteSaved"),
                  );
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {t(pending.kind === "cancel" ? "lesson.cancelTitle" : "lesson.substituteTitle", {
                    date: formatDay(pending.lesson.lesson_date, locale, { month: "long" }),
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t(pending.kind === "cancel" ? "lesson.cancelBody" : "lesson.substituteBody")}
                </DialogDescription>
              </DialogHeader>
              {pending.kind === "cancel" ? (
                <Field label={t("lesson.reason")} htmlFor="cancel-reason">
                  <Input
                    id="cancel-reason"
                    value={reason}
                    maxLength={300}
                    autoFocus
                    onChange={(event) => setReason(event.target.value)}
                    aria-invalid={error === "reasonRequired" || undefined}
                  />
                </Field>
              ) : (
                <Field label={t("fields.teacher")} htmlFor="substitute-teacher">
                  <Select value={teacherId} onValueChange={setTeacherId}>
                    <SelectTrigger id="substitute-teacher">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {error ? (
                <p role="alert" className="text-footnote text-danger">
                  {t(`errors.${error}`)}
                </p>
              ) : null}
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPending(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant={pending.kind === "cancel" ? "destructive-fill" : "primary"}
                  disabled={busy}
                >
                  {t(pending.kind === "cancel" ? "lesson.cancel" : "lesson.saveSubstitute")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
