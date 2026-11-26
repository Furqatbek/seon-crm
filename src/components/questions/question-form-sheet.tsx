"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { OPTION_IDS, QUESTION_LANGUAGES, type OptionId } from "@/lib/domain/questions";
import { saveQuestion, uploadQuestionImage } from "@/lib/questions/actions";
import type { BankOption, QuestionRow } from "@/lib/questions/queries";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, bankKey, questionSchema, type QuestionErrorKey, type QuestionInput, type QuestionValues } from "@/lib/validation/questions";

import { bankLabel } from "./bank-label";

function Form({ question, banks, onClose }: { question: QuestionRow | null; banks: BankOption[]; onClose: () => void }) {
  const t = useTranslations("questions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<QuestionErrorKey | null>(null);
  // A newly chosen picture is uploaded when the form is saved.
  const [image, setImage] = useState<File | null>(null);
  const first = banks[0];
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<QuestionInput, unknown, QuestionValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: question
      ? {
          id: question.id,
          subject: question.subject,
          level: question.level,
          language: question.language as (typeof QUESTION_LANGUAGES)[number],
          text: question.text,
          options: question.options.map((option) => ({ text: option.text })),
          correct: question.correct_option_id as OptionId,
          explanation: question.explanation ?? "",
          difficulty: question.difficulty,
          image_path: question.image_path,
        }
      : { subject: first?.subject ?? "", level: first?.level ?? "", language: "uz", text: "", options: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }], correct: "a", explanation: "", difficulty: 2, image_path: null },
  });
  const options = useFieldArray({ control, name: "options" });
  const [subject, level, correct] = useWatch({ control, name: ["subject", "level", "correct"] });
  const message = (key: string | undefined) => (key ? t(`errors.${key as QuestionErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    if (image && (!(image.type in IMAGE_TYPES) || image.size > IMAGE_MAX_BYTES)) return setError("imageInvalid");
    startTransition(async () => {
      let imagePath = values.image_path;
      if (image) {
        const form = new FormData();
        form.set("image", image);
        const uploaded = await uploadQuestionImage(form);
        if (!uploaded.ok) return setError(uploaded.error);
        imagePath = uploaded.data.path;
      }
      const result = await saveQuestion({ ...values, explanation: values.explanation ?? "", image_path: imagePath });
      if (!result.ok) return setError(result.error);
      toast(t("saved"));
      onClose();
    });
  });

  function removeOption(index: number) {
    // The right answer stays on the same choice, or moves to the first when its own is removed.
    const at = OPTION_IDS.indexOf(correct);
    setValue("correct", at === index ? "a" : OPTION_IDS[at > index ? at - 1 : at]);
    options.remove(index);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("bank")} htmlFor="question-bank" error={message(errors.subject?.message)}>
            <Select
              value={bankKey(subject, level)}
              onValueChange={(value) => {
                const bank = banks.find((candidate) => bankKey(candidate.subject, candidate.level) === value);
                if (!bank) return;
                setValue("subject", bank.subject);
                setValue("level", bank.level);
              }}
            >
              <SelectTrigger id="question-bank">
                <SelectValue>{subject ? bankLabel(subject, level) : ""}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bankKey(bank.subject, bank.level)} value={bankKey(bank.subject, bank.level)}>
                    {bankLabel(bank.subject, bank.level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("language")} htmlFor="question-language">
            <Controller
              control={control}
              name="language"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="question-language">
                    <SelectValue>{t(`languages.${field.value}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_LANGUAGES.map((language) => (
                      <SelectItem key={language} value={language}>
                        {t(`languages.${language}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <Field label={t("text")} htmlFor="question-text" error={message(errors.text?.message)}>
          <Textarea id="question-text" maxLength={500} aria-invalid={errors.text ? true : undefined} {...register("text")} />
        </Field>
        <fieldset className="flex flex-col gap-2" data-slot="choices">
          <legend className="text-body font-medium text-text">{t("choices")}</legend>
          <p className="text-footnote text-text-secondary">{t("choicesHint")}</p>
          {options.fields.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="question-correct"
                className="size-4 shrink-0 accent-brand"
                checked={correct === OPTION_IDS[index]}
                onChange={() => setValue("correct", OPTION_IDS[index])}
                aria-label={t("rightChoice", { letter: OPTION_IDS[index].toUpperCase() })}
              />
              <Input
                autoComplete="off"
                maxLength={200}
                aria-label={t("choice", { letter: OPTION_IDS[index].toUpperCase() })}
                placeholder={t("choice", { letter: OPTION_IDS[index].toUpperCase() })}
                aria-invalid={errors.options?.[index]?.text ? true : undefined}
                {...register(`options.${index}.text`)}
              />
              <Button variant="ghost" disabled={options.fields.length <= 2} onClick={() => removeOption(index)} aria-label={t("removeChoice", { letter: OPTION_IDS[index].toUpperCase() })}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {message(errors.options?.root?.message ?? errors.options?.message ?? errors.options?.find?.((option) => option?.text)?.text?.message ?? errors.correct?.message) ? (
            <p role="alert" className="text-footnote text-danger">
              {message(errors.options?.root?.message ?? errors.options?.message ?? errors.options?.find?.((option) => option?.text)?.text?.message ?? errors.correct?.message)}
            </p>
          ) : null}
          {options.fields.length < OPTION_IDS.length ? (
            <Button onClick={() => options.append({ text: "" })} className="self-start">
              <Plus aria-hidden />
              {t("addChoice")}
            </Button>
          ) : null}
        </fieldset>
        <Field label={t("explanation")} htmlFor="question-explanation" error={message(errors.explanation?.message)}>
          <Textarea id="question-explanation" maxLength={500} {...register("explanation")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("difficultyLabel")} htmlFor="question-difficulty">
            <Controller
              control={control}
              name="difficulty"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <SelectTrigger id="question-difficulty">
                    <SelectValue>{t("difficulty", { level: Number(field.value) })}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {t("difficulty", { level: value })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label={t("image")} htmlFor="question-image">
            <Input id="question-image" type="file" accept={Object.keys(IMAGE_TYPES).join(",")} className="h-auto py-2" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
            <p className="text-footnote text-text-secondary">{t("imageHint")}</p>
          </Field>
        </div>
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

/** A teacher writes or edits a question of one of their subjects. */
export function QuestionFormSheet({ target, banks, onClose }: { target: "new" | QuestionRow | null; banks: BankOption[]; onClose: () => void }) {
  const t = useTranslations("questions");
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(target && target !== "new" ? "editTitle" : "newTitle")}</SheetTitle>
        </SheetHeader>
        {target ? <Form key={target === "new" ? "new" : target.id} question={target === "new" ? null : target} banks={banks} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}
