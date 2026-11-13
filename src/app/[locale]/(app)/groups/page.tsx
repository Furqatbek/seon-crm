import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { GroupsScreen } from "@/components/groups/groups-screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { attendanceLock } from "@/lib/domain/attendance";
import { tashkentDate } from "@/lib/domain/time";
import {
  getGroups,
  getLessonSheet,
  getTeacherOptions,
  getTodayLessons,
} from "@/lib/groups/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { groupsSearchSchema } from "@/lib/validation/groups";

async function Groups({ searchParams }: { searchParams: SearchParams }) {
  const search = groupsSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const today = tashkentDate(now);
  const [todayLessons, groups, teachers, lesson] = await Promise.all([
    search.tab === "today" ? getTodayLessons(now) : null,
    search.tab === "all" ? getGroups(search) : null,
    getTeacherOptions(),
    search.lesson ? getLessonSheet(search.lesson) : null,
  ]);

  return (
    <GroupsScreen
      search={search}
      today={today}
      todayLessons={todayLessons}
      groups={groups}
      teachers={teachers}
      lesson={lesson}
      lessonLock={
        lesson
          ? attendanceLock({ lessonDate: lesson.lesson_date, status: lesson.status, today, role: user.role })
          : null
      }
    />
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("groups")} />;
}

export default async function GroupsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Groups searchParams={searchParams} />
    </Suspense>
  );
}
