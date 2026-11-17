"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Pencil, Plus, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { presetLabel } from "@/components/points/preset-label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import type { PointsSettings } from "@/lib/domain/points";
import { archivePreset, regenerateTvToken, savePointsSettings, savePreset, saveTvLanguage } from "@/lib/points/actions";
import type { PointPreset, TvSettings } from "@/lib/points/queries";
import {
  PRESET_KINDS,
  TV_LANGUAGES,
  pointsSettingsSchema,
  presetSchema,
  type PointsErrorKey,
  type PointsSettingsInput,
  type PointsSettingsValues,
  type PresetInput,
  type PresetKind,
  type PresetValues,
} from "@/lib/validation/points";

import { Section } from "./parts";

const VALUES = [
  ["present", 0, 1000],
  ["late", 0, 1000],
  ["perfect_month", 0, 1000],
  ["perfect_month_min_lessons", 1, 31],
  ["on_time", 0, 1000],
  ["referral", 0, 1000],
] as const;
const LIMITS = [
  ["max_per_action", 1, 100],
  ["teacher_daily_cap", 1, 1000],
] as const;

function SettingsForm({ settings }: { settings: PointsSettings }) {
  const t = useTranslations("points");
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PointsErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PointsSettingsInput, unknown, PointsSettingsValues>({
    resolver: zodResolver(pointsSettingsSchema),
    defaultValues: settings,
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await savePointsSettings(values);
      if (!result.ok) setError(result.error);
      else toast(tSettings("saved"));
    });
  });

  const number = ([name, min, max]: (typeof VALUES)[number] | (typeof LIMITS)[number]) => (
    <Field
      key={name}
      label={t(`settings.${name}`)}
      htmlFor={`points-${name}`}
      error={errors[name] ? t("errors.valueRange", { min, max }) : null}
    >
      <Input
        id={`points-${name}`}
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        className="numeric"
        aria-invalid={errors[name] ? true : undefined}
        {...register(name)}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4 rounded-card border border-border p-4">
        <label htmlFor="points-enabled" className="flex flex-col gap-1">
          <span className="text-body font-medium text-text">{t("settings.enabled")}</span>
          <span className="text-footnote text-text-secondary">{t("settings.enabledHint")}</span>
        </label>
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => <Switch id="points-enabled" checked={field.value} onCheckedChange={field.onChange} />}
        />
      </div>

      <Section title={t("settings.values")}>
        <p className="text-footnote text-text-secondary">{t("settings.valuesHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">{VALUES.map(number)}</div>
      </Section>

      <Section title={t("settings.limits")}>
        <p className="text-footnote text-text-secondary">{t("settings.limitsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">{LIMITS.map(number)}</div>
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

const LANGUAGE_NAMES = { uz: "Oʻzbekcha", ru: "Русский", en: "English" } as const;

/** The TV screen: its language, and the secret link with Copy and Regenerate. */
function TvSection({ tv, origin }: { tv: TvSettings; origin: string }) {
  const t = useTranslations("points");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  // The link opens in the TV's language.
  const link = `${origin}/${tv.language}/tv/${tv.token}`;

  const run = (action: () => Promise<{ ok: boolean; error?: PointsErrorKey }>, done: string) =>
    startTransition(async () => {
      const result = await action();
      setConfirming(false);
      toast(result.ok ? done : t(`errors.${result.error ?? "generic"}`));
    });

  return (
    <Section title={t("tv.title")}>
      <p className="text-footnote text-text-secondary">{t("tv.hint")}</p>
      <Field label={t("tv.language")} htmlFor="tv-language" className="sm:max-w-xs">
        <Select value={tv.language} disabled={pending} onValueChange={(value) => run(() => saveTvLanguage(value), t("tv.languageSaved"))}>
          <SelectTrigger id="tv-language">
            <SelectValue>{LANGUAGE_NAMES[tv.language]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TV_LANGUAGES.map((language) => (
              <SelectItem key={language} value={language}>
                {LANGUAGE_NAMES[language]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t("tv.link")} htmlFor="tv-link">
        <Input id="tv-link" readOnly value={link} className="numeric" onFocus={(event) => event.target.select()} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            toast(t("tv.copied"));
          }}
        >
          <Copy aria-hidden />
          {t("tv.copy")}
        </Button>
        <Button disabled={pending} onClick={() => setConfirming(true)}>
          <RefreshCw aria-hidden />
          {t("tv.regenerate")}
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tv.regenerateTitle")}</DialogTitle>
            <DialogDescription>{t("tv.regenerateBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive-fill" disabled={pending} onClick={() => run(regenerateTvToken, t("tv.regenerated"))}>
              {t("tv.regenerate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function PresetForm({ preset, kind, onClose }: { preset: PointPreset | null; kind: PresetKind; onClose: () => void }) {
  const t = useTranslations("points");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PointsErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PresetInput, unknown, PresetValues>({
    resolver: zodResolver(presetSchema),
    defaultValues: preset
      ? { ...preset }
      : { kind, points: 2, label_uz: "", label_ru: "", label_en: "", is_active: true },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as PointsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await savePreset(preset ? { ...values, id: preset.id } : values);
      if (!result.ok) return setError(result.error);
      toast(t("presets.saved"));
      onClose();
    });
  });

  function remove() {
    if (!preset) return;
    setError(null);
    startTransition(async () => {
      const result = await archivePreset(preset.id);
      if (!result.ok) return setError(result.error);
      toast(t("presets.removed"));
      onClose();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("presets.kind")} htmlFor="preset-kind">
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <SegmentedControl
                aria-label={t("presets.kind")}
                fullWidth
                value={field.value}
                onValueChange={field.onChange}
                options={PRESET_KINDS.map((option) => ({ value: option, label: t(`presets.kinds.${option}`) }))}
              />
            )}
          />
        </Field>
        <Field
          label={t("presets.points")}
          htmlFor="preset-points"
          error={errors.points ? t("errors.valueRange", { min: 1, max: 100 }) : null}
        >
          <Input id="preset-points" type="number" min={1} max={100} inputMode="numeric" className="numeric" aria-invalid={errors.points ? true : undefined} {...register("points")} />
        </Field>
        {(["uz", "ru", "en"] as const).map((language) => (
          <Field
            key={language}
            label={t(`presets.label.${language}`)}
            htmlFor={`preset-label-${language}`}
            error={message(errors[`label_${language}`]?.message)}
          >
            <Input
              id={`preset-label-${language}`}
              lang={language}
              autoComplete="off"
              maxLength={60}
              aria-invalid={errors[`label_${language}`] ? true : undefined}
              {...register(`label_${language}`)}
            />
          </Field>
        ))}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="preset-active" className="text-body text-text">
            {t("presets.active")}
          </label>
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => <Switch id="preset-active" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </div>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        {preset ? (
          <Button variant="destructive" disabled={pending} onClick={remove} className="mr-auto">
            {t("presets.remove")}
          </Button>
        ) : null}
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

/** Owner only: the programme switch, every point value, the limits and the presets. */
export function PointsTab({
  settings,
  presets,
  tv,
  origin,
}: {
  settings: PointsSettings;
  presets: PointPreset[];
  tv: TvSettings;
  /** The site's address, for the TV link. */
  origin: string;
}) {
  const t = useTranslations("points");
  const locale = useLocale();
  const [form, setForm] = useState<{ preset: PointPreset | null; kind: PresetKind } | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <SettingsForm settings={settings} />

      <TvSection tv={tv} origin={origin} />

      <Section title={t("presets.title")}>
        <p className="text-footnote text-text-secondary">{t("presets.hint")}</p>
        <div className="flex flex-col gap-6">
          {PRESET_KINDS.map((kind) => (
            <div key={kind} className="flex flex-col gap-2" data-preset-list={kind}>
              <h3 className="text-headline text-text">{t(`presets.kinds.${kind}`)}</h3>
              <ul className="divide-y divide-border rounded-card border border-border">
                {presets
                  .filter((preset) => preset.kind === kind)
                  .map((preset) => (
                    <li key={preset.id} className="flex min-h-row items-center gap-3 py-1 pr-1 pl-4" data-preset-row={preset.id}>
                      <span className="min-w-0 flex-1 text-body text-text">{presetLabel(preset, locale)}</span>
                      {preset.is_active ? null : <StatusPill>{t("presets.off")}</StatusPill>}
                      <span className={kind === "award" ? "text-success numeric" : "text-danger numeric"}>
                        {kind === "award" ? "+" : "−"}
                        {preset.points}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("presets.edit", { name: presetLabel(preset, locale) })}
                        onClick={() => setForm({ preset, kind })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    </li>
                  ))}
              </ul>
              <Button onClick={() => setForm({ preset: null, kind })} className="self-start">
                <Plus aria-hidden />
                {t(`presets.add.${kind}`)}
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Sheet open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t(form?.preset ? "presets.editTitle" : "presets.newTitle")}</SheetTitle>
          </SheetHeader>
          {form ? (
            <PresetForm key={form.preset?.id ?? form.kind} preset={form.preset} kind={form.kind} onClose={() => setForm(null)} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
