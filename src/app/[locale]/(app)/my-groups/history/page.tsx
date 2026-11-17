import { Suspense } from "react";

import { PointsHistoryScreen } from "@/components/teacher/points-history-screen";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { getPointPresets, getTeacherPointsHistory } from "@/lib/points/queries";

// Every point the signed-in teacher gave or took this month.
async function History() {
  const user = await getTeacherUser();
  if (!user) return null;
  const [rows, presets] = await Promise.all([
    getTeacherPointsHistory(),
    getPointPresets({ activeOnly: false, withArchived: true }),
  ]);
  return <PointsHistoryScreen rows={rows} presets={presets} />;
}

export default async function PointsHistoryPage({ params }: LocaleParams) {
  await initLocale(params);
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <History />
    </Suspense>
  );
}
