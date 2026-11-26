"use client";

import { ArrowLeft, CalendarDays, Coins, Minus, Plus, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CoinsText } from "@/components/coins/coins-text";
import { BoardPeriodControl, Leaderboard } from "@/components/points/leaderboard";
import { PointsSheet, type PointsTarget } from "@/components/points/points-sheet";
import { PointsText } from "@/components/points/points-text";
import { ExamControl } from "@/components/groups/exam-control";
import { LESSON_TONE, hhmm, type Weekday } from "@/components/groups/group-meta";
import { Badge } from "@/components/ui/badge";
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
import { ATTENDANCE_STATUSES, MARK_TONE, type AttendanceStatus } from "@/lib/domain/attendance";
import { roomLabel } from "@/lib/domain/rooms";
import { useInstantClose } from "@/lib/hooks/use-instant-close";
import { formatDay } from "@/lib/format";
import type { BoardRow, PointPreset } from "@/lib/points/queries";
import { saveMyAttendance, setMyLessonExam } from "@/lib/teacher/actions";
import type { MyGroup, MyLesson, MyLessonSheet } from "@/lib/teacher/queries";
import { TEACHER_COIN_CHOICES, type CoinsErrorKey } from "@/lib/validation/coins";
import type { GroupErrorKey } from "@/lib/validation/groups";

type CoinChoice = `${(typeof TEACHER_COIN_CHOICES)[number]}`;

/** What the lesson screen needs to give and take points; null while the programme is off. */
export type LessonPoints = {
  maxPerAction: number;
  presets: PointPreset[];
  /** This month's points in the group: student id → points. */
  month: Record<string, number>;
};

/** Present / Late / Absent / Excused for everyone in the lesson, then Save. */
function AttendanceForm({
  lesson,
  points,
  exam,
  onClose,
}: {
  lesson: MyLessonSheet;
  points: LessonPoints | null;
  /** Whether the lesson is marked as an exam, and its title. */
  exam: { isExam: boolean; title: string | null };
  onClose: () => void;
}) {
  // The + / − sheet opens inside this one, so choosing in it does not close the lesson.
  const [pointsTarget, onPoints] = useState<PointsTarget | null>(null);
  const t = useTranslations("groups");
  const tMine = useTranslations("myGroups");
  const tPoints = useTranslations("points");
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
        {lesson.status === "cancelled" ? null : (
          <ExamControl lessonId={lesson.id} isExam={exam.isExam} title={exam.title} save={setMyLessonExam} />
        )}
        {locked ? (
          <p className="mb-3 rounded-control bg-bg-subtle px-3 py-2 text-footnote text-text-secondary">
            {lesson.status === "cancelled" ? tMine("lessonCancelled") : t("lesson.locked.tooOld")}
          </p>
        ) : null}
        {lesson.students.length === 0 ? (
          <p className="py-6 text-center text-body text-text-secondary">{t("lesson.noStudents")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {lesson.students.map((student) => (
              <li key={student.id} className="flex flex-col gap-2 py-3" data-lesson-student={student.id}>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-body text-text">{student.full_name}</span>
                  {/* Only students still in the group have a total, and only they can be given points. */}
                  {points && student.id in points.month ? (
                    <>
                      <PointsText
                        value={points.month[student.id] ?? 0}
                        className="text-footnote text-text-secondary"
                      />
                      <Button
                        size="icon"
                        aria-label={tPoints("takeFrom", { name: student.full_name })}
                        data-points="deduction"
                        onClick={() => onPoints({ student: { id: student.id, name: student.full_name }, kind: "deduction" })}
                      >
                        <Minus aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        aria-label={tPoints("giveTo", { name: student.full_name })}
                        data-points="award"
                        onClick={() => onPoints({ student: { id: student.id, name: student.full_name }, kind: "award" })}
                      >
                        <Plus aria-hidden />
                      </Button>
                    </>
                  ) : null}
                </span>
                <SegmentedControl
                  aria-label={student.full_name}
                  fullWidth
                  disabled={locked}
                  value={marks[student.id]}
                  onValueChange={(status) => setMarks((all) => ({ ...all, [student.id]: status }))}
                  options={ATTENDANCE_STATUSES.map((status) => ({ value: status, label: t(`lesson.mark.${status}`), tone: MARK_TONE[status] }))}
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
      {points ? (
        <PointsSheet
          target={pointsTarget}
          groupId={lesson.groupId}
          lessonId={lesson.id}
          presets={points.presets}
          maxPerAction={points.maxPerAction}
          onClose={() => onPoints(null)}
        />
      ) : null}
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
  points,
  board,
  today,
}: {
  group: MyGroup;
  /** The group's points leaderboard; null when it cannot be read. */
  board: { rows: BoardRow[]; period: "month" | "all" } | null;
  lessons: MyLesson[];
  students: CoinRow[];
  /** Null when the points programme is off, or no lesson is open. */
  points: LessonPoints | null;
  /** The lesson whose attendance sheet is open (?lesson=…), or null. */
  lesson: MyLessonSheet | null;
  today: string;
}) {
  const t = useTranslations("myGroups");
  const tGroups = useTranslations("groups");
  const tCoins = useTranslations("coins");
  const tPoints = useTranslations("points");
  const tDays = useTranslations("common.weekdays");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [giving, setGiving] = useState<CoinRow | null>(null);
  const lessonSheet = useInstantClose(lesson?.id ?? null, () => router.replace(pathname, { scroll: false }));
  const closeLesson = lessonSheet.close;
  // The list knows whether the open lesson is an exam.
  const openLesson = lesson ? lessons.find((row) => row.id === lesson.id) : undefined;

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
                  {row.lesson_date === today ? <StatusPill tone="brand">{t("today")}</StatusPill> : null}
                  <StatusPill tone={LESSON_TONE[row.status]}>{tGroups(`lesson.statuses.${row.status}`)}</StatusPill>
                  {row.kind === "exam" ? <Badge tone="warning">{row.exam_title}</Badge> : null}
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

      {board ? (
        <section aria-labelledby="my-board" className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="my-board" className="text-headline text-text">
              {tPoints("board.title")}
            </h2>
            <BoardPeriodControl period={board.period} month={today.slice(0, 7)} currentMonth={today.slice(0, 7)} months={false} />
          </div>
          <Leaderboard rows={board.rows} staff={false} />
        </section>
      ) : null}

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

      <Sheet open={lessonSheet.open} onOpenChange={(open) => !open && closeLesson()}>
        <SheetContent>
          {lesson ? (
            <>
              <SheetHeader>
                <SheetTitle>{t("attendance")}</SheetTitle>
                <SheetDescription className="numeric">
                  {group.name} · {formatDay(lesson.lesson_date, locale, { month: "long" })} · {hhmm(lesson.start_time)}
                </SheetDescription>
              </SheetHeader>
              <AttendanceForm
                key={lesson.id}
                lesson={lesson}
                points={points}
                exam={{ isExam: openLesson?.kind === "exam", title: openLesson?.exam_title ?? null }}
                onClose={closeLesson}
              />
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
