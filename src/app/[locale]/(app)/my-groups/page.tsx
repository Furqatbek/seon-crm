import { Suspense } from "react";

import { MyGroupsScreen } from "@/components/teacher/my-groups-screen";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { getMyGroups } from "@/lib/teacher/queries";

// A teacher's start page. Staff have Groups; this page shows them nothing.
async function MyGroups() {
  const user = await getTeacherUser();
  if (!user) return null;
  return <MyGroupsScreen groups={await getMyGroups()} />;
}

export default async function MyGroupsPage({ params }: LocaleParams) {
  await initLocale(params);
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <MyGroups />
    </Suspense>
  );
}
