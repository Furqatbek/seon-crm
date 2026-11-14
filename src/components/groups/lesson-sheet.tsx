"use client";

import { Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import {
  ATTENDANCE_STATUSES,
  type AttendanceLock,
  type AttendanceStatus,
} from "@/lib/domain/attendance";
import { formatDay } from "@/lib/format";
import { saveAttendance } from "@/lib/groups/actions";
import type { LessonSheetData } from "@/lib/groups/queries";
import type { GroupErrorKey } from "@/lib/validation/groups";

import { LESSON_TONE, hhmm } from "./group-meta";

function Marks({
  lesson,
  lock,
  onClose,
}: {
  lesson: LessonSheetData;
  lock: AttendanceLock;
  onClose: () => void;
}) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<GroupErrorKey | null>(null);
  // Everyone starts as Present; tap to switch.
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(lesson.students.map((student) => [student.id, student.mark ?? "present"])),
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveAttendance({
        lesson_id: lesson.id,
        marks: lesson.students.map((student) => ({ student_id: student.id, status: marks[student.id] })),
      });
      if (!result.ok) return setError(result.error);
      toast(t("lesson.saved"));
      onClose();
    });
  }

  return (
    <>
      <SheetBody className="gap-0 pb-6">
        {lock ? (
          <p className="mb-3 flex items-start gap-2 rounded-control bg-bg-subtle px-3 py-2 text-footnote text-text-secondary">
            <Info className="size-4" aria-hidden />
            <span>
              {t(`lesson.locked.${lock}`)}
              {lock === "cancelled" && lesson.cancel_reason ? ` ${lesson.cancel_reason}` : ""}
            </span>
          </p>
        ) : null}
        {lesson.students.length === 0 ? (
          <p className="py-6 text-center text-body text-text-secondary">{t("lesson.noStudents")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {lesson.students.map((student) => (
              <li key={student.id} className="flex flex-col gap-2 py-3" data-lesson-student={student.id}>
                <span className="text-body text-text">{student.full_name}</span>
                <SegmentedControl
                  aria-label={student.full_name}
                  fullWidth
                  disabled={lock !== null}
                  value={marks[student.id]}
                  onValueChange={(status) => setMarks((all) => ({ ...all, [student.id]: status }))}
                  options={ATTENDANCE_STATUSES.map((status) => ({
                    value: status,
                    label: t(`lesson.mark.${status}`),
                  }))}
                />
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="pt-3 text-footnote text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon(lock ? "close" : "cancel")}
        </Button>
        {lock || lesson.students.length === 0 ? null : (
          <Button variant="primary" disabled={pending} onClick={save}>
            {tCommon("save")}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

/** One row per student with Present / Late / Absent / Excused, then Save. */
export function LessonSheet({
  lesson,
  lock,
  onClose,
}: {
  lesson: LessonSheetData | null;
  /** Why the marks cannot be changed, or null when they can. */
  lock: AttendanceLock;
  onClose: () => void;
}) {
  const t = useTranslations("groups");
  const locale = useLocale();

  return (
    <Sheet open={lesson !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {lesson ? (
          <>
            <SheetHeader>
              <SheetTitle>{lesson.group.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-body text-text-secondary">
                  <span className="numeric">
                    {formatDay(lesson.lesson_date, locale, { month: "long" })} · {hhmm(lesson.start_time)}
                  </span>
                  <StatusPill tone={LESSON_TONE[lesson.status]}>
                    <span data-lesson-status={lesson.status}>{t(`lesson.statuses.${lesson.status}`)}</span>
                  </StatusPill>
                  <span>{lesson.teacher.full_name}</span>
                  {lesson.teacher.id !== lesson.group.teacher_id ? (
                    <Badge tone="purple">{t("lesson.substitute")}</Badge>
                  ) : null}
                </div>
              </SheetDescription>
            </SheetHeader>
            <Marks key={lesson.id} lesson={lesson} lock={lock} onClose={onClose} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
