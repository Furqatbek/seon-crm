"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { changeCoins } from "@/lib/coins/actions";
import { staffCoinsSchema, type CoinsErrorKey, type StaffCoinsInput, type StaffCoinsValues } from "@/lib/validation/coins";

export type CoinsTarget = { groupId: string; student: { id: string; full_name: string }; balance: number };

function CoinsForm({ target, onClose }: { target: CoinsTarget; onClose: () => void }) {
  const t = useTranslations("coins");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<CoinsErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<StaffCoinsInput, unknown, StaffCoinsValues>({
    resolver: zodResolver(staffCoinsSchema),
    defaultValues: {
      group_id: target.groupId,
      student_id: target.student.id,
      kind: "give",
      amount: "" as unknown as number,
      reason: "",
      balance: target.balance,
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const message = (key: string | undefined) => (key ? t(`errors.${key as CoinsErrorKey}`) : null);

  const onSubmit = handleSubmit(() => {
    setFailure(null);
    startTransition(async () => {
      // The raw values: the action validates them again.
      const values = getValues();
      const result = await changeCoins(values);
      if (!result.ok) return setFailure(result.error);
      toast(
        t(values.kind === "give" ? "given" : "spent", { count: Number(values.amount), name: target.student.full_name }),
      );
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <p className="text-body text-text-secondary" data-slot="coins-balance">
          {t("has", { count: target.balance })}
        </p>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <SegmentedControl
              aria-label={t("kind")}
              fullWidth
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: "give", label: t("give") },
                { value: "spend", label: t("spend"), disabled: target.balance <= 0 },
              ]}
            />
          )}
        />
        <Field label={t("howMany")} htmlFor="coins-amount" error={message(errors.amount?.message)}>
          <Input
            id="coins-amount"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={errors.amount ? true : undefined}
            {...register("amount")}
          />
        </Field>
        <Field
          label={kind === "spend" ? t("spentOn") : t("reasonOptional")}
          htmlFor="coins-reason"
          error={message(errors.reason?.message)}
        >
          <Input
            id="coins-reason"
            maxLength={200}
            autoComplete="off"
            aria-invalid={errors.reason ? true : undefined}
            {...register("reason")}
          />
        </Field>
        {failure ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${failure}`)}
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

/** Owner and manager: give coins to a student, or spend the ones they have. */
export function StaffCoinsSheet({ target, onClose }: { target: CoinsTarget | null; onClose: () => void }) {
  const t = useTranslations("coins");
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {target ? (
          <>
            <SheetHeader>
              <SheetTitle>{t("title", { name: target.student.full_name })}</SheetTitle>
              <SheetDescription>{t("staffHint")}</SheetDescription>
            </SheetHeader>
            <CoinsForm key={target.student.id} target={target} onClose={onClose} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
