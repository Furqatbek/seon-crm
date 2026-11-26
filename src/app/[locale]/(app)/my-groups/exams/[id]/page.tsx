import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ExamBuilder } from "@/components/exams/exam-builder";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { initLocale } from "@/i18n/params";
import { getTeacherUser } from "@/lib/auth";
import { getExam } from "@/lib/exams/queries";

type Props = { params: Promise<{ locale: string; id: string }> };

// One mock exam, for a teacher: build and preview. Publishing is the owner's and the managers'.
async function Exam({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await getTeacherUser();
  if (!user) return null;
  const exam = await getExam(id);
  if (!exam) notFound();
  return <ExamBuilder exam={exam} role={"teacher"} backHref="/my-groups/exams" />;
}

export default async function ExamPage(props: Props) {
  await initLocale(props.params);
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <Exam {...props} />
    </Suspense>
  );
}
