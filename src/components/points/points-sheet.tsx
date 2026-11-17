"use client";

import { useLocale, useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UNDO_SECONDS } from "@/lib/domain/points";
import { awardPoints, undoPoints } from "@/lib/points/actions";
import type { PointPreset } from "@/lib/points/queries";
import {
  customPointsSchema,
  type CustomPointsInput,
  type CustomPointsValues,
  type PointsErrorKey,
  type PresetKind,
} from "@/lib/validation/points";

import { presetLabel } from "./preset-label";

export type PointsTarget = { student: { id: string; name: string }; kind: PresetKind };

/** The toast after an award or deduction, with Undo for 10 seconds. */
function AwardedToast({ id, message, ledgerId }: { id: string | number; message: string; ledgerId: string | null }) {
  const t = useTranslations("points");
  const [busy, startTransition] = useTransition();
  return (
    <div
      data-slot="points-toast"
      className="pointer-events-auto flex w-full items-center justify-center gap-3 rounded-full bg-text py-1.5 pr-1.5 pl-5 text-body font-medium text-bg shadow-float"
    >
      <span className="py-1">{message}</span>
      {ledgerId ? (
        <button
          type="button"
          disabled={busy}
          className="rounded-full bg-bg px-3 py-1 text-text outline-none motion-fast hover:opacity-90 focus-visible:ring-3 focus-visible:ring-focus-ring"
          onClick={() =>
            startTransition(async () => {
              const result = await undoPoints(ledgerId);
              toast.dismiss(id);
              toast(result.ok ? t("undone") : t(`errors.${result.error}`));
            })
          }
        >
          {t("undo")}
        </button>
      ) : (
        <span className="pr-3" />
      )}
    </div>
  );
}

function Choices({
  target,
  groupId,
  lessonId,
  presets,
  maxPerAction,
  onClose,
}: {
  target: PointsTarget;
  groupId: string;
  lessonId: string | null;
  presets: PointPreset[];
  maxPerAction: number;
  onClose: () => void;
}) {
  const t = useTranslations("points");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ key: PointsErrorKey; detail?: number } | null>(null);
  const schema = useMemo(() => customPointsSchema(maxPerAction), [maxPerAction]);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomPointsInput, unknown, CustomPointsValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "1", reason: "" },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as PointsErrorKey}`) : null);
  const award = target.kind === "award";
  const sign = award ? 1 : -1;
  const name = target.student.name;

  function send(choice: { presetId: string; points: number } | { points: number; reason: string }) {
    setError(null);
    startTransition(async () => {
      const result = await awardPoints({
        student_id: target.student.id,
        group_id: groupId,
        lesson_id: lessonId,
        ...("presetId" in choice ? { preset_id: choice.presetId, reason: "" } : { points: sign * choice.points, reason: choice.reason }),
      });
      if (!result.ok) return setError({ key: result.error, detail: result.detail });
      const { applied, ledgerId } = result.data;
      const message =
        applied === 0
          ? t("nothingToTake", { name })
          : applied > 0
            ? t("given", { count: applied, name })
            : -applied < choice.points
              ? t("takenReduced", { count: -applied, name })
              : t("taken", { count: -applied, name });
      onClose();
      toast.custom((id) => <AwardedToast id={id} message={message} ledgerId={ledgerId} />, {
        duration: ledgerId ? UNDO_SECONDS * 1000 : 4000,
      });
    });
  }

  // Up to five quick choices; a larger limit gets a number field.
  const quick = maxPerAction <= 5;

  return (
    <SheetBody className="gap-4 pb-6">
      {presets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {presets.map((preset) => (
            <li key={preset.id}>
              <Button
                className="h-auto min-h-control w-full justify-between gap-3 py-2 text-left whitespace-normal pointer-coarse:min-h-control-touch"
                disabled={pending}
                data-preset={preset.id}
                onClick={() => send({ presetId: preset.id, points: preset.points })}
              >
                <span>{presetLabel(preset, locale)}</span>
                <span className={award ? "text-success numeric" : "text-danger numeric"}>
                  {award ? "+" : "−"}
                  {preset.points}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        noValidate
        className="flex flex-col gap-3 border-t border-border pt-4"
        onSubmit={handleSubmit((values) => send({ points: values.amount, reason: values.reason }))}
      >
        <h3 className="text-headline text-text">{t("custom")}</h3>
        <Field label={t("howMany")} htmlFor="points-amount" error={message(errors.amount?.message)}>
          {quick ? (
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <SegmentedControl
                  aria-label={t("howMany")}
                  fullWidth
                  value={field.value}
                  onValueChange={field.onChange}
                  options={Array.from({ length: maxPerAction }, (_, index) => ({ value: `${index + 1}`, label: `${index + 1}` }))}
                />
              )}
            />
          ) : (
            <Input id="points-amount" inputMode="numeric" className="numeric" aria-invalid={errors.amount ? true : undefined} {...register("amount")} />
          )}
        </Field>
        <Field label={t("reason")} htmlFor="points-reason" error={message(errors.reason?.message)}>
          <Input id="points-reason" maxLength={200} autoComplete="off" aria-invalid={errors.reason ? true : undefined} {...register("reason")} />
        </Field>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {error.key === "dailyLimit" && error.detail !== undefined
              ? t("errors.dailyLimitLeft", { count: error.detail })
              : t(`errors.${error.key}`)}
          </p>
        ) : null}
        <Button type="submit" variant={award ? "primary" : "destructive-fill"} disabled={pending}>
          {t(award ? "give" : "take")}
        </Button>
      </form>
    </SheetBody>
  );
}

/**
 * A teacher's + or −: the presets for that kind, then Custom (1 to the limit,
 * with a reason). Points post at once; the toast offers Undo.
 */
export function PointsSheet({
  target,
  groupId,
  lessonId,
  presets,
  maxPerAction,
  onClose,
}: {
  target: PointsTarget | null;
  groupId: string;
  lessonId: string | null;
  presets: PointPreset[];
  maxPerAction: number;
  onClose: () => void;
}) {
  const t = useTranslations("points");
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom">
        {target ? (
          <>
            <SheetHeader>
              <SheetTitle>{t(target.kind === "award" ? "giveTitle" : "takeTitle", { name: target.student.name })}</SheetTitle>
              <SheetDescription>{t(target.kind === "award" ? "giveHint" : "takeHint", { max: maxPerAction })}</SheetDescription>
            </SheetHeader>
            <Choices
              key={`${target.student.id}:${target.kind}`}
              target={target}
              groupId={groupId}
              lessonId={lessonId}
              presets={presets.filter((preset) => preset.kind === target.kind && preset.points <= maxPerAction)}
              maxPerAction={maxPerAction}
              onClose={onClose}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
