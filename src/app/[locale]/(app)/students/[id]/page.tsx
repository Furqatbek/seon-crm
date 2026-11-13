import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { AttendanceTab, type AttendanceGroup } from "@/components/students/attendance-tab";
import { LedgerTab } from "@/components/students/ledger-tab";
import { MessagesTab } from "@/components/students/messages-tab";
import { OverviewTab } from "@/components/students/overview-tab";
import { StudentScreen } from "@/components/students/student-screen";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { attendanceRate } from "@/lib/domain/attendance";
import { balanceState, buildLedger } from "@/lib/domain/ledger";
import { tashkentDate } from "@/lib/domain/time";
import { getOpenGroups } from "@/lib/groups/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import {
  getCentreBilling,
  getStudent,
  getStudentAttendance,
  getStudentLedger,
  getStudentMessages,
  type StudentDetail,
} from "@/lib/students/queries";
import { studentSearchSchema } from "@/lib/validation/students";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: SearchParams;
};

async function Ledger({ id }: { id: string }) {
  const { charges, payments } = await getStudentLedger(id);
  // The running balance is computed oldest first, then shown newest first.
  return <LedgerTab entries={buildLedger(charges, payments).reverse()} />;
}

async function Attendance({
  student,
  month,
  currentMonth,
}: {
  student: StudentDetail;
  month: string;
  currentMonth: string;
}) {
  const lessons = await getStudentAttendance(student, month);
  const groups: AttendanceGroup[] = student.enrolments
    .flatMap((enrolment) => (enrolment.group ? [enrolment.group] : []))
    .filter((group, index, all) => all.findIndex((other) => other.id === group.id) === index)
    .map((group) => {
      const own = lessons.filter((lesson) => lesson.group_id === group.id);
      return {
        id: group.id,
        name: group.name,
        lessons: own,
        rate: attendanceRate(
          own.flatMap((lesson) => (lesson.mark && lesson.status !== "cancelled" ? [lesson.mark] : [])),
        ),
      };
    })
    .filter((group) => group.lessons.length > 0);

  return <AttendanceTab month={month} currentMonth={currentMonth} groups={groups} />;
}

async function Messages({ id }: { id: string }) {
  return <MessagesTab messages={await getStudentMessages(id)} />;
}

async function Student({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getCurrentUser();
  if (!user) return null;
  const { tab, month, enrol } = studentSearchSchema.parse(firstValues(await searchParams));

  const [student, billing, openGroups] = await Promise.all([
    getStudent(id),
    getCentreBilling(),
    getOpenGroups(),
  ]);
  if (!student) notFound();

  const today = tashkentDate(new Date());
  const currentMonth = today.slice(0, 7);

  return (
    <StudentScreen
      student={student}
      balanceState={balanceState(student.balance, {
        today,
        dueDay: billing.dueDay,
        oldestUnpaidMonth: student.oldestUnpaidMonth,
      })}
      role={user.role}
      tab={tab}
      openGroups={openGroups}
      today={today}
      autoEnrol={enrol === "1"}
    >
      {tab === "overview" ? (
        <OverviewTab
          student={student}
          botUsername={billing.botUsername}
          openGroups={openGroups}
          today={today}
        />
      ) : null}
      {tab === "ledger" ? <Ledger id={student.id} /> : null}
      {tab === "attendance" ? (
        <Attendance
          student={student}
          // Never a future month.
          month={month && month <= currentMonth ? month : currentMonth}
          currentMonth={currentMonth}
        />
      ) : null}
      {tab === "messages" ? <Messages id={student.id} /> : null}
    </StudentScreen>
  );
}

// The id is only known at request time, so the whole page streams in.
export default function StudentPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Student {...props} />
    </Suspense>
  );
}
