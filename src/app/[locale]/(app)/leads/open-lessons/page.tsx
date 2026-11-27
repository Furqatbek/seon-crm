import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LeadsTabs } from "@/components/leads/leads-tabs";
import { OpenLessonsScreen } from "@/components/open-lessons/open-lessons-screen";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import { getOpenLessons } from "@/lib/offers/queries";
import { getTeacherOptions } from "@/lib/settings/queries";

// Leads → Open lessons — docs/STUDENT_APP_SPEC.md → "Rules → Free open lessons".

async function OpenLessons({ title }: { title: string }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const today = tashkentDate(new Date());
  const [data, teachers] = await Promise.all([getOpenLessons(today), getTeacherOptions()]);
  return (
    <>
      <PageHeader title={title}>
        <LeadsTabs active="openLessons" />
      </PageHeader>
      <OpenLessonsScreen data={data} teachers={teachers.map((teacher) => ({ id: teacher.id, full_name: teacher.name }))} today={today} role={user.role} />
    </>
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("leads")} />;
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await initLocale(params);
  return { title: (await getTranslations({ locale, namespace: "nav" }))("leads") };
}

export default async function OpenLessonsPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const title = (await getTranslations({ locale, namespace: "nav" }))("leads");
  return (
    <Suspense fallback={<Fallback />}>
      <OpenLessons title={title} />
    </Suspense>
  );
}
