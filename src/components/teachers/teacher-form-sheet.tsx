"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/format";
import { createTeacher, updateTeacher } from "@/lib/teachers/actions";
import type { Tables } from "@/lib/supabase/types";
import {
  teacherFormSchema,
  type TeacherErrorKey,
  type TeacherFormInput,
  type TeacherFormValues,
} from "@/lib/validation/teachers";

type Teacher = Pick<
  Tables<"teachers">,
  "id" | "full_name" | "phone" | "subjects" | "hired_on" | "is_active" | "notes"
>;

function TeacherForm({
  teacher,
  onCancel,
  onSaved,
}: {
  teacher: Teacher | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("teachers");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<TeacherErrorKey | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<TeacherFormInput, unknown, TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: teacher
      ? {
          full_name: teacher.full_name,
          phone: formatPhone(teacher.phone),
          subjects: teacher.subjects.join(", "),
          hired_on: teacher.hired_on ?? "",
          is_active: teacher.is_active,
          notes: teacher.notes ?? "",
        }
      : { full_name: "", phone: "+998 ", subjects: "", hired_on: "", is_active: true, notes: "" },
  });

  const message = (key: string | undefined) =>
    key ? t(`errors.${key as TeacherErrorKey}`) : null;

  const onSubmit = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      // The server validates the same raw form again.
      const raw = getValues();
      if (teacher) {
        const result = await updateTeacher(teacher.id, raw);
        if (!result.ok) return setFormError(result.error);
        toast(t("form.saved"));
        onSaved(teacher.id);
      } else {
        const result = await createTeacher(raw);
        if (!result.ok) return setFormError(result.error);
        toast(t("form.created"));
        onSaved(result.data.id);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("fields.name")} htmlFor="teacher-name" error={message(errors.full_name?.message)}>
          <Input
            id="teacher-name"
            autoComplete="off"
            autoFocus={!teacher}
            aria-invalid={errors.full_name ? true : undefined}
            {...register("full_name")}
          />
        </Field>
        <Field label={t("fields.phone")} htmlFor="teacher-phone" error={message(errors.phone?.message)}>
          <Input
            id="teacher-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+998 90 123 45 67"
            aria-invalid={errors.phone ? true : undefined}
            {...register("phone")}
          />
        </Field>
        <Field
          label={t("fields.subjects")}
          htmlFor="teacher-subjects"
          error={message(errors.subjects?.message)}
        >
          <Input
            id="teacher-subjects"
            autoComplete="off"
            aria-describedby="teacher-subjects-hint"
            {...register("subjects")}
          />
          <p id="teacher-subjects-hint" className="text-footnote text-text-secondary">
            {t("form.subjectsHint")}
          </p>
        </Field>
        <Field label={t("fields.hiredOn")} htmlFor="teacher-hired" error={message(errors.hired_on?.message)}>
          <Input id="teacher-hired" type="date" {...register("hired_on")} />
        </Field>
        <Field label={t("fields.notes")} htmlFor="teacher-notes" error={message(errors.notes?.message)}>
          <Textarea id="teacher-notes" {...register("notes")} />
        </Field>
        {teacher ? (
          <div className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2">
            <Label htmlFor="teacher-active" className="text-body text-text">
              {t("fields.isActive")}
            </Label>
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <Switch id="teacher-active" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
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
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** New teacher, and Edit for an existing one. Owner only. */
export function TeacherFormSheet({
  open,
  teacher,
  onClose,
  onSaved,
}: {
  open: boolean;
  teacher: Teacher | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("teachers");
  const title = t(teacher ? "editTeacher" : "newTeacher");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        {open ? (
          <TeacherForm key={teacher?.id ?? "new"} teacher={teacher} onCancel={onClose} onSaved={onSaved} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
