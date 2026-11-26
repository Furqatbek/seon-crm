import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { ExamsList } from "@/components/exams/exams-list";
import { BoardTab, PointsScreen } from "@/components/points/points-screen";
import { RequestsTab } from "@/components/points/requests-tab";
import { QuestionsList } from "@/components/questions/questions-list";
import { RewardsTab } from "@/components/points/rewards-tab";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import { getExams } from "@/lib/exams/queries";
import { getLeaderboard, getOpenRequestCount, getPointsSettings, getRedemptions, getRewards } from "@/lib/points/queries";
import { getBanks, getQuestions } from "@/lib/questions/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getGroupOptions } from "@/lib/students/queries";
import { pointsSearchSchema } from "@/lib/validation/points";
import { questionsSearchSchema } from "@/lib/validation/questions";

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

/** The game's question bank: every question, on or off, the import and the flags. */
async function Questions({ values, role }: { values: Record<string, string | undefined>; role: "owner" | "manager" }) {
  const search = questionsSearchSchema.parse(values);
  const [list, banks, settings] = await Promise.all([getQuestions(search), getBanks(), getPointsSettings()]);
  return <QuestionsList rows={list.rows} total={list.total} flagged={list.flagged} banks={banks} search={search} role={role} minQuestions={settings.game_min_questions} />;
}

// Points for staff: the leaderboard, the rewards catalogue, the reward requests and the game's questions.
async function Points({ searchParams }: { searchParams: SearchParams }) {
  const values = firstValues(await searchParams);
  const search = pointsSearchSchema.parse(values);
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <PointsScreen tab={search.tab} openRequests={await getOpenRequestCount()}>
      {search.tab === "leaderboard" ? <Board search={search} /> : null}
      {search.tab === "rewards" ? <RewardsTab rewards={await getRewards({ activeOnly: false })} role={user.role} /> : null}
      {search.tab === "requests" ? <RequestsTab rows={await getRedemptions()} /> : null}
      {search.tab === "questions" ? <Questions values={values} role={user.role} /> : null}
      {search.tab === "exams" ? <ExamsList exams={await getExams()} basePath="/points/exams" /> : null}
    </PointsScreen>
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("points")} tabs={5} />;
}

export default async function PointsPage({ params, searchParams }: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Points searchParams={searchParams} />
    </Suspense>
  );
}
