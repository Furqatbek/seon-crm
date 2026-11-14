"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { leaveGroup } from "@/lib/groups/actions";
import { leaveSchema, type GroupErrorKey, type LeaveInput } from "@/lib/validation/groups";

export type LeaveTarget = {
  enrollmentId: string;
  student: { full_name: string };
  group: { name: string };
  /** "YYYY-MM-DD": the earliest day the student can leave. */
  joinedOn: string;
};

function LeaveForm({ target, today, onClose }: { target: LeaveTarget; today: string; onClose: () => void }) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<GroupErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeaveInput>({
    resolver: zodResolver(leaveSchema),
    defaultValues: { enrollment_id: target.enrollmentId, left_on: today, credit_amount: "", credit_note: "" },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as GroupErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await leaveGroup(values);
      if (!result.ok) return setFormError(result.error);
      toast(t("leave.done"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("leave.date")} htmlFor="leave-date" error={message(errors.left_on?.message)}>
          <Input
            id="leave-date"
            type="date"
            min={target.joinedOn}
            max={today}
            aria-invalid={errors.left_on ? true : undefined}
            {...register("left_on")}
          />
        </Field>
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-3">
          <legend className="px-1 text-footnote text-text-secondary">{t("leave.credit")}</legend>
          <p className="text-footnote text-text-secondary">{t("enrol.creditHint")}</p>
          <Field
            label={t("enrol.creditAmount")}
            htmlFor="leave-credit"
            error={message(errors.credit_amount?.message)}
          >
            <Input
              id="leave-credit"
              inputMode="numeric"
              autoComplete="off"
              className="numeric"
              aria-invalid={errors.credit_amount ? true : undefined}
              {...register("credit_amount")}
            />
          </Field>
          <Field
            label={t("enrol.creditNote")}
            htmlFor="leave-credit-note"
            error={message(errors.credit_note?.message)}
          >
            <Input
              id="leave-credit-note"
              autoComplete="off"
              aria-invalid={errors.credit_note ? true : undefined}
              {...register("credit_note")}
            />
          </Field>
        </fieldset>
        {formError ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${formError}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("leave.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Leave group: sets the leave date; a credit is optional and needs a note. */
export function LeaveSheet({
  target,
  today,
  onClose,
}: {
  target: LeaveTarget | null;
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("groups.leave");
  return (
    <Sheet open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {target ? t("title", { student: target.student.full_name, group: target.group.name }) : ""}
          </SheetTitle>
          <SheetDescription>{t("body")}</SheetDescription>
        </SheetHeader>
        {target ? <LeaveForm key={target.enrollmentId} target={target} today={today} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}
