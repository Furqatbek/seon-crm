import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ExamBuilder } from "@/components/exams/exam-builder";
import { ExamsList } from "@/components/exams/exams-list";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { ExamDetail, ExamQuestion, ExamSummary } from "@/lib/exams/queries";

const exams: ExamSummary[] = [
  {
    id: "1",
    title: "TOPIK I · 1-sinov",
    level: "topik1",
    status: "published",
    sections: [
      { id: "l1", kind: "listening", question_count: 30, time_limit_sec: 2400, written: 30 },
      { id: "r1", kind: "reading", question_count: 40, time_limit_sec: 3600, written: 40 },
    ],
    attempts: 48,
    players: 37,
    average: 44.6,
  },
  {
    id: "2",
    title: "TOPIK II · internet shakli",
    level: "topik2",
    status: "draft",
    sections: [
      { id: "l2", kind: "listening", question_count: 30, time_limit_sec: 2100, written: 12 },
      { id: "r2", kind: "reading", question_count: 30, time_limit_sec: 2400, written: 0 },
    ],
    attempts: 0,
    players: 0,
    average: null,
  },
];

const question = (id: string, section: string, position: number, changes: Partial<ExamQuestion>): ExamQuestion => ({
  id,
  section_id: section,
  passage_id: null,
  position,
  prompt: "들은 것과 같은 것을 고르십시오.",
  options: ["학교에 갑니다.", "집에 있습니다.", "친구를 만납니다.", "밥을 먹습니다."].map((text, index) => ({ id: "abcd"[index], text, image_path: null })),
  correct_option_id: "a",
  explanation: null,
  ...changes,
});

const detail = (status: "draft" | "published"): ExamDetail => ({
  id: "2",
  title: "TOPIK I · 2-sinov",
  level: "topik1",
  status,
  audio_max_plays: 1,
  coins_per_correct: 2,
  thresholds: [
    { level: 1, min_correct: 28 },
    { level: 2, min_correct: 49 },
  ],
  sections: [
    { id: "l", kind: "listening", question_count: 30, time_limit_sec: 2400, written: 2 },
    { id: "r", kind: "reading", question_count: 40, time_limit_sec: 3600, written: 2 },
  ],
  passages: [
    { id: "p1", section_id: "l", kind: "audio", text: "여자: 어디에 가요? 남자: 학교에 가요.", image_path: null, audio_path: "2/track-01.mp3", position: 1 },
    { id: "p2", section_id: "l", kind: "audio", text: null, image_path: null, audio_path: null, position: 2 },
    { id: "p3", section_id: "r", kind: "text", text: "저는 주말에 친구와 같이 영화를 봤습니다. 영화가 아주 재미있었습니다. 다음 주에도 영화를 보러 갈 겁니다.", image_path: null, audio_path: null, position: 1 },
  ],
  questions: [
    question("q1", "l", 1, { passage_id: "p1", explanation: "남자는 학교에 갑니다." }),
    question("q2", "l", 2, { passage_id: "p2", prompt: "여자는 무엇을 합니까?", correct_option_id: "c" }),
    question("q3", "r", 1, { passage_id: "p3", prompt: "이 사람은 주말에 무엇을 했습니까?", options: ["영화를 봤습니다.", "책을 읽었습니다.", "운동을 했습니다."].map((text, index) => ({ id: "abc"[index], text, image_path: null })) }),
    question("q4", "r", 2, { passage_id: "p3", prompt: "글의 내용과 같은 것을 고르십시오.", correct_option_id: "b" }),
  ],
  media: {},
});

type Props = LocaleParams & { searchParams: Promise<{ view?: string; role?: string; status?: string }> };

async function Preview({ searchParams }: Pick<Props, "searchParams">) {
  const { view, role, status } = await searchParams;
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 sm:p-8">
      {view === "builder" ? (
        <ExamBuilder exam={detail(status === "published" ? "published" : "draft")} role={role === "teacher" ? "teacher" : role === "manager" ? "manager" : "owner"} backHref="/dev/exams" />
      ) : (
        <>
          <PageHeader title="Mock exams" />
          <ExamsList exams={exams} basePath="/dev/exams" />
        </>
      )}
    </div>
  );
}

// Development only: the mock exams list and builder with made-up exams,
// without a database. ?view=builder, ?role=owner | manager | teacher, ?status=published
export default async function DevExamsPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  await initLocale(params);
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}
