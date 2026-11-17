import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { PointsScreen } from "@/components/points/points-screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import { getLeaderboard } from "@/lib/points/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getGroupOptions } from "@/lib/students/queries";
import { boardSearchSchema } from "@/lib/validation/points";

// Points for staff: the leaderboard of the centre or of one group.
async function Points({ searchParams }: { searchParams: SearchParams }) {
  const search = boardSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  const currentMonth = tashkentDate(new Date()).slice(0, 7);
  // Never a future month.
  const month = search.month && search.month <= currentMonth ? search.month : currentMonth;
  const [groups, rows] = await Promise.all([
    getGroupOptions(),
    getLeaderboard({ groupId: search.group, period: search.period, month }),
  ]);

  return (
    <PointsScreen
      rows={rows ?? []}
      groups={groups}
      group={search.group && groups.some((group) => group.id === search.group) ? search.group : undefined}
      period={search.period}
      month={month}
      currentMonth={currentMonth}
    />
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("points")} />;
}

export default async function PointsPage({ params, searchParams }: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Points searchParams={searchParams} />
    </Suspense>
  );
}
