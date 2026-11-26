import { Suspense } from "react";

import { MyGroupsScreen } from "@/components/teacher/my-groups-screen";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { getMyGroups, getMyLessonsThisMonth } from "@/lib/teacher/queries";

// A teacher's start page. Staff have Groups; this page shows them nothing.
async function MyGroups() {
  const user = await getTeacherUser();
  if (!user) return null;
  const [groups, taught] = await Promise.all([getMyGroups(), getMyLessonsThisMonth()]);
  return <MyGroupsScreen groups={groups} taught={taught} />;
}

export default async function MyGroupsPage({ params }: LocaleParams) {
  await initLocale(params);
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <MyGroups />
    </Suspense>
  );
}
