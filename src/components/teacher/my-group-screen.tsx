"use client";

import { ArrowLeft, CalendarDays, Coins, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CoinsText } from "@/components/coins/coins-text";
import { LESSON_TONE, hhmm, type Weekday } from "@/components/groups/group-meta";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { giveCoins } from "@/lib/coins/actions";
import type { CoinRow } from "@/lib/coins/queries";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/domain/attendance";
import { roomLabel } from "@/lib/domain/rooms";
import { formatDay } from "@/lib/format";
import { saveMyAttendance } from "@/lib/teacher/actions";
import type { MyGroup, MyLesson, MyLessonSheet } from "@/lib/teacher/queries";
import { TEACHER_COIN_CHOICES, type CoinsErrorKey } from "@/lib/validation/coins";
import type { GroupErrorKey } from "@/lib/validation/groups";

type CoinChoice = `${(typeof TEACHER_COIN_CHOICES)[number]}`;

/** Present / Late / Absent / Excused for everyone in the lesson, then Save. */
function AttendanceForm({ lesson, onClose }: { lesson: MyLessonSheet; onClose: () => void }) {
  const t = useTranslations("groups");
  const tMine = useTranslations("myGroups");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<GroupErrorKey | null>(null);
  // Everyone starts as Present; tap to switch.
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(lesson.students.map((student) => [student.id, student.mark ?? "present"])),
  );
  const locked = !lesson.can_mark;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveMyAttendance({
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
        {locked ? (
          <p className="mb-3 rounded-control bg-bg-subtle px-3 py-2 text-footnote text-text-secondary">
            {lesson.status === "cancelled" ? tMine("lessonCancelled") : t("lesson.locked.future")}
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
                  disabled={locked}
                  value={marks[student.id]}
                  onValueChange={(status) => setMarks((all) => ({ ...all, [student.id]: status }))}
                  options={ATTENDANCE_STATUSES.map((status) => ({ value: status, label: t(`lesson.mark.${status}`) }))}
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
          {tCommon(locked ? "close" : "cancel")}
        </Button>
        {locked || lesson.students.length === 0 ? null : (
          <Button variant="primary" disabled={pending} onClick={save}>
            {tCommon("save")}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

/** 1, 2, 3, 5 or 10 coins and, if the teacher likes, what they are for. */
function GiveCoinsForm({ groupId, student, onClose }: { groupId: string; student: CoinRow; onClose: () => void }) {
  const t = useTranslations("coins");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<CoinsErrorKey | null>(null);
  const [amount, setAmount] = useState<CoinChoice>("1");
  const [reason, setReason] = useState("");

  function give(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await giveCoins({ group_id: groupId, student_id: student.studentId, amount: Number(amount), reason });
      if (!result.ok) return setError(result.error);
      toast(t("given", { count: Number(amount), name: student.fullName }));
      onClose();
    });
  }

  return (
    <form onSubmit={give} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("howMany")} htmlFor="coins-amount">
          <SegmentedControl
            aria-label={t("howMany")}
            fullWidth
            value={amount}
            onValueChange={setAmount}
            options={TEACHER_COIN_CHOICES.map((choice) => ({ value: `${choice}` as CoinChoice, label: `${choice}` }))}
          />
        </Field>
        <Field label={t("reasonOptional")} htmlFor="coins-reason">
          <Input id="coins-reason" value={reason} maxLength={200} autoComplete="off" onChange={(event) => setReason(event.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("give")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * One of the teacher's groups: lessons to mark and the students ranked by the
 * coins they earned here. Names only: no phones, parents or money.
 */
export function MyGroupScreen({
  group,
  lessons,
  students,
  lesson,
  today,
}: {
  group: MyGroup;
  lessons: MyLesson[];
  students: CoinRow[];
  /** The lesson whose attendance sheet is open (?lesson=…), or null. */
  lesson: MyLessonSheet | null;
  today: string;
}) {
  const t = useTranslations("myGroups");
  const tGroups = useTranslations("groups");
  const tCoins = useTranslations("coins");
  const tDays = useTranslations("common.weekdays");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [giving, setGiving] = useState<CoinRow | null>(null);
  const closeLesson = () => router.replace(pathname, { scroll: false });

  return (
    <>
      <Link
        href="/my-groups"
        className="mb-2 inline-flex items-center gap-1 rounded-inner text-footnote text-text-secondary outline-none motion-fast hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("title")}
      </Link>
      <PageHeader title={group.name}>
        <span className="text-body text-text-secondary">
          {group.days.map((day) => tDays(String(day) as Weekday)).join(", ")} ·{" "}
          <span className="numeric">{hhmm(group.start_time)}</span>
          {group.room ? ` · ${roomLabel(group.room)}` : ""}
        </span>
      </PageHeader>

      <section aria-labelledby="my-lessons" className="mb-8">
        <h2 id="my-lessons" className="mb-3 text-headline text-text">
          {t("lessons")}
        </h2>
        {lessons.length === 0 ? (
          <EmptyState icon={CalendarDays}>{t("noLessons")}</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border">
            {lessons.map((row) => (
              <li
                key={row.id}
                data-my-lesson={row.lesson_date}
                data-today={row.lesson_date === today ? "true" : undefined}
                className="flex min-h-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium whitespace-nowrap text-text numeric">
                    {formatDay(row.lesson_date, locale, { month: "long" })} · {hhmm(row.start_time)}
                  </span>
                  {row.lesson_date === today ? <StatusPill tone="purple">{t("today")}</StatusPill> : null}
                  <StatusPill tone={LESSON_TONE[row.status]}>{tGroups(`lesson.statuses.${row.status}`)}</StatusPill>
                </span>
                {row.can_mark ? (
                  <Button
                    variant={row.marked === 0 ? "secondary" : "ghost"}
                    onClick={() => router.push(`${pathname}?lesson=${row.id}`, { scroll: false })}
                  >
                    {row.marked === 0 ? t("mark") : t("editMarks")}
                    <span className="sr-only">
                      {" "}
                      {formatDay(row.lesson_date, locale, { month: "long" })}
                    </span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-students">
        <h2 id="my-students" className="mb-3 text-headline text-text">
          {t("ranking")}
        </h2>
        {students.length === 0 ? (
          <EmptyState icon={UserPlus}>{tGroups("studentsTab.empty")}</EmptyState>
        ) : (
          <ol className="divide-y divide-border rounded-card border border-border">
            {students.map((row) => (
              <li
                key={row.studentId}
                data-coin-row={row.studentId}
                className="flex min-h-row items-center gap-3 px-4 py-2"
              >
                <span className="w-6 shrink-0 text-center text-text-secondary numeric" data-cell="rank">
                  <span className="sr-only">{tCoins("place")} </span>
                  {row.earned > 0 ? row.rank : "—"}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-text" data-cell="name">
                    {row.fullName}
                  </span>
                  <span className="text-footnote text-text-secondary">
                    {tCoins("balance")}: <span data-cell="balance">{row.balance}</span>
                  </span>
                </span>
                <span data-cell="earned" title={tCoins("earned")}>
                  <CoinsText value={row.earned} label={`${tCoins("earned")}: ${tCoins("count", { count: row.earned })}`} />
                </span>
                <Button variant="secondary" onClick={() => setGiving(row)} className="max-sm:px-2.5">
                  <Coins aria-hidden />
                  <span className="max-sm:sr-only">{tCoins("give")}</span>
                  <span className="sr-only">: {row.fullName}</span>
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Sheet open={lesson !== null} onOpenChange={(open) => !open && closeLesson()}>
        <SheetContent>
          {lesson ? (
            <>
              <SheetHeader>
                <SheetTitle>{t("attendance")}</SheetTitle>
                <SheetDescription className="numeric">
                  {group.name} · {formatDay(lesson.lesson_date, locale, { month: "long" })} · {hhmm(lesson.start_time)}
                </SheetDescription>
              </SheetHeader>
              <AttendanceForm key={lesson.id} lesson={lesson} onClose={closeLesson} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={giving !== null} onOpenChange={(open) => !open && setGiving(null)}>
        <SheetContent>
          {giving ? (
            <>
              <SheetHeader>
                <SheetTitle>{tCoins("giveTitle", { name: giving.fullName })}</SheetTitle>
                <SheetDescription>{tCoins("giveHint")}</SheetDescription>
              </SheetHeader>
              <GiveCoinsForm key={giving.studentId} groupId={group.id} student={giving} onClose={() => setGiving(null)} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
