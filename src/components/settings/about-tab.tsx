"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { saveAppTexts } from "@/lib/settings/actions";
import type { AppTexts } from "@/lib/settings/queries";
import { UI_LANGUAGES, appTextsSchema, type AppTextsInput, type SettingsErrorKey, type SettingsResult } from "@/lib/validation/settings";

import { Problem } from "./parts";

type TextLanguage = (typeof UI_LANGUAGES)[number];

/**
 * Owner only: About the centre and the Privacy policy, as the student app
 * shows them, in uz, ru, en and ko. One language is edited at a time; Save
 * keeps all four.
 */
export function AboutTab({ texts, language }: { texts: AppTexts; language: TextLanguage }) {
  const t = useTranslations("settings");
  const tLanguage = useTranslations("language");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<TextLanguage>(language);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Extract<SettingsResult, { ok: false }> | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppTextsInput>({ resolver: zodResolver(appTextsSchema), defaultValues: texts });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit(
    (values) => {
      setFailure(null);
      startTransition(async () => {
        const result = await saveAppTexts(values);
        if (!result.ok) setFailure(result);
        else toast(t("saved"));
      });
    },
    (invalid) => {
      // Show the language the problem is in.
      const wrong = UI_LANGUAGES.find((code) => invalid.about?.[code] || invalid.privacy_policy?.[code]);
      if (wrong) setEditing(wrong);
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-4">
      <p className="text-body text-text-secondary">{t("about.hint")}</p>
      <SegmentedControl
        aria-label={t("about.language")}
        value={editing}
        onValueChange={setEditing}
        options={UI_LANGUAGES.map((code) => ({ value: code, label: tLanguage(code) }))}
      />
      {/* Every language stays in the form; only the chosen one is shown. */}
      {UI_LANGUAGES.map((code) => (
        <div key={code} hidden={code !== editing} className="flex flex-col gap-4" data-about-language={code}>
          <Field label={t("about.about")} htmlFor={`about-${code}`} error={message(errors.about?.[code]?.message)}>
            <Textarea id={`about-${code}`} rows={6} lang={code} aria-invalid={errors.about?.[code] ? true : undefined} {...register(`about.${code}`)} />
          </Field>
          <Field label={t("about.privacy")} htmlFor={`privacy-${code}`} error={message(errors.privacy_policy?.[code]?.message)}>
            <Textarea
              id={`privacy-${code}`}
              rows={14}
              lang={code}
              aria-invalid={errors.privacy_policy?.[code] ? true : undefined}
              {...register(`privacy_policy.${code}`)}
            />
          </Field>
        </div>
      ))}
      <Problem failure={failure} />
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {tCommon("save")}
      </Button>
    </form>
  );
}
