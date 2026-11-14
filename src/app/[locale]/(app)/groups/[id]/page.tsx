import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { GroupAttendanceTab } from "@/components/groups/group-attendance-tab";
import { GroupLessonsTab } from "@/components/groups/group-lessons-tab";
import { GroupScreen } from "@/components/groups/group-screen";
import { GroupStudentsTab } from "@/components/groups/group-students-tab";
import { GroupTrialsTab } from "@/components/groups/group-trials-tab";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { attendanceLock, attendanceRate } from "@/lib/domain/attendance";
import { balanceState } from "@/lib/domain/ledger";
import { shiftMonth, tashkentDate } from "@/lib/domain/time";
import {
  getGroup,
  getGroupMonth,
  getGroupStudents,
  getGroupTrials,
  getLessonSheet,
  getOpenGroups,
  getTeacherOptions,
  type OpenGroup,
  type TeacherOption,
} from "@/lib/groups/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getCentreBilling } from "@/lib/students/queries";
import { groupSearchSchema } from "@/lib/validation/groups";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: SearchParams;
};

async function Students({
  group,
  openGroups,
  today,
}: {
  group: { id: string; name: string };
  openGroups: OpenGroup[];
  today: string;
}) {
  const [students, billing] = await Promise.all([getGroupStudents(group.id), getCentreBilling()]);
  return (
    <GroupStudentsTab
      group={group}
      openGroups={openGroups}
      today={today}
      rows={students.map(({ marks, ...row }) => ({
        ...row,
        rate: attendanceRate(marks),
        balanceState: balanceState(row.balance, {
          today,
          dueDay: billing.dueDay,
          oldestUnpaidMonth: row.oldestUnpaidMonth,
        }),
      }))}
    />
  );
}

async function Attendance({ groupId, month, currentMonth }: { groupId: string; month: string; currentMonth: string }) {
  const data = await getGroupMonth(groupId, month);
  const counted = data.lessons.filter((lesson) => lesson.status !== "cancelled");
  const rates = Object.fromEntries(
    data.students.map((student) => [
      student.id,
      attendanceRate(counted.flatMap((lesson) => data.marks[`${lesson.id}:${student.id}`] ?? [])),
    ]),
  );
  return (
    <GroupAttendanceTab
      month={month}
      currentMonth={currentMonth}
      maxMonth={shiftMonth(currentMonth, 1)}
      data={data}
      rates={rates}
    />
  );
}

async function Lessons({
  groupId,
  groupTeacherId,
  month,
  currentMonth,
  teachers,
}: {
  groupId: string;
  groupTeacherId: string;
  month: string;
  currentMonth: string;
  teachers: TeacherOption[];
}) {
  const { lessons } = await getGroupMonth(groupId, month);
  return (
    <GroupLessonsTab
      month={month}
      currentMonth={currentMonth}
      maxMonth={shiftMonth(currentMonth, 1)}
      lessons={lessons}
      teachers={teachers}
      groupTeacherId={groupTeacherId}
    />
  );
}

async function Trials({ groupId }: { groupId: string }) {
  return <GroupTrialsTab visitors={await getGroupTrials(groupId, new Date())} />;
}

async function Group({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getCurrentUser();
  if (!user) return null;
  const search = groupSearchSchema.parse(firstValues(await searchParams));

  const [group, teachers, openGroups, lesson] = await Promise.all([
    getGroup(id),
    getTeacherOptions(),
    getOpenGroups(),
    search.lesson ? getLessonSheet(search.lesson) : null,
  ]);
  if (!group) notFound();

  const today = tashkentDate(new Date());
  const currentMonth = today.slice(0, 7);
  // Lessons exist up to the end of next month.
  const month = search.month && search.month <= shiftMonth(currentMonth, 1) ? search.month : currentMonth;

  return (
    <GroupScreen
      group={group}
      role={user.role}
      tab={search.tab}
      today={today}
      teachers={teachers}
      openGroups={openGroups}
      // A lesson of another group does not open here.
      lesson={lesson?.group.id === group.id ? lesson : null}
      lessonLock={
        lesson
          ? attendanceLock({ lessonDate: lesson.lesson_date, status: lesson.status, today, role: user.role })
          : null
      }
    >
      {search.tab === "students" ? (
        <Students group={{ id: group.id, name: group.name }} openGroups={openGroups} today={today} />
      ) : null}
      {search.tab === "attendance" ? (
        <Attendance groupId={group.id} month={month} currentMonth={currentMonth} />
      ) : null}
      {search.tab === "lessons" ? (
        <Lessons
          groupId={group.id}
          groupTeacherId={group.teacher_id}
          month={month}
          currentMonth={currentMonth}
          teachers={teachers}
        />
      ) : null}
      {search.tab === "trials" ? <Trials groupId={group.id} /> : null}
    </GroupScreen>
  );
}

// The id is only known at request time, so the whole page streams in.
export default function GroupPage(props: Props) {
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <Group {...props} />
    </Suspense>
  );
}
