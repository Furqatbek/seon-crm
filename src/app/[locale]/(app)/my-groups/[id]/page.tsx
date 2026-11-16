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
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getMyGroups, getMyLessonSheet, getMyLessons } from "@/lib/teacher/queries";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

const searchSchema = z.object({ lesson: z.uuid().optional().catch(undefined) });

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

  const [lessons, students, sheet] = await Promise.all([
    getMyLessons(id),
    getGroupCoins(id),
    search.lesson ? getMyLessonSheet(search.lesson) : null,
  ]);
  if (!lessons) notFound();

  return (
    <MyGroupScreen
      group={group}
      lessons={lessons}
      students={students}
      // A lesson of another group is not opened here.
      lesson={sheet && sheet.groupId === id ? sheet : null}
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
