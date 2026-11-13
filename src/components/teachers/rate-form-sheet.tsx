"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { PAY_TYPES, paysAmount } from "@/lib/domain/pay-rates";
import { setPayRate } from "@/lib/teachers/actions";
import {
  payRateFormSchema,
  type PayRateFormInput,
  type PayRateFormValues,
  type TeacherErrorKey,
} from "@/lib/validation/teachers";

function RateForm({
  teacherId,
  defaultDate,
  onClose,
}: {
  teacherId: string;
  defaultDate: string;
  onClose: () => void;
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
  } = useForm<PayRateFormInput, unknown, PayRateFormValues>({
    resolver: zodResolver(payRateFormSchema),
    defaultValues: { pay_type: "fixed_monthly", value: "", effective_from: defaultDate },
  });

  const payType = useWatch({ control, name: "pay_type" });
  const amount = paysAmount(payType);
  const message = (key: string | undefined) =>
    key ? t(`errors.${key as TeacherErrorKey}`) : null;

  const onSubmit = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await setPayRate(teacherId, getValues());
      if (!result.ok) return setFormError(result.error);
      toast(t("pay.rateSaved"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("fields.payType")} htmlFor="rate-type" error={message(errors.pay_type?.message)}>
          <Controller
            control={control}
            name="pay_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="rate-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`payType.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-footnote text-text-secondary">{t(`payTypeHint.${payType}`)}</p>
        </Field>

        <Field
          label={t(amount ? "pay.amount" : "pay.percent")}
          htmlFor="rate-value"
          error={message(errors.value?.message)}
        >
          <Input
            id="rate-value"
            inputMode={amount ? "numeric" : "decimal"}
            autoComplete="off"
            placeholder={amount ? "5 000 000" : "40"}
            className="numeric"
            aria-invalid={errors.value ? true : undefined}
            {...register("value")}
          />
        </Field>

        <Field
          label={t("pay.effectiveFrom")}
          htmlFor="rate-from"
          error={message(errors.effective_from?.message)}
        >
          <Input
            id="rate-from"
            type="date"
            aria-describedby="rate-from-hint"
            aria-invalid={errors.effective_from ? true : undefined}
            {...register("effective_from")}
          />
          <p id="rate-from-hint" className="text-footnote text-text-secondary">
            {t("pay.effectiveHint")}
          </p>
        </Field>

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
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Set new rate: pay type, amount or percent, effective from. */
export function RateFormSheet({
  open,
  teacherId,
  defaultDate,
  onClose,
}: {
  open: boolean;
  teacherId: string;
  defaultDate: string;
  onClose: () => void;
}) {
  const t = useTranslations("teachers");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("pay.setNewRate")}</SheetTitle>
          <SheetDescription>{t("pay.setNewRateHint")}</SheetDescription>
        </SheetHeader>
        {open ? <RateForm teacherId={teacherId} defaultDate={defaultDate} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}
