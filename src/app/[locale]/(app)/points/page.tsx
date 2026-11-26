import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { BoardTab, PointsScreen } from "@/components/points/points-screen";
import { RequestsTab } from "@/components/points/requests-tab";
import { RewardsTab } from "@/components/points/rewards-tab";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import { getLeaderboard, getOpenRequestCount, getRedemptions, getRewards } from "@/lib/points/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getGroupOptions } from "@/lib/students/queries";
import { pointsSearchSchema } from "@/lib/validation/points";

type Search = ReturnType<typeof pointsSearchSchema.parse>;

async function Board({ search }: { search: Search }) {
  const currentMonth = tashkentDate(new Date()).slice(0, 7);
  // Never a future month.
  const month = search.month && search.month <= currentMonth ? search.month : currentMonth;
  const [groups, rows] = await Promise.all([
    getGroupOptions(),
    getLeaderboard({ groupId: search.group, period: search.period, month }),
  ]);
  return (
    <BoardTab
      rows={rows ?? []}
      groups={groups}
      group={search.group && groups.some((group) => group.id === search.group) ? search.group : undefined}
      period={search.period}
      month={month}
      currentMonth={currentMonth}
    />
  );
}

// Points for staff: the leaderboard, the rewards catalogue and the reward requests.
async function Points({ searchParams }: { searchParams: SearchParams }) {
  const search = pointsSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <PointsScreen tab={search.tab} openRequests={await getOpenRequestCount()}>
      {search.tab === "leaderboard" ? <Board search={search} /> : null}
      {search.tab === "rewards" ? <RewardsTab rewards={await getRewards({ activeOnly: false })} role={user.role} /> : null}
      {search.tab === "requests" ? <RequestsTab rows={await getRedemptions()} /> : null}
    </PointsScreen>
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("points")} tabs={3} />;
}

export default async function PointsPage({ params, searchParams }: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Points searchParams={searchParams} />
    </Suspense>
  );
}
