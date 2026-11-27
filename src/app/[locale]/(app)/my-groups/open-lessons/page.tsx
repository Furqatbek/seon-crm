import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { OpenLessonsScreen } from "@/components/open-lessons/open-lessons-screen";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import { getOpenLessons } from "@/lib/offers/queries";

// A teacher's own open-lesson slots and how many booked each session. The
// editor and the Came / No-show marks are the owner's and the managers'.
async function OpenLessons({ title }: { title: string }) {
  if (!(await getTeacherUser())) return null;
  const today = tashkentDate(new Date());
  return (
    <>
      <PageHeader title={title} />
      <OpenLessonsScreen data={await getOpenLessons(today)} teachers={[]} today={today} role="teacher" />
    </>
  );
}

export default async function TeacherOpenLessonsPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const title = (await getTranslations({ locale, namespace: "nav" }))("openLessons");
  return (
    <Suspense fallback={<ListSkeleton title={title} />}>
      <OpenLessons title={title} />
    </Suspense>
  );
}
