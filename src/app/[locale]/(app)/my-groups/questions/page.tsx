import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { QuestionsList } from "@/components/questions/questions-list";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { getPointsSettings } from "@/lib/points/queries";
import { getBanks, getQuestions } from "@/lib/questions/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { questionsSearchSchema } from "@/lib/validation/questions";

// The game questions of the signed-in teacher's own subjects: write, edit and
// preview. Switching one on or off and importing a file are staff's.
async function Questions({ searchParams, title }: { searchParams: SearchParams; title: string }) {
  const user = await getTeacherUser();
  if (!user) return null;
  const search = questionsSearchSchema.parse(firstValues(await searchParams));
  const [list, banks, settings] = await Promise.all([getQuestions(search), getBanks(), getPointsSettings()]);
  return (
    <>
      <PageHeader title={title} />
      <QuestionsList rows={list.rows} total={list.total} flagged={list.flagged} banks={banks} search={search} role="teacher" minQuestions={settings.game_min_questions} />
    </>
  );
}

export default async function TeacherQuestionsPage({ params, searchParams }: LocaleParams & { searchParams: SearchParams }) {
  const locale = await initLocale(params);
  const title = (await getTranslations({ locale, namespace: "nav" }))("questions");
  return (
    <Suspense fallback={<ListSkeleton title={title} />}>
      <Questions searchParams={searchParams} title={title} />
    </Suspense>
  );
}
