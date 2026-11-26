import { notFound } from "next/navigation";
import { Suspense } from "react";

import { QuestionsList } from "@/components/questions/questions-list";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { BankOption, QuestionRow } from "@/lib/questions/queries";
import { questionsSearchSchema } from "@/lib/validation/questions";

const banks: BankOption[] = [
  { subject: "TOPIK", level: "topik1", activeQuestions: 42 },
  { subject: "TOPIK", level: "topik2", activeQuestions: 18 },
  { subject: "Matematika", level: "7-sinf", activeQuestions: 31 },
];

const options = (texts: string[]) => texts.map((text, index) => ({ id: "abcd"[index], text }));
const question = (id: string, changes: Partial<QuestionRow>): QuestionRow => ({
  id,
  subject: "TOPIK",
  level: "topik1",
  language: "ko",
  text: "‘학교’ soʻzining maʼnosi nima?",
  imageUrl: null,
  image_path: null,
  options: options(["Maktab", "Kasalxona", "Bozor", "Uy"]),
  correct_option_id: "a",
  explanation: "학교 = maktab.",
  difficulty: 1,
  is_active: true,
  times_used: 64,
  times_correct: 41,
  flag: null,
  ...changes,
});

const rows: QuestionRow[] = [
  question("1", {}),
  question("2", { text: "다음 중 맞는 문장을 고르십시오.", level: "topik2", difficulty: 2, options: options(["저는 학교에 갑니다.", "저는 학교를 갑니다에."]), times_used: 120, times_correct: 9, flag: "tooHard" }),
  question("3", { text: "‘감사합니다’ nimani anglatadi?", times_used: 88, times_correct: 87, flag: "tooEasy", options: options(["Rahmat", "Kechirasiz", "Xayr"]) }),
  question("4", { subject: "Matematika", level: "7-sinf", language: "uz", text: "2x + 6 = 14 boʻlsa, x nechaga teng?", options: options(["3", "4", "5", "8"]), correct_option_id: "b", difficulty: 2, times_used: 7, times_correct: 5 }),
  question("5", { text: "‘오늘’ soʻzining tarjimasi qaysi?", is_active: false, times_used: 0, times_correct: 0, difficulty: 3 }),
];

type Props = LocaleParams & { searchParams: Promise<{ role?: string; bank?: string }> };

async function Preview({ searchParams }: Pick<Props, "searchParams">) {
  const { role, bank } = await searchParams;
  const search = questionsSearchSchema.parse({ bank });
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 sm:p-8">
      <PageHeader title="Questions" />
      <QuestionsList rows={rows} total={rows.length} flagged={2} banks={banks} search={search} role={role === "teacher" ? "teacher" : role === "manager" ? "manager" : "owner"} minQuestions={30} />
    </div>
  );
}

// Development only: the question bank with made-up questions, without a
// database. ?role=owner | manager | teacher, ?bank=TOPIK|topik2
export default async function DevQuestionsPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  await initLocale(params);
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}
