"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { savePaymentSettings } from "@/lib/receipts/actions";
import type { PaymentSettings } from "@/lib/receipts/queries";
import { groupCardNumber, paymentSettingsSchema, type PaymentSettingsErrorKey, type PaymentSettingsInput } from "@/lib/validation/receipts";
import { UI_LANGUAGES } from "@/lib/validation/settings";

import { Section } from "./parts";

type TextLanguage = (typeof UI_LANGUAGES)[number];

/**
 * Owner only: the card students transfer to (number, holder, bank) and the
 * instructions the app shows with it, in uz, ru, en and ko. One language is
 * edited at a time; Save keeps all four.
 */
export function PaymentsTab({ settings, language }: { settings: PaymentSettings; language: TextLanguage }) {
  const t = useTranslations("receipts.settings");
  const tSettings = useTranslations("settings");
  const tLanguage = useTranslations("language");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<TextLanguage>(language);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PaymentSettingsErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaymentSettingsInput>({ resolver: zodResolver(paymentSettingsSchema), defaultValues: { ...settings, card_number: groupCardNumber(settings.card_number) } });
  const message = (key: string | undefined) => (key ? t(`errors.${key as PaymentSettingsErrorKey}`) : null);

  const onSubmit = handleSubmit(
    (values) => {
      setError(null);
      startTransition(async () => {
        const result = await savePaymentSettings(values);
        if (!result.ok) setError(result.error);
        else toast(tSettings("saved"));
      });
    },
    (invalid) => {
      // Show the language the problem is in.
      const wrong = UI_LANGUAGES.find((code) => invalid.instructions?.[code]);
      if (wrong) setEditing(wrong);
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-6" data-slot="payment-settings">
      <p className="text-body text-text-secondary">{t("hint")}</p>
      <Section title={t("card")}>
        <Field label={t("number")} htmlFor="payment-card-number" error={message(errors.card_number?.message)}>
          <Input id="payment-card-number" inputMode="numeric" autoComplete="off" placeholder="8600 1234 5678 9012" className="numeric" aria-invalid={errors.card_number ? true : undefined} {...register("card_number")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("holder")} htmlFor="payment-card-holder" error={message(errors.card_holder?.message)}>
            <Input id="payment-card-holder" autoComplete="off" maxLength={100} aria-invalid={errors.card_holder ? true : undefined} {...register("card_holder")} />
          </Field>
          <Field label={t("bank")} htmlFor="payment-card-bank" error={message(errors.bank?.message)}>
            <Input id="payment-card-bank" autoComplete="off" maxLength={100} {...register("bank")} />
          </Field>
        </div>
        <p className="text-footnote text-text-secondary">{t("cardHint")}</p>
      </Section>
      <Section title={t("instructions")}>
        <p className="text-footnote text-text-secondary">{t("instructionsHint")}</p>
        <SegmentedControl aria-label={t("language")} value={editing} onValueChange={setEditing} options={UI_LANGUAGES.map((code) => ({ value: code, label: tLanguage(code) }))} />
        {/* Every language stays in the form; only the chosen one is shown. */}
        {UI_LANGUAGES.map((code) => (
          <div key={code} hidden={code !== editing} data-instructions-language={code}>
            <Field label={t("instructionsFor", { language: tLanguage(code) })} htmlFor={`payment-instructions-${code}`} error={message(errors.instructions?.[code]?.message)}>
              <Textarea id={`payment-instructions-${code}`} rows={5} lang={code} maxLength={1000} aria-invalid={errors.instructions?.[code] ? true : undefined} {...register(`instructions.${code}`)} />
            </Field>
          </div>
        ))}
      </Section>
      {error ? (
        <p role="alert" className="text-footnote text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {tCommon("save")}
      </Button>
    </form>
  );
}
