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
import { addCredit } from "@/lib/finance/actions";
import {
  creditSchema,
  type CreditInput,
  type CreditValues,
  type FinanceErrorKey,
} from "@/lib/validation/finance";

const NONE = "none";

function CreditForm({
  student,
  groups,
  onClose,
}: {
  student: { id: string };
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<FinanceErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CreditInput, unknown, CreditValues>({
    resolver: zodResolver(creditSchema),
    defaultValues: {
      student_id: student.id,
      group_id: groups.length === 1 ? groups[0].id : "",
      amount: "",
      note: "",
    },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as FinanceErrorKey}`) : null);

  const onSubmit = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await addCredit(getValues());
      if (!result.ok) return setFormError(result.error);
      toast(t("credit.done"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("credit.amount")} htmlFor="credit-amount" error={message(errors.amount?.message)}>
          <Input
            id="credit-amount"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="numeric"
            aria-invalid={errors.amount ? true : undefined}
            {...register("amount")}
          />
        </Field>
        <Field label={t("credit.note")} htmlFor="credit-note" error={message(errors.note?.message)}>
          <Input
            id="credit-note"
            autoComplete="off"
            aria-invalid={errors.note ? true : undefined}
            {...register("note")}
          />
        </Field>
        {groups.length > 0 ? (
          <Field label={t("fields.group")} htmlFor="credit-group">
            <Controller
              control={control}
              name="group_id"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                >
                  <SelectTrigger id="credit-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("credit.noGroup")}</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        ) : null}
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
          {t("credit.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Add credit: lowers what the student owes. A note is always required. */
export function CreditSheet({
  open,
  student,
  groups,
  onClose,
}: {
  open: boolean;
  student: { id: string; full_name: string };
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const t = useTranslations("finance.credit");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title", { student: student.full_name })}</SheetTitle>
          <SheetDescription>{t("hint")}</SheetDescription>
        </SheetHeader>
        {open ? <CreditForm student={student} groups={groups} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}
