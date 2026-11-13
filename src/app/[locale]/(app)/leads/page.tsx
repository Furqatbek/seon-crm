import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { LeadsScreen } from "@/components/leads/leads-screen";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import {
  getBoardLeads,
  getFollowUps,
  getLead,
  getListLeads,
  getStaff,
  getTrialGroups,
} from "@/lib/leads/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { leadsSearchSchema } from "@/lib/validation/leads";

async function Leads({ searchParams }: { searchParams: SearchParams }) {
  const search = leadsSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const [staff, groups, followUps, board, list, selected] = await Promise.all([
    getStaff(),
    getTrialGroups(),
    getFollowUps(now),
    search.view === "board" ? getBoardLeads(search, now) : null,
    search.view === "list" ? getListLeads(search, search.page) : null,
    search.lead ? getLead(search.lead) : null,
  ]);

  return (
    <LeadsScreen
      search={search}
      board={board}
      list={list}
      followUps={followUps}
      selected={selected}
      staff={staff}
      groups={groups}
      user={{ id: user.id, role: user.role }}
      nowIso={now.toISOString()}
    />
  );
}

function LeadsFallback() {
  const t = useTranslations("nav");
  return <PageHeader title={t("leads")} />;
}

export default async function LeadsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<LeadsFallback />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}
