"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArrowLeft, Eye, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Link, useRouter } from "@/i18n/navigation";
import { EXAM_LEVELS, LEVELS_OF } from "@/lib/domain/exams";
import { removeExamItem, saveExamSettings, setExamStatus } from "@/lib/exams/actions";
import type { ExamDetail, ExamPassage, ExamQuestion, ExamSection } from "@/lib/exams/queries";
import { examSettingsSchema, type ExamErrorKey, type ExamSettingsInput, type ExamSettingsValues } from "@/lib/validation/exams";

import { ChoicesView, ExamPreview, PassageView } from "./exam-preview";
import { ExamImportSheet, ExamQuestionSheet, PassageSheet } from "./exam-sheets";

/** The exam's own numbers: every one of them stays editable after the preset. */
function SettingsForm({ exam, locked }: { exam: ExamDetail; locked: boolean }) {
  const t = useTranslations("exams");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ExamErrorKey | null>(null);
  const listening = exam.sections.find((section) => section.kind === "listening");
  const reading = exam.sections.find((section) => section.kind === "reading");
  // One box per level the exam can estimate; an empty box is no threshold.
  const [thresholds, setThresholds] = useState<Record<number, string>>(Object.fromEntries(exam.thresholds.map((threshold) => [threshold.level, String(threshold.min_correct)])));
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ExamSettingsInput, unknown, ExamSettingsValues>({
    resolver: zodResolver(examSettingsSchema),
    defaultValues: {
      id: exam.id,
      title: exam.title,
      level: exam.level,
      audio_max_plays: exam.audio_max_plays,
      coins_per_correct: exam.coins_per_correct === null ? "" : String(exam.coins_per_correct),
      listening_questions: listening?.question_count ?? 1,
      listening_minutes: Math.round((listening?.time_limit_sec ?? 60) / 60),
      reading_questions: reading?.question_count ?? 1,
      reading_minutes: Math.round((reading?.time_limit_sec ?? 60) / 60),
      thresholds: [],
    },
  });
  const level = useWatch({ control, name: "level" });
  const invalid = Object.values(errors)[0]?.message as ExamErrorKey | undefined;

  const onValid = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await saveExamSettings({ ...values, coins_per_correct: values.coins_per_correct === null ? "" : String(values.coins_per_correct) });
      if (!result.ok) setError(result.error);
      else toast(t("saved"));
    });
  });

  function submit(event: React.FormEvent) {
    // The thresholds are their own boxes: gathered here, checked with the rest.
    setValue(
      "thresholds",
      LEVELS_OF[level].flatMap((each) => (thresholds[each]?.trim() ? [{ level: each, min_correct: thresholds[each].trim() }] : [])),
    );
    return onValid(event);
  }

  const number = (name: "listening_questions" | "listening_minutes" | "reading_questions" | "reading_minutes", label: string) => (
    <Field label={label} htmlFor={`exam-${name}`}>
      <Input id={`exam-${name}`} type="number" min={1} inputMode="numeric" className="numeric" disabled={locked} aria-invalid={errors[name] ? true : undefined} {...register(name)} />
    </Field>
  );

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-4 rounded-card border border-border p-4"
      data-slot="exam-settings"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("title")} htmlFor="exam-title" className="sm:col-span-2">
          <Input id="exam-title" autoComplete="off" maxLength={120} disabled={locked} aria-invalid={errors.title ? true : undefined} {...register("title")} />
        </Field>
        <Field label={t("level")} htmlFor="exam-level">
          <Controller
            control={control}
            name="level"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={locked}>
                <SelectTrigger id="exam-level">
                  <SelectValue>{t(`levels.${field.value}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXAM_LEVELS.map((each) => (
                    <SelectItem key={each} value={each}>
                      {t(`levels.${each}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label={t("audioPlays")} htmlFor="exam-plays">
          <Controller
            control={control}
            name="audio_max_plays"
            render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))} disabled={locked}>
                <SelectTrigger id="exam-plays">
                  <SelectValue>{t("plays", { count: Number(field.value) })}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[1, 2].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {t("plays", { count })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {number("listening_questions", t("listeningQuestions"))}
        {number("listening_minutes", t("listeningMinutes"))}
        {number("reading_questions", t("readingQuestions"))}
        {number("reading_minutes", t("readingMinutes"))}
        <Field label={t("coinsPerCorrect")} htmlFor="exam-coins" className="sm:col-span-2">
          <Input id="exam-coins" inputMode="numeric" autoComplete="off" className="numeric" disabled={locked} aria-invalid={errors.coins_per_correct ? true : undefined} {...register("coins_per_correct")} />
          <p className="text-footnote text-text-secondary">{t("coinsPerCorrectHint")}</p>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2" data-slot="thresholds">
        <legend className="text-body font-medium text-text">{t("thresholds")}</legend>
        <p className="text-footnote text-text-secondary">{t("thresholdsHint")}</p>
        <div className="flex flex-wrap gap-3">
          {LEVELS_OF[level].map((each) => (
            <Field key={each} label={t("thresholdLevel", { level: each })} htmlFor={`exam-threshold-${each}`} className="w-36">
              <Input
                id={`exam-threshold-${each}`}
                inputMode="numeric"
                autoComplete="off"
                className="numeric"
                disabled={locked}
                value={thresholds[each] ?? ""}
                onChange={(event) => setThresholds((current) => ({ ...current, [each]: event.target.value }))}
              />
            </Field>
          ))}
        </div>
      </fieldset>
      {error || invalid ? (
        <p role="alert" className="text-footnote text-danger">
          {t(`errors.${(error ?? invalid) as ExamErrorKey}`)}
        </p>
      ) : null}
      {locked ? null : (
        <Button type="submit" variant="primary" disabled={pending} className="self-start">
          {tCommon("save")}
        </Button>
      )}
    </form>
  );
}

function QuestionCard({ question, number, media, locked, onEdit, onRemove }: { question: ExamQuestion; number: number; media: Record<string, string>; locked: boolean; onEdit: () => void; onRemove: () => void }) {
  const t = useTranslations("exams");
  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-3" data-question={question.id}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-medium text-text">
          <span className="numeric">{number}.</span> {question.prompt}
        </p>
        {locked ? null : (
          <span className="flex shrink-0 gap-1">
            <Button variant="ghost" onClick={onEdit} aria-label={`${t("editQuestion")}: ${question.prompt}`}>
              <Pencil aria-hidden />
            </Button>
            <Button variant="ghost" onClick={onRemove} aria-label={`${t("remove")}: ${question.prompt}`}>
              <Trash2 aria-hidden />
            </Button>
          </span>
        )}
      </div>
      <ChoicesView question={question} media={media} marked />
      {question.explanation ? <p className="text-footnote text-text-secondary">{question.explanation}</p> : null}
    </div>
  );
}

/**
 * One exam: its settings, then each section with its passages and their
 * questions. A draft is built here; a published exam is read only until it is
 * unpublished. Publishing is the owner's and the managers'.
 */
export function ExamBuilder({ exam, role, backHref }: { exam: ExamDetail; role: "owner" | "manager" | "teacher"; backHref: string }) {
  const t = useTranslations("exams");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ key: ExamErrorKey; detail?: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [passageTarget, setPassageTarget] = useState<{ section: ExamSection; passage: ExamPassage | null } | null>(null);
  const [questionTarget, setQuestionTarget] = useState<{ section: ExamSection; question: ExamQuestion | null } | null>(null);
  const locked = exam.status === "published";
  const staff = role !== "teacher";
  // A question's number is its place in its section, whatever was removed before it.
  const numberOf = new Map(exam.sections.flatMap((section) => exam.questions.filter((question) => question.section_id === section.id).map((question, index) => [question.id, index + 1] as const)));

  function status(action: "publish" | "unpublish" | "archive") {
    setError(null);
    startTransition(async () => {
      const result = await setExamStatus({ id: exam.id, action });
      if (!result.ok) return setError({ key: result.error, detail: result.detail });
      toast(t(`done.${action}`));
      if (action === "archive") router.push(backHref);
    });
  }

  function remove(kind: "passage" | "question", id: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeExamItem({ kind, id });
      if (!result.ok) setError({ key: result.error });
    });
  }

  return (
    <div className="flex flex-col gap-6" data-slot="exam-builder" data-status={exam.status}>
      <PageHeader
        title={exam.title}
        subtitle={
          <Link href={backHref} className="inline-flex items-center gap-1 text-brand-ink hover:text-brand-ink-hover">
            <ArrowLeft aria-hidden className="size-4" />
            {t("all")}
          </Link>
        }
        action={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={locked ? "success" : "neutral"}>{t(`status.${exam.status}`)}</StatusPill>
            <Button onClick={() => setPreview(true)}>
              <Eye aria-hidden />
              {t("preview")}
            </Button>
            {locked ? null : (
              <Button onClick={() => setImporting(true)}>
                <FileUp aria-hidden />
                {t("import.open")}
              </Button>
            )}
            {staff ? (
              <Button variant="primary" disabled={pending} onClick={() => status(locked ? "unpublish" : "publish")}>
                {t(locked ? "unpublish" : "publish")}
              </Button>
            ) : null}
            {role === "owner" ? (
              <Button variant="ghost" disabled={pending} onClick={() => status("archive")} aria-label={t("archive")}>
                <Archive aria-hidden />
              </Button>
            ) : null}
          </span>
        }
      />
      {locked ? <p className="rounded-control bg-bg-subtle px-3 py-2 text-footnote text-text-secondary">{t(staff ? "lockedStaff" : "lockedTeacher")}</p> : null}
      {!staff && !locked ? <p className="text-footnote text-text-secondary">{t("teacherNote")}</p> : null}
      {error ? (
        <p role="alert" className="rounded-control bg-danger-tint px-3 py-2 text-footnote text-danger">
          {error.key === "sectionIncomplete" && (error.detail === "listening" || error.detail === "reading") ? t("errors.sectionIncompleteIn", { section: t(`sections.${error.detail}`) }) : t(`errors.${error.key}`)}
        </p>
      ) : null}

      <SettingsForm key={`${exam.status}:${exam.level}`} exam={exam} locked={locked} />

      {exam.sections.map((section) => {
        const passages = exam.passages.filter((passage) => passage.section_id === section.id);
        const questions = exam.questions.filter((question) => question.section_id === section.id);
        const alone = questions.filter((question) => !question.passage_id || !passages.some((passage) => passage.id === question.passage_id));
        return (
          <section key={section.id} className="flex flex-col gap-3" data-section={section.kind}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-title text-text">
                {t(`sections.${section.kind}`)}{" "}
                <span className={`text-body numeric ${section.written === section.question_count ? "text-success" : "text-warning"}`} data-cell="written">
                  {t("writtenOf", { written: section.written, of: section.question_count })}
                </span>
              </h2>
              {locked ? null : (
                <span className="flex flex-wrap gap-2">
                  <Button onClick={() => setPassageTarget({ section, passage: null })}>
                    <Plus aria-hidden />
                    {t("addPassage")}
                  </Button>
                  <Button onClick={() => setQuestionTarget({ section, question: null })}>
                    <Plus aria-hidden />
                    {t("addQuestion")}
                  </Button>
                </span>
              )}
            </div>
            {passages.length === 0 && questions.length === 0 ? <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-body text-text-secondary">{t("sectionEmpty")}</p> : null}
            {passages.map((passage, index) => (
              <div key={passage.id} className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4" data-passage={passage.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-footnote font-medium text-text-secondary">
                    {t("passageNumber", { number: index + 1 })} · {t(`kinds.${passage.kind}`)}
                  </p>
                  {locked ? null : (
                    <span className="flex shrink-0 gap-1">
                      <Button variant="ghost" onClick={() => setPassageTarget({ section, passage })} aria-label={`${t("editPassage")}: ${index + 1}`}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button variant="ghost" onClick={() => remove("passage", passage.id)} aria-label={`${t("remove")}: ${t("passageNumber", { number: index + 1 })}`}>
                        <Trash2 aria-hidden />
                      </Button>
                    </span>
                  )}
                </div>
                <PassageView passage={passage} media={exam.media} transcript />
                {questions
                  .filter((question) => question.passage_id === passage.id)
                  .map((question) => (
                    <div key={question.id} className="rounded-control bg-bg">
                      <QuestionCard question={question} number={numberOf.get(question.id) ?? 0} media={exam.media} locked={locked} onEdit={() => setQuestionTarget({ section, question })} onRemove={() => remove("question", question.id)} />
                    </div>
                  ))}
              </div>
            ))}
            {alone.map((question) => (
              <QuestionCard key={question.id} question={question} number={numberOf.get(question.id) ?? 0} media={exam.media} locked={locked} onEdit={() => setQuestionTarget({ section, question })} onRemove={() => remove("question", question.id)} />
            ))}
          </section>
        );
      })}

      <ExamPreview exam={exam} open={preview} onClose={() => setPreview(false)} />
      <ExamImportSheet examId={exam.id} open={importing} onClose={() => setImporting(false)} />
      <PassageSheet examId={exam.id} target={passageTarget} onClose={() => setPassageTarget(null)} />
      <ExamQuestionSheet examId={exam.id} media={exam.media} target={questionTarget} passages={exam.passages} onClose={() => setQuestionTarget(null)} />
    </div>
  );
}
