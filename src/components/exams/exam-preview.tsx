"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SectionKind } from "@/lib/domain/exams";
import type { ExamDetail, ExamPassage, ExamQuestion } from "@/lib/exams/queries";

/** A passage as it is read or heard. */
export function PassageView({ passage, media, transcript = false }: { passage: ExamPassage; media: Record<string, string>; transcript?: boolean }) {
  const t = useTranslations("exams");
  return (
    <div className="flex flex-col gap-2" data-slot="passage">
      {passage.kind === "audio" ? (
        passage.audio_path && media[passage.audio_path] ? (
          <audio controls preload="none" src={media[passage.audio_path]} className="w-full" aria-label={t("audio")} />
        ) : (
          <p className="text-footnote text-warning">{t("audioNotYet")}</p>
        )
      ) : null}
      {passage.image_path && media[passage.image_path] ? (
        // A short-lived signed link to a private file: not something to optimise or cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media[passage.image_path]} alt="" className="max-h-72 w-full rounded-control object-contain" />
      ) : null}
      {/* What a recording says is for the review, not for the player who is listening. */}
      {passage.text && (passage.kind === "text" || transcript) ? <p className="text-body whitespace-pre-wrap text-text">{passage.text}</p> : null}
    </div>
  );
}

/** A question's choices, as a player sees them: nothing says which is right. */
export function ChoicesView({ question, media, marked = false }: { question: ExamQuestion; media: Record<string, string>; marked?: boolean }) {
  const t = useTranslations("exams");
  return (
    <ol className="flex flex-col gap-1.5">
      {question.options.map((option) => {
        const right = marked && option.id === question.correct_option_id;
        return (
          <li key={option.id} data-right={right || undefined} className={`flex items-center gap-2 rounded-control border px-3 py-1.5 text-body ${right ? "border-success bg-success-tint" : "border-border"}`}>
            <span className="text-footnote text-text-secondary uppercase">{option.id}</span>
            {option.image_path && media[option.image_path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media[option.image_path]} alt="" className="max-h-24 rounded-control object-contain" />
            ) : null}
            {option.text ? <span className="text-text">{option.text}</span> : null}
            {right ? <span className="ml-auto text-footnote text-success">{t("rightAnswer")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** The exam as a student meets it: listening, then reading, each question with its passage and no answers. */
export function ExamPreview({ exam, open, onClose }: { exam: ExamDetail; open: boolean; onClose: () => void }) {
  const t = useTranslations("exams");
  const [kind, setKind] = useState<SectionKind>("listening");
  const section = exam.sections.find((candidate) => candidate.kind === kind);
  const questions = exam.questions.filter((question) => question.section_id === section?.id);
  const passages = new Map(exam.passages.map((passage) => [passage.id, passage]));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{exam.title}</DialogTitle>
          <DialogDescription>{t("previewHint", { plays: exam.audio_max_plays })}</DialogDescription>
        </DialogHeader>
        <SegmentedControl
          aria-label={t("section")}
          value={kind}
          onValueChange={setKind}
          options={exam.sections.map((candidate) => ({ value: candidate.kind, label: `${t(`sections.${candidate.kind}`)} · ${t("minutes", { minutes: Math.round(candidate.time_limit_sec / 60) })}` }))}
        />
        <div className="flex flex-col gap-5" data-slot="exam-preview">
          {questions.length === 0 ? <p className="text-body text-text-secondary">{t("noQuestions")}</p> : null}
          {questions.map((question, index) => {
            // A passage is shown once, above the first of its questions.
            const passage = question.passage_id && question.passage_id !== questions[index - 1]?.passage_id ? passages.get(question.passage_id) : undefined;
            return (
              <div key={question.id} className="flex flex-col gap-2">
                {passage ? (
                  <div className="rounded-control bg-bg-subtle p-3">
                    <PassageView passage={passage} media={exam.media} />
                  </div>
                ) : null}
                <p className="text-body font-medium text-text">
                  <span className="numeric">{index + 1}.</span> {question.prompt}
                </p>
                <ChoicesView question={question} media={exam.media} />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
