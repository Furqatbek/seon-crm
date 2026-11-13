"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveCentre } from "@/lib/settings/actions";
import type { CentreSettings } from "@/lib/settings/queries";
import {
  centreSchema,
  type CentreInput,
  type CentreValues,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem } from "./parts";

/** Owner only: the centre's name, billing day and due day. */
export function CentreTab({ settings }: { settings: CentreSettings }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Extract<SettingsResult, { ok: false }> | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CentreInput, unknown, CentreValues>({
    resolver: zodResolver(centreSchema),
    defaultValues: {
      centre_name: settings.centre_name,
      billing_day: settings.billing_day,
      due_day: settings.due_day,
    },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      const result = await saveCentre(values);
      if (!result.ok) setFailure(result);
      else toast(t("saved"));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      <Field label={t("centre.name")} htmlFor="centre-name" error={message(errors.centre_name?.message)}>
        <Input id="centre-name" autoComplete="organization" aria-invalid={errors.centre_name ? true : undefined} {...register("centre_name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("centre.billingDay")} htmlFor="centre-billing-day" error={message(errors.billing_day?.message)}>
          <Input id="centre-billing-day" type="number" min={1} max={28} inputMode="numeric" className="numeric" aria-invalid={errors.billing_day ? true : undefined} {...register("billing_day")} />
          <p className="text-footnote text-text-secondary">{t("centre.billingDayHint")}</p>
        </Field>
        <Field label={t("centre.dueDay")} htmlFor="centre-due-day" error={message(errors.due_day?.message)}>
          <Input id="centre-due-day" type="number" min={1} max={28} inputMode="numeric" className="numeric" aria-invalid={errors.due_day ? true : undefined} {...register("due_day")} />
          <p className="text-footnote text-text-secondary">{t("centre.dueDayHint")}</p>
        </Field>
      </div>
      <Problem failure={failure} />
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {tCommon("save")}
      </Button>
    </form>
  );
}
