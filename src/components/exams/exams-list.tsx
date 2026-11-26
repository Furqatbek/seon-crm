"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { EXAM_PRESETS } from "@/lib/domain/exams";
import { createExam } from "@/lib/exams/actions";
import type { ExamSummary } from "@/lib/exams/queries";
import { createExamSchema, type ExamErrorKey } from "@/lib/validation/exams";
import type { z } from "zod";

type NewExam = z.input<typeof createExamSchema>;

function NewExamForm({ basePath, onClose }: { basePath: string; onClose: () => void }) {
  const t = useTranslations("exams");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ExamErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<NewExam>({ resolver: zodResolver(createExamSchema), defaultValues: { title: "", preset: EXAM_PRESETS[0].key } });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await createExam(values);
      if (!result.ok) return setError(result.error);
      onClose();
      router.push(`${basePath}/${result.data.id}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("title")} htmlFor="exam-title" error={errors.title?.message ? t(`errors.${errors.title.message as ExamErrorKey}`) : null}>
          <Input id="exam-title" autoComplete="off" maxLength={120} aria-invalid={errors.title ? true : undefined} {...register("title")} />
        </Field>
        <Field label={t("preset")} htmlFor="exam-preset">
          <Controller
            control={control}
            name="preset"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="exam-preset">
                  <SelectValue>{t(`presets.${field.value as (typeof EXAM_PRESETS)[number]["key"]}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXAM_PRESETS.map((preset) => (
                    <SelectItem key={preset.key} value={preset.key}>
                      {t(`presets.${preset.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <ul className="flex flex-col gap-1 text-footnote text-text-secondary" data-slot="preset-table">
            {EXAM_PRESETS.map((preset) => (
              <li key={preset.key}>
                {t(`presets.${preset.key}`)}: {t("presetLine", { listeningQuestions: preset.listening.questions, listeningMinutes: preset.listening.minutes, readingQuestions: preset.reading.questions, readingMinutes: preset.reading.minutes })}
              </li>
            ))}
          </ul>
          <p className="text-footnote text-text-secondary">{t("presetHint")}</p>
        </Field>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("create")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Every mock exam: its level, whether it is published, how much of it is written and how it has been used. */
export function ExamsList({ exams, basePath }: { exams: ExamSummary[]; basePath: string }) {
  const t = useTranslations("exams");
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4" data-slot="exams">
      <Button variant="primary" onClick={() => setCreating(true)} className="self-start">
        <Plus aria-hidden />
        {t("new")}
      </Button>
      {exams.length === 0 ? (
        <EmptyState icon={ClipboardList}>{t("empty")}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("title")}</TableHead>
              <TableHead>{t("level")}</TableHead>
              <TableHead>{t("status.label")}</TableHead>
              <TableHead>{t("written")}</TableHead>
              <TableHead className="text-right">{t("attempts")}</TableHead>
              <TableHead className="text-right">{t("average")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams.map((exam) => {
              const asked = exam.sections.reduce((sum, section) => sum + section.question_count, 0);
              return (
                <TableRow key={exam.id} data-exam={exam.id} data-status={exam.status}>
                  <TableCell>
                    <Link href={`${basePath}/${exam.id}`} className="font-medium text-brand-ink hover:text-brand-ink-hover">
                      {exam.title}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t(`levels.${exam.level}`)}</TableCell>
                  <TableCell>
                    <StatusPill tone={exam.status === "published" ? "success" : "neutral"}>{t(`status.${exam.status}`)}</StatusPill>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col text-footnote text-text-secondary">
                      {exam.sections.map((section) => (
                        <span key={section.id} className="whitespace-nowrap">
                          {t(`sections.${section.kind}`)}: <span className="numeric text-text">{section.written}/{section.question_count}</span> · {t("minutes", { minutes: Math.round(section.time_limit_sec / 60) })}
                        </span>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap numeric">{exam.attempts > 0 ? t("attemptsBy", { attempts: exam.attempts, players: exam.players }) : "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap numeric">{exam.average === null ? "—" : `${exam.average} / ${asked}`}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Sheet open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("new")}</SheetTitle>
          </SheetHeader>
          {creating ? <NewExamForm basePath={basePath} onClose={() => setCreating(false)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
