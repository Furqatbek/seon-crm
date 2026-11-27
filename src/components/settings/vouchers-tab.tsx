"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveVoucherSettings } from "@/lib/offers/actions";
import type { VoucherSettings } from "@/lib/offers/queries";
import { voucherSettingsSchema, type OfferErrorKey, type VoucherSettingsInput, type VoucherSettingsValues } from "@/lib/validation/offers";

import { Section } from "./parts";

/** Each type: its switch, its weight in the draw and its value, with the value's range. */
const TYPES = [
  { key: "percent", min: 1, max: 100 },
  { key: "fixed", min: 1000, max: 100_000_000 },
  { key: "trial", min: 1, max: 31 },
] as const;

/**
 * Settings → Vouchers: which vouchers the student app gives after an App
 * user's first finished exam, how likely each is, what each is worth and how
 * long a voucher is valid. The owner's.
 */
export function VouchersTab({ settings }: { settings: VoucherSettings }) {
  const t = useTranslations("offers.settings");
  const tErrors = useTranslations("offers.errors");
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<OfferErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VoucherSettingsInput, unknown, VoucherSettingsValues>({ resolver: zodResolver(voucherSettingsSchema), defaultValues: settings });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await saveVoucherSettings(values);
      if (!result.ok) setError(result.error);
      else toast(tSettings("saved"));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-6" data-slot="voucher-settings">
      <div className="flex flex-col gap-1">
        <p className="text-body text-text-secondary">{t("hint")}</p>
        <p className="text-footnote text-text-secondary">{t("weightHint")}</p>
      </div>
      {TYPES.map(({ key, min, max }) => (
        <Section
          key={key}
          title={t(`types.${key}`)}
          aside={
            <Controller
              control={control}
              name={`${key}_enabled`}
              render={({ field }) => <Switch id={`voucher-${key}-enabled`} checked={field.value} onCheckedChange={field.onChange} aria-label={t("enabled", { type: t(`types.${key}`) })} />}
            />
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("weight")} htmlFor={`voucher-${key}-weight`} error={errors[`${key}_weight`] ? tErrors("valueRangeOf", { min: 0, max: 100 }) : null}>
              <Input id={`voucher-${key}-weight`} type="number" min={0} max={100} inputMode="numeric" className="numeric" aria-invalid={errors[`${key}_weight`] ? true : undefined} {...register(`${key}_weight`)} />
            </Field>
            <Field label={t(`value.${key}`)} htmlFor={`voucher-${key}-value`} error={errors[`${key}_value`] ? tErrors("valueRangeOf", { min, max }) : null}>
              <Input id={`voucher-${key}-value`} type="number" min={min} max={max} inputMode="numeric" className="numeric" aria-invalid={errors[`${key}_value`] ? true : undefined} {...register(`${key}_value`)} />
            </Field>
          </div>
        </Section>
      ))}
      <Section title={t("validity")}>
        <Field label={t("validDays")} htmlFor="voucher-valid-days" error={errors.valid_days ? tErrors("valueRangeOf", { min: 1, max: 90 }) : null}>
          <Input id="voucher-valid-days" type="number" min={1} max={90} inputMode="numeric" className="numeric max-w-40" aria-invalid={errors.valid_days ? true : undefined} {...register("valid_days")} />
        </Field>
      </Section>
      {error || errors.percent_enabled ? (
        <p role="alert" className="text-footnote text-danger">
          {tErrors(error ?? "noType")}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {tCommon("save")}
      </Button>
    </form>
  );
}
