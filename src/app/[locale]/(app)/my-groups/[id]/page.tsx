import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { MyGroupScreen } from "@/components/teacher/my-group-screen";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { routing } from "@/i18n/routing";
import { getTeacherUser } from "@/lib/auth";
import { getGroupCoins } from "@/lib/coins/queries";
import { tashkentDate } from "@/lib/domain/time";
import { getGroupMonthPoints, getLeaderboard, getPointPresets, getPointsSettings } from "@/lib/points/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getMyGroups, getMyLessonSheet, getMyLessons } from "@/lib/teacher/queries";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

const searchSchema = z.object({
  lesson: z.uuid().optional().catch(undefined),
  // The leaderboard: this month or all-time.
  period: z.enum(["month", "all"]).catch("month"),
});

// One of the teacher's own groups. Any other group is "not found": the
// database gives a teacher nothing about it.
async function MyGroup({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getTeacherUser();
  if (!user) return null;
  const search = searchSchema.parse(firstValues(await searchParams));

  const group = (await getMyGroups()).find((candidate) => candidate.id === id);
  if (!group) notFound();

  const [lessons, students, sheet, settings, board] = await Promise.all([
    getMyLessons(id),
    getGroupCoins(id),
    search.lesson ? getMyLessonSheet(search.lesson) : null,
    getPointsSettings(),
    getLeaderboard({ groupId: id, period: search.period }),
  ]);
  if (!lessons) notFound();
  // A lesson of another group is not opened here.
  const lesson = sheet && sheet.groupId === id ? sheet : null;
  // Points are given from the open lesson, while the programme is on.
  const points =
    lesson && settings.enabled
      ? await Promise.all([getPointPresets({ activeOnly: true }), getGroupMonthPoints(id)]).then(([presets, month]) => ({
          maxPerAction: settings.max_per_action,
          presets,
          month,
        }))
      : null;

  return (
    <MyGroupScreen
      group={group}
      lessons={lessons}
      students={students}
      lesson={lesson}
      points={points}
      board={board ? { rows: board, period: search.period } : null}
      today={tashkentDate(new Date())}
    />
  );
}

export default function MyGroupPage(props: Props) {
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <MyGroup {...props} />
    </Suspense>
  );
}
