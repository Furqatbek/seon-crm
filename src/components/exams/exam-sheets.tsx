"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EXAM_OPTION_IDS, audioExtension, audioKey, type ExamOptionId } from "@/lib/domain/exams";
import { previewExamImport, saveExamImport, saveExamQuestion, savePassage, type ExamImportPreview } from "@/lib/exams/actions";
import type { ExamPassage, ExamQuestion, ExamSection } from "@/lib/exams/queries";
import { uploadExamMedia } from "@/lib/exams/upload";
import { examQuestionSchema, passageSchema, type ExamErrorKey, type ExamQuestionInput, type PassageInput } from "@/lib/validation/exams";

const NONE = "none";

function PassageForm({ examId, section, passage, onClose }: { examId: string; section: ExamSection; passage: ExamPassage | null; onClose: () => void }) {
  const t = useTranslations("exams");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ExamErrorKey | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PassageInput>({
    resolver: zodResolver(passageSchema),
    defaultValues: passage
      ? { id: passage.id, exam_id: examId, section_id: section.id, kind: passage.kind, text: passage.text ?? "", image_path: passage.image_path, audio_path: passage.audio_path }
      : { exam_id: examId, section_id: section.id, kind: section.kind === "listening" ? "audio" : "text", text: "", image_path: null, audio_path: null },
  });
  const kind = useWatch({ control, name: "kind" });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      let { audio_path: audioPath, image_path: imagePath } = values;
      // The files go to storage first; the passage then names them.
      if (values.kind === "audio" && audio) {
        audioPath = await uploadExamMedia(examId, audio, "audio");
        if (!audioPath) return setError("mediaInvalid");
      }
      if (image) {
        imagePath = await uploadExamMedia(examId, image, "image");
        if (!imagePath) return setError("mediaInvalid");
      }
      const result = await savePassage({ ...values, audio_path: audioPath, image_path: imagePath });
      if (!result.ok) return setError(result.error);
      toast(t("saved"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <SegmentedControl aria-label={t("passageKind")} value={field.value} onValueChange={field.onChange} options={[{ value: "audio", label: t("kinds.audio") }, { value: "text", label: t("kinds.text") }]} />
          )}
        />
        {kind === "audio" ? (
          <Field label={t("audioFile")} htmlFor="passage-audio">
            <Input id="passage-audio" type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4" className="h-auto py-2" onChange={(event) => setAudio(event.target.files?.[0] ?? null)} />
            <p className="text-footnote text-text-secondary">{passage?.audio_path ? t("audioReplaceHint") : t("audioHint")}</p>
          </Field>
        ) : null}
        <Field label={kind === "audio" ? t("transcript") : t("passageText")} htmlFor="passage-text" error={errors.text?.message ? t(`errors.${errors.text.message as ExamErrorKey}`) : null}>
          <Textarea id="passage-text" rows={8} maxLength={6000} {...register("text")} />
          {kind === "audio" ? <p className="text-footnote text-text-secondary">{t("transcriptHint")}</p> : null}
        </Field>
        <Field label={t("picture")} htmlFor="passage-image">
          <Input id="passage-image" type="file" accept="image/jpeg,image/png,image/webp" className="h-auto py-2" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          <p className="text-footnote text-text-secondary">{t("pictureHint")}</p>
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
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function PassageSheet({ examId, target, onClose }: { examId: string; target: { section: ExamSection; passage: ExamPassage | null } | null; onClose: () => void }) {
  const t = useTranslations("exams");
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(target?.passage ? "editPassage" : "addPassage")}</SheetTitle>
        </SheetHeader>
        {target ? <PassageForm key={target.passage?.id ?? `new-${target.section.id}`} examId={examId} section={target.section} passage={target.passage} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function QuestionForm({ examId, section, passages, question, onClose }: { examId: string; section: ExamSection; passages: ExamPassage[]; question: ExamQuestion | null; onClose: () => void }) {
  const t = useTranslations("exams");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ExamErrorKey | null>(null);
  // Pictures chosen for choices, by the choice's place; sent when the form is saved.
  const [pictures, setPictures] = useState<Record<number, File>>({});
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ExamQuestionInput>({
    resolver: zodResolver(examQuestionSchema),
    defaultValues: question
      ? {
          id: question.id,
          exam_id: examId,
          section_id: section.id,
          passage_id: question.passage_id,
          prompt: question.prompt,
          options: question.options.map((option) => ({ text: option.text ?? "", image_path: option.image_path })),
          correct: question.correct_option_id as ExamOptionId,
          explanation: question.explanation ?? "",
        }
      : { exam_id: examId, section_id: section.id, passage_id: passages.at(-1)?.id ?? null, prompt: "", options: [1, 2, 3, 4].map(() => ({ text: "", image_path: null })), correct: "a", explanation: "" },
  });
  const options = useFieldArray({ control, name: "options" });
  const [correct, passageId] = useWatch({ control, name: ["correct", "passage_id"] });
  const firstError = errors.prompt?.message ?? errors.options?.root?.message ?? errors.options?.message ?? errors.correct?.message ?? errors.explanation?.message;

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const sent = [...values.options];
      for (const [index, file] of Object.entries(pictures)) {
        if (Number(index) >= sent.length) continue;
        const path = await uploadExamMedia(examId, file, "image");
        if (!path) return setError("mediaInvalid");
        sent[Number(index)] = { ...sent[Number(index)], image_path: path };
      }
      const result = await saveExamQuestion({ ...values, options: sent });
      if (!result.ok) return setError(result.error);
      toast(t("saved"));
      onClose();
    });
  });

  function choosePicture(index: number, file: File | null) {
    setPictures((current) => {
      const next = { ...current };
      if (file) next[index] = file;
      else delete next[index];
      return next;
    });
    // Named now so the form knows the choice is not empty; the real path replaces it on save.
    setValue(`options.${index}.image_path`, file ? "pending" : null);
  }

  function removeOption(index: number) {
    const at = EXAM_OPTION_IDS.indexOf(correct);
    setValue("correct", at === index ? "a" : EXAM_OPTION_IDS[at > index ? at - 1 : at]);
    options.remove(index);
    setPictures({});
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("passage")} htmlFor="question-passage">
          <Select value={passageId ?? NONE} onValueChange={(value) => setValue("passage_id", value === NONE ? null : value)}>
            <SelectTrigger id="question-passage">
              <SelectValue>{passageId ? t("passageNumber", { number: passages.findIndex((passage) => passage.id === passageId) + 1 }) : t("noPassage")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("noPassage")}</SelectItem>
              {passages.map((passage, index) => (
                <SelectItem key={passage.id} value={passage.id}>
                  {t("passageNumber", { number: index + 1 })} · {t(`kinds.${passage.kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("prompt")} htmlFor="question-prompt">
          <Textarea id="question-prompt" maxLength={1000} aria-invalid={errors.prompt ? true : undefined} {...register("prompt")} />
        </Field>
        <fieldset className="flex flex-col gap-3" data-slot="choices">
          <legend className="text-body font-medium text-text">{t("choices")}</legend>
          <p className="text-footnote text-text-secondary">{t("choicesHint")}</p>
          {options.fields.map((option, index) => {
            const letter = EXAM_OPTION_IDS[index].toUpperCase();
            return (
              <div key={option.id} className="flex flex-col gap-1.5 rounded-control border border-border p-2">
                <div className="flex items-center gap-2">
                  <input type="radio" name="exam-correct" className="size-4 shrink-0 accent-brand" checked={correct === EXAM_OPTION_IDS[index]} onChange={() => setValue("correct", EXAM_OPTION_IDS[index])} aria-label={t("rightChoice", { letter })} />
                  <Input autoComplete="off" maxLength={300} aria-label={t("choice", { letter })} placeholder={t("choice", { letter })} {...register(`options.${index}.text`)} />
                  <Button variant="ghost" disabled={options.fields.length <= 2} onClick={() => removeOption(index)} aria-label={t("removeChoice", { letter })}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <Input type="file" accept="image/jpeg,image/png,image/webp" className="h-auto py-1.5" aria-label={t("choicePicture", { letter })} onChange={(event) => choosePicture(index, event.target.files?.[0] ?? null)} />
              </div>
            );
          })}
          {options.fields.length < EXAM_OPTION_IDS.length ? (
            <Button onClick={() => options.append({ text: "", image_path: null })} className="self-start">
              <Plus aria-hidden />
              {t("addChoice")}
            </Button>
          ) : null}
        </fieldset>
        <Field label={t("explanation")} htmlFor="question-explanation">
          <Textarea id="question-explanation" maxLength={2000} {...register("explanation")} />
        </Field>
        {error || firstError ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${(error ?? firstError) as ExamErrorKey}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function ExamQuestionSheet({ examId, target, passages, onClose }: { examId: string; target: { section: ExamSection; question: ExamQuestion | null } | null; passages: ExamPassage[]; onClose: () => void }) {
  const t = useTranslations("exams");
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(target?.question ? "editQuestion" : "addQuestion")}</SheetTitle>
        </SheetHeader>
        {target ? (
          <QuestionForm
            key={target.question?.id ?? `new-${target.section.id}`}
            examId={examId}
            section={target.section}
            passages={passages.filter((passage) => passage.section_id === target.section.id)}
            question={target.question}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Import from Excel: the sheet and the audio files it names are chosen
 * together; a report says what is ready and why each other row is not; Save
 * sends the audio and adds the rows to the draft. Nothing is saved before Save.
 */
export function ExamImportSheet({ examId, open, onClose }: { examId: string; open: boolean; onClose: () => void }) {
  const t = useTranslations("exams");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<File | null>(null);
  const [audio, setAudio] = useState<File[]>([]);
  const [report, setReport] = useState<ExamImportPreview | null>(null);
  const [error, setError] = useState<ExamErrorKey | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // What was chosen last: a report for an earlier choice is dropped.
  const latest = useRef(0);

  function close() {
    latest.current++;
    setSheet(null);
    setAudio([]);
    setReport(null);
    setError(null);
    setProgress(null);
    onClose();
  }

  function read(nextSheet: File | null, nextAudio: File[]) {
    const mine = ++latest.current;
    setSheet(nextSheet);
    setAudio(nextAudio);
    setReport(null);
    setError(null);
    if (!nextSheet) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("file", nextSheet);
      form.set("audio", JSON.stringify(nextAudio.map((file) => file.name)));
      const result = await previewExamImport(form);
      if (latest.current !== mine) return;
      if (result.ok) setReport(result.data);
      else setError(result.error);
    });
  }

  function save() {
    if (!sheet || !report) return;
    startTransition(async () => {
      // The recordings the ready rows need go to storage first.
      const paths: Record<string, string> = {};
      const byKey = new Map(audio.map((file) => [audioKey(file.name), file]));
      for (const [index, name] of report.audioNeeded.entries()) {
        const file = byKey.get(audioKey(name));
        setProgress(t("import.uploading", { done: index + 1, of: report.audioNeeded.length }));
        const path = file ? await uploadExamMedia(examId, file, "audio") : null;
        if (!path) {
          setProgress(null);
          return setError("uploadFailed");
        }
        paths[name] = path;
      }
      setProgress(null);
      const form = new FormData();
      form.set("exam_id", examId);
      form.set("file", sheet);
      form.set("audio", JSON.stringify(audio.map((file) => file.name)));
      form.set("paths", JSON.stringify(paths));
      const result = await saveExamImport(form);
      if (!result.ok) return setError(result.error);
      toast(t("import.saved", { count: result.data.questions }));
      close();
    });
  }

  const badAudio = audio.filter((file) => audioExtension(file) === null);
  const ready = report ? report.ready.listening + report.ready.reading : 0;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("import.title")}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <p className="text-body text-text-secondary">{t("import.hint")}</p>
          <Button asChild className="self-start">
            <a href="/api/exams/template" download>
              <Download aria-hidden />
              {t("import.template")}
            </a>
          </Button>
          <Field label={t("import.sheet")} htmlFor="exam-import-sheet">
            <Input id="exam-import-sheet" type="file" accept=".xlsx" className="h-auto py-2" onChange={(event) => read(event.target.files?.[0] ?? null, audio)} />
          </Field>
          <Field label={t("import.audio")} htmlFor="exam-import-audio">
            <Input id="exam-import-audio" type="file" multiple accept=".mp3,.m4a,audio/mpeg,audio/mp4" className="h-auto py-2" onChange={(event) => read(sheet, [...(event.target.files ?? [])])} />
            <p className="text-footnote text-text-secondary">{t("import.audioHint")}</p>
          </Field>
          {badAudio.length > 0 ? (
            <p role="alert" className="text-footnote text-danger">
              {t("import.badAudio", { names: badAudio.map((file) => file.name).join(", ") })}
            </p>
          ) : null}
          {pending && !report && !progress ? <p className="text-footnote text-text-secondary">{t("import.reading")}</p> : null}
          {progress ? <p className="text-footnote text-text-secondary">{progress}</p> : null}
          {error ? (
            <p role="alert" className="text-footnote text-danger">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          {report ? (
            <div className="flex flex-col gap-3" data-slot="import-report">
              <p className="text-body text-text" data-ready={ready}>
                {t("import.summary", { rows: report.rows, listening: report.ready.listening, reading: report.ready.reading, passages: report.passages, left: report.errors.length })}
              </p>
              {report.unusedAudio.length > 0 ? <p className="text-footnote text-warning">{t("import.unusedAudio", { names: report.unusedAudio.join(", ") })}</p> : null}
              {report.errors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("import.row")}</TableHead>
                      <TableHead>{t("import.problem")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.errors.map((row) => (
                      <TableRow key={row.row} data-row={row.row}>
                        <TableCell className="numeric">{row.row}</TableCell>
                        <TableCell>{row.errors.map((key) => t(`import.rowErrors.${key}`)).join(" ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={close}>
            {tCommon("cancel")}
          </Button>
          <Button variant="primary" disabled={pending || !report || ready === 0 || badAudio.length > 0} onClick={save}>
            {ready > 0 ? t("import.save", { count: ready }) : tCommon("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

