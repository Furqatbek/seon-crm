"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { createGroup, updateGroup } from "@/lib/groups/actions";
import type { TeacherOption } from "@/lib/groups/queries";
import type { Tables } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  GROUP_STATUSES,
  WEEKDAYS,
  groupFormSchema,
  type GroupErrorKey,
  type GroupFormInput,
  type GroupFormValues,
} from "@/lib/validation/groups";

import { hhmm, type Weekday } from "./group-meta";

type Group = Tables<"groups">;

function GroupForm({
  group,
  teachers,
  today,
  onCancel,
  onSaved,
}: {
  group: Group | null;
  teachers: TeacherOption[];
  today: string;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tDays = useTranslations("common.weekdays");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<GroupErrorKey | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<GroupFormInput, unknown, GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: group
      ? {
          name: group.name,
          subject: group.subject,
          level: group.level ?? "",
          teacher_id: group.teacher_id,
          monthly_fee: String(group.monthly_fee),
          days: group.days,
          start_time: hhmm(group.start_time),
          duration_min: String(group.duration_min),
          room: group.room ?? "",
          capacity: group.capacity === null ? "" : String(group.capacity),
          start_date: group.start_date,
          status: group.status,
        }
      : {
          name: "",
          subject: "",
          level: "",
          teacher_id: "",
          monthly_fee: "",
          days: [],
          start_time: "",
          duration_min: "90",
          room: "",
          capacity: "",
          start_date: today,
          // A group whose start date has not come yet is still forming.
          status: "active",
        },
  });

  const message = (key: string | undefined) => (key ? t(`errors.${key as GroupErrorKey}`) : null);

  const onSubmit = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const raw = getValues();
      if (group) {
        const result = await updateGroup(group.id, raw);
        if (!result.ok) return setFormError(result.error);
        toast(t("form.saved"));
        return onSaved(group.id);
      }
      const result = await createGroup({
        ...raw,
        status: raw.start_date > today ? "forming" : "active",
      });
      if (!result.ok) return setFormError(result.error);
      toast(t("form.created"));
      onSaved(result.data.id);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("fields.name")} htmlFor="group-name" error={message(errors.name?.message)}>
          <Input
            id="group-name"
            autoComplete="off"
            autoFocus={!group}
            aria-invalid={errors.name ? true : undefined}
            {...register("name")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.subject")} htmlFor="group-subject" error={message(errors.subject?.message)}>
            <Input
              id="group-subject"
              autoComplete="off"
              aria-invalid={errors.subject ? true : undefined}
              {...register("subject")}
            />
          </Field>
          <Field label={t("fields.level")} htmlFor="group-level" error={message(errors.level?.message)}>
            <Input id="group-level" autoComplete="off" {...register("level")} />
          </Field>
        </div>
        <Field label={t("fields.teacher")} htmlFor="group-teacher" error={message(errors.teacher_id?.message)}>
          <Controller
            control={control}
            name="teacher_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="group-teacher" aria-invalid={errors.teacher_id ? true : undefined}>
                  <SelectValue placeholder={t("form.chooseTeacher")} />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label={t("fields.monthlyFee")} htmlFor="group-fee" error={message(errors.monthly_fee?.message)}>
          <Input
            id="group-fee"
            inputMode="numeric"
            autoComplete="off"
            placeholder="600 000"
            className="numeric"
            aria-invalid={errors.monthly_fee ? true : undefined}
            aria-describedby={group ? "group-fee-hint" : undefined}
            {...register("monthly_fee")}
          />
          {group ? (
            <p id="group-fee-hint" className="text-footnote text-text-secondary">
              {t("form.feeHint")}
            </p>
          ) : null}
        </Field>

        <Field label={t("fields.days")} htmlFor="group-days" error={message(errors.days?.message)}>
          <Controller
            control={control}
            name="days"
            render={({ field }) => (
              <div id="group-days" role="group" aria-label={t("fields.days")} className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const on = field.value.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      data-weekday={day}
                      onClick={() =>
                        field.onChange(on ? field.value.filter((d) => d !== day) : [...field.value, day])
                      }
                      className={cn(
                        "h-control min-w-12 rounded-control border px-3 text-body font-medium outline-none motion-fast pointer-coarse:h-control-touch focus-visible:ring-3 focus-visible:ring-focus-ring",
                        on
                          ? "border-purple bg-purple-tint text-purple"
                          : "border-border-strong bg-bg text-text hover:bg-bg-subtle",
                      )}
                    >
                      {tDays(String(day) as Weekday)}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.startTime")} htmlFor="group-time" error={message(errors.start_time?.message)}>
            <Input
              id="group-time"
              type="time"
              aria-invalid={errors.start_time ? true : undefined}
              {...register("start_time")}
            />
          </Field>
          <Field
            label={t("fields.duration")}
            htmlFor="group-duration"
            error={message(errors.duration_min?.message)}
          >
            <Input
              id="group-duration"
              inputMode="numeric"
              autoComplete="off"
              className="numeric"
              aria-invalid={errors.duration_min ? true : undefined}
              {...register("duration_min")}
            />
          </Field>
          <Field label={t("fields.room")} htmlFor="group-room" error={message(errors.room?.message)}>
            <Input id="group-room" autoComplete="off" {...register("room")} />
          </Field>
          <Field label={t("fields.capacity")} htmlFor="group-capacity" error={message(errors.capacity?.message)}>
            <Input
              id="group-capacity"
              inputMode="numeric"
              autoComplete="off"
              className="numeric"
              aria-invalid={errors.capacity ? true : undefined}
              {...register("capacity")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.startDate")} htmlFor="group-start" error={message(errors.start_date?.message)}>
            <Input
              id="group-start"
              type="date"
              aria-invalid={errors.start_date ? true : undefined}
              {...register("start_date")}
            />
          </Field>
          {group ? (
            <Field label={t("fields.status")} htmlFor="group-status">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="group-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUP_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          ) : null}
        </div>
        {group ? <p className="text-footnote text-text-secondary">{t("form.scheduleHint")}</p> : null}

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

/** New group, and Edit for an existing one. */
export function GroupFormSheet({
  open,
  group,
  teachers,
  today,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: Group | null;
  teachers: TeacherOption[];
  today: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("groups");
  const title = t(group ? "editGroup" : "newGroup");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        {open ? (
          <GroupForm
            key={group?.id ?? "new"}
            group={group}
            teachers={teachers}
            today={today}
            onCancel={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
