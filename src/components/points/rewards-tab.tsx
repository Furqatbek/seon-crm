"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/auth";
import { archiveReward, saveReward, uploadRewardPhoto } from "@/lib/points/actions";
import type { Reward } from "@/lib/points/queries";
import {
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  VARIANT_LANGUAGES,
  VARIANTS_MAX,
  rewardSchema,
  type PointsErrorKey,
  type RewardInput,
  type RewardValues,
} from "@/lib/validation/points";

import { RewardCard } from "./reward-card";

function RewardForm({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const t = useTranslations("points");
  const tCommon = useTranslations("common");
  const tLanguages = useTranslations("language");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PointsErrorKey | null>(null);
  // A newly chosen photo is uploaded when the form is saved.
  const [photo, setPhoto] = useState<File | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RewardInput, unknown, RewardValues>({
    resolver: zodResolver(rewardSchema),
    defaultValues: reward
      ? {
          name: reward.name,
          description: reward.description ?? "",
          cost: reward.cost,
          stock: reward.stock === null ? "" : String(reward.stock),
          is_active: reward.is_active,
          photo_path: reward.photo_path,
          variants: reward.variants.map((variant) => ({
            id: variant.id,
            ...variant.name,
            stock: variant.stock === null ? "" : String(variant.stock),
          })),
        }
      : { name: "", description: "", cost: "", stock: "", is_active: true, photo_path: null, variants: [] },
  });
  const variants = useFieldArray({ control, name: "variants", keyName: "key" });
  const loadedVariantStock = new Map(reward?.variants.map((variant) => [variant.id, variant.stock === null ? "" : String(variant.stock)]));
  const message = (key: string | undefined) => (key ? t(`errors.${key as PointsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    if (photo && (!(photo.type in PHOTO_TYPES) || photo.size > PHOTO_MAX_BYTES)) return setError("photoInvalid");
    startTransition(async () => {
      let photoPath = values.photo_path;
      if (photo) {
        const form = new FormData();
        form.set("photo", photo);
        const uploaded = await uploadRewardPhoto(form);
        if (!uploaded.ok) return setError(uploaded.error);
        photoPath = uploaded.data.path;
      }
      const result = await saveReward({
        ...values,
        description: values.description ?? "",
        stock: values.stock === null ? "" : String(values.stock),
        photo_path: photoPath,
        variants: values.variants.map((variant) => ({
          ...variant,
          stock: variant.stock === null ? "" : String(variant.stock),
          ...(variant.id && loadedVariantStock.has(variant.id) ? { stock_loaded: loadedVariantStock.get(variant.id) } : {}),
        })),
        ...(reward ? { id: reward.id, stock_loaded: reward.stock === null ? "" : String(reward.stock) } : {}),
      });
      if (!result.ok) return setError(result.error);
      toast(t("rewards.saved"));
      onClose();
    });
  });

  function archive() {
    if (!reward) return;
    setError(null);
    startTransition(async () => {
      const result = await archiveReward(reward.id);
      if (!result.ok) return setError(result.error);
      toast(t("rewards.archived"));
      onClose();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("rewards.name")} htmlFor="reward-name" error={message(errors.name?.message)}>
          <Input id="reward-name" autoComplete="off" maxLength={80} aria-invalid={errors.name ? true : undefined} {...register("name")} />
        </Field>
        <Field label={t("rewards.description")} htmlFor="reward-description" error={message(errors.description?.message)}>
          <Textarea id="reward-description" maxLength={300} {...register("description")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("rewards.cost")} htmlFor="reward-cost" error={message(errors.cost?.message)}>
            <Input id="reward-cost" inputMode="numeric" autoComplete="off" className="numeric" aria-invalid={errors.cost ? true : undefined} {...register("cost")} />
          </Field>
          <Field label={t("rewards.stock")} htmlFor="reward-stock" error={message(errors.stock?.message)}>
            <Input id="reward-stock" inputMode="numeric" autoComplete="off" className="numeric" aria-invalid={errors.stock ? true : undefined} {...register("stock")} />
            <p className="text-footnote text-text-secondary">{t("rewards.stockHint")}</p>
          </Field>
        </div>
        <fieldset className="flex flex-col gap-3" data-slot="variants">
          <legend className="text-body font-medium text-text">{t("rewards.variants")}</legend>
          <p className="text-footnote text-text-secondary">{t("rewards.variantsHint")}</p>
          {variants.fields.map((variant, index) => (
            <div key={variant.key} className="flex flex-col gap-3 rounded-md border border-border p-3" data-slot="variant">
              <div className="grid gap-3 sm:grid-cols-2">
                {VARIANT_LANGUAGES.map((language) => (
                  <Field
                    key={language}
                    label={t("rewards.variantName", { language: tLanguages(language) })}
                    htmlFor={`variant-${index}-${language}`}
                    error={message(errors.variants?.[index]?.[language]?.message)}
                  >
                    <Input
                      id={`variant-${index}-${language}`}
                      autoComplete="off"
                      maxLength={30}
                      aria-invalid={errors.variants?.[index]?.[language] ? true : undefined}
                      {...register(`variants.${index}.${language}`)}
                    />
                  </Field>
                ))}
              </div>
              <div className="flex items-end justify-between gap-3">
                <Field label={t("rewards.variantStock")} htmlFor={`variant-${index}-stock`} error={message(errors.variants?.[index]?.stock?.message)}>
                  <Input
                    id={`variant-${index}-stock`}
                    inputMode="numeric"
                    autoComplete="off"
                    className="numeric"
                    aria-invalid={errors.variants?.[index]?.stock ? true : undefined}
                    {...register(`variants.${index}.stock`)}
                  />
                </Field>
                <Button variant="ghost" onClick={() => variants.remove(index)} aria-label={t("rewards.removeVariant")}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
          ))}
          {variants.fields.length < VARIANTS_MAX ? (
            <Button onClick={() => variants.append({ uz: "", ru: "", en: "", ko: "", stock: "" })} className="self-start">
              <Plus aria-hidden />
              {t("rewards.addVariant")}
            </Button>
          ) : null}
        </fieldset>
        <Field label={t("rewards.photo")} htmlFor="reward-photo">
          <Input
            id="reward-photo"
            type="file"
            accept={Object.keys(PHOTO_TYPES).join(",")}
            className="h-auto py-2"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
          <p className="text-footnote text-text-secondary">{t("rewards.photoHint")}</p>
        </Field>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="reward-active" className="text-body text-text">
            {t("rewards.active")}
          </label>
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => <Switch id="reward-active" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </div>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        {reward ? (
          <Button variant="destructive" disabled={pending} onClick={archive} className="mr-auto">
            {t("rewards.archive")}
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

/** The catalogue as cards. The owner adds, edits and archives; a manager looks. */
export function RewardsTab({ rewards, role }: { rewards: Reward[]; role: UserRole }) {
  const t = useTranslations("points.rewards");
  const [form, setForm] = useState<"new" | Reward | null>(null);
  const owner = role === "owner";

  return (
    <div className="flex flex-col gap-4">
      {owner ? (
        <Button onClick={() => setForm("new")} className="self-start">
          <Plus aria-hidden />
          {t("add")}
        </Button>
      ) : null}
      {rewards.length === 0 ? (
        <EmptyState icon={Gift}>{t("empty")}</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              action={
                owner ? (
                  <Button onClick={() => setForm(reward)} className="mt-1 self-start">
                    <Pencil aria-hidden />
                    {t("edit")}
                    <span className="sr-only">: {reward.name}</span>
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <Sheet open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t(form && form !== "new" ? "editTitle" : "newTitle")}</SheetTitle>
          </SheetHeader>
          {form ? (
            <RewardForm key={form === "new" ? "new" : form.id} reward={form === "new" ? null : form} onClose={() => setForm(null)} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
