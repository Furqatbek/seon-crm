import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ExamsList } from "@/components/exams/exams-list";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { getExams } from "@/lib/exams/queries";

// Mock exams for a teacher: every exam, to build and preview. Publishing is
// the owner's and the managers'.
async function Exams({ title }: { title: string }) {
  if (!(await getTeacherUser())) return null;
  return (
    <>
      <PageHeader title={title} />
      <ExamsList exams={await getExams()} basePath="/my-groups/exams" />
    </>
  );
}

export default async function TeacherExamsPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const title = (await getTranslations({ locale, namespace: "nav" }))("exams");
  return (
    <Suspense fallback={<ListSkeleton title={title} />}>
      <Exams title={title} />
    </Suspense>
  );
}
