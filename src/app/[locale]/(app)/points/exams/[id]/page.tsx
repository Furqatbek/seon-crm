import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ExamBuilder } from "@/components/exams/exam-builder";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { initLocale } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { getExam } from "@/lib/exams/queries";

type Props = { params: Promise<{ locale: string; id: string }> };

// One mock exam, for the owner and managers: build, preview, publish.
async function Exam({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await getCurrentUser();
  if (!user) return null;
  const exam = await getExam(id);
  if (!exam) notFound();
  return <ExamBuilder exam={exam} role={user.role} backHref="/points?tab=exams" />;
}

export default async function ExamPage(props: Props) {
  await initLocale(props.params);
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <Exam {...props} />
    </Suspense>
  );
}
