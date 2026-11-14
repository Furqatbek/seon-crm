"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { PhoneMatches, usePhoneMatches } from "@/components/shared/phone-matches";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/format";
import { convertLead, createStudent, updateStudent } from "@/lib/students/actions";
import type { Tables } from "@/lib/supabase/types";
import {
  LANGUAGES,
  studentFormSchema,
  type StudentErrorKey,
  type StudentFormInput,
  type StudentFormValues,
} from "@/lib/validation/students";

type Student = Pick<
  Tables<"students">,
  "id" | "full_name" | "phone" | "parent_name" | "parent_phone" | "birth_date" | "language" | "notes"
>;

export type StudentFormMode =
  | { kind: "new" }
  | { kind: "edit"; student: Student }
  | { kind: "convert"; lead: { id: string; full_name: string; phone: string } };

function StudentForm({
  mode,
  onCancel,
  onSaved,
}: {
  mode: StudentFormMode;
  onCancel: () => void;
  onSaved: (id: string, enrol: boolean) => void;
}) {
  const t = useTranslations("students");
  const tCommon = useTranslations("common");
  const tLanguage = useTranslations("language");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<StudentErrorKey | null>(null);

  const student = mode.kind === "edit" ? mode.student : null;
  const lead = mode.kind === "convert" ? mode.lead : null;

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<StudentFormInput, unknown, StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      full_name: student?.full_name ?? lead?.full_name ?? "",
      phone: formatPhone(student?.phone ?? lead?.phone ?? "") || "+998 ",
      parent_name: student?.parent_name ?? "",
      parent_phone: student?.parent_phone ? formatPhone(student.parent_phone) : "",
      birth_date: student?.birth_date ?? "",
      language: student?.language ?? "uz",
      notes: student?.notes ?? "",
    },
  });

  // The same number on another lead or student is worth a look, but it does
  // not block saving. The lead being converted is not a duplicate of itself.
  const exclude = { leadId: lead?.id, studentId: student?.id };
  const phoneMatches = usePhoneMatches(useWatch({ control, name: "phone" }), exclude);

  const message = (key: string | undefined) =>
    key ? t(`errors.${key as StudentErrorKey}`) : null;

  // Convert always continues to the enrol sheet; a new student only when asked.
  const submit = (enrol: boolean) =>
    handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      // The server validates the same raw form again.
      const raw = getValues();
      if (mode.kind === "edit") {
        const result = await updateStudent(mode.student.id, raw);
        if (!result.ok) return setFormError(result.error);
        toast(t("form.saved"));
        return onSaved(mode.student.id, false);
      }
      const result =
        mode.kind === "convert" ? await convertLead(mode.lead.id, raw) : await createStudent(raw);
      if (!result.ok) return setFormError(result.error);
      toast(t(mode.kind === "convert" ? "form.converted" : "form.created"));
      onSaved(result.data.id, enrol || mode.kind === "convert");
    });
  });

  return (
    <form onSubmit={submit(false)} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("fields.name")} htmlFor="student-name" error={message(errors.full_name?.message)}>
          <Input
            id="student-name"
            autoComplete="off"
            autoFocus={mode.kind === "new"}
            aria-invalid={errors.full_name ? true : undefined}
            {...register("full_name")}
          />
        </Field>
        <Field label={t("fields.phone")} htmlFor="student-phone" error={message(errors.phone?.message)}>
          <Input
            id="student-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+998 90 123 45 67"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={phoneMatches.length > 0 ? "student-phone-matches" : undefined}
            {...register("phone")}
          />
          <PhoneMatches id="student-phone-matches" matches={phoneMatches} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("fields.parentName")}
            htmlFor="student-parent"
            error={message(errors.parent_name?.message)}
          >
            <Input id="student-parent" autoComplete="off" {...register("parent_name")} />
          </Field>
          <Field
            label={t("fields.parentPhone")}
            htmlFor="student-parent-phone"
            error={message(errors.parent_phone?.message)}
          >
            <Input
              id="student-parent-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+998 90 123 45 67"
              aria-invalid={errors.parent_phone ? true : undefined}
              {...register("parent_phone")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("fields.birthDate")}
            htmlFor="student-birth"
            error={message(errors.birth_date?.message)}
          >
            <Input id="student-birth" type="date" {...register("birth_date")} />
          </Field>
          <Field label={t("fields.language")} htmlFor="student-language">
            <Controller
              control={control}
              name="language"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="student-language" aria-describedby="student-language-hint">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((language) => (
                      <SelectItem key={language} value={language}>
                        {tLanguage(language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <p id="student-language-hint" className="-mt-2 text-footnote text-text-secondary">
          {t("form.languageHint")}
        </p>

        <Field label={t("fields.notes")} htmlFor="student-notes" error={message(errors.notes?.message)}>
          <Textarea id="student-notes" {...register("notes")} />
        </Field>

        {mode.kind === "new" ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-footnote text-text-secondary">{t("form.enrolStep")}</span>
            <Button disabled={pending} onClick={submit(true)} className="w-full">
              <UserPlus aria-hidden />
              {t("form.saveAndEnrol")}
            </Button>
          </div>
        ) : null}

        {formError ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${formError}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {mode.kind === "convert" ? t("form.convertAndEnrol") : tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** New student, Edit, and Convert to student for a lead. */
export function StudentFormSheet({
  mode,
  onClose,
  onSaved,
}: {
  mode: StudentFormMode | null;
  onClose: () => void;
  onSaved: (id: string, enrol: boolean) => void;
}) {
  const t = useTranslations("students");
  const title = mode ? t(`form.title.${mode.kind}`) : "";
  return (
    <Sheet open={mode !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={mode?.kind === "convert" ? undefined : "sr-only"}>
            {mode?.kind === "convert" ? t("form.convertHint") : title}
          </SheetDescription>
        </SheetHeader>
        {mode ? (
          <StudentForm
            key={mode.kind === "edit" ? mode.student.id : mode.kind === "convert" ? mode.lead.id : "new"}
            mode={mode}
            onCancel={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
