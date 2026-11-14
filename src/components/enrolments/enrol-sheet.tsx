"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
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
import {
  enrolStudent,
  proposeFirstCharge,
  transferStudent,
  type FirstChargeProposal,
  type StudentOption,
} from "@/lib/groups/actions";
import type { OpenGroup } from "@/lib/groups/queries";
import {
  enrolFormSchema,
  type EnrolFormInput,
  type GroupErrorKey,
} from "@/lib/validation/groups";

import { StudentPicker } from "./student-picker";

export type EnrolTarget =
  | {
      kind: "enrol";
      /** Fixed when the sheet is opened from a student page. */
      student?: StudentOption;
      /** Fixed when the sheet is opened from a group page. */
      group?: { id: string; name: string };
    }
  | {
      kind: "transfer";
      enrollmentId: string;
      student: StudentOption;
      fromGroup: { id: string; name: string };
      discountKind: string | null;
      discountValue: number | null;
    };

type ChargeMode = EnrolFormInput["charge_mode"];
const PROPOSAL_DELAY_MS = 250;

/** Which first-charge choices make sense for a proposal. The first one is the default. */
function offeredModes(proposal: FirstChargeProposal | null): ChargeMode[] {
  if (!proposal) return [];
  // No lessons left: nothing is charged until next month.
  if (proposal.lessonsCounted === 0) return ["prorated", "custom"];
  if (proposal.isProrated) return ["prorated", "full", "custom"];
  // Joined before the month's first lesson: the full month.
  return ["full", "custom"];
}

function EnrolForm({
  target,
  groups,
  today,
  onClose,
}: {
  target: EnrolTarget;
  groups: OpenGroup[];
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const transfer = target.kind === "transfer";
  const fixedGroup = target.kind === "enrol" ? target.group : undefined;
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<GroupErrorKey | null>(null);
  const [student, setStudent] = useState<StudentOption | null>(target.student ?? null);
  const [proposal, setProposal] = useState<FirstChargeProposal | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EnrolFormInput>({
    resolver: zodResolver(enrolFormSchema),
    defaultValues: {
      student_id: target.student?.id ?? "",
      group_id: fixedGroup?.id ?? "",
      joined_on: today,
      note: "",
      credit_amount: "",
      credit_note: "",
      discount_kind:
        transfer && (target.discountKind === "percent" || target.discountKind === "amount")
          ? target.discountKind
          : "none",
      discount_value: transfer && target.discountValue ? String(target.discountValue) : "",
      charge_mode: "prorated",
      custom_amount: "",
      charge_note: "",
    },
  });

  const [groupId, joinedOn, discountKind, discountValue, chargeMode] = useWatch({
    control,
    name: ["group_id", "joined_on", "discount_kind", "discount_value", "charge_mode"],
  });

  // The proposal comes from the database, the same function enrolment uses.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const next = groupId
        ? await proposeFirstCharge({
            group_id: groupId,
            joined_on: joinedOn,
            discount_kind: discountKind,
            discount_value: discountValue,
          })
        : null;
      if (current) setProposal(next);
    }, PROPOSAL_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [groupId, joinedOn, discountKind, discountValue]);

  const offered = offeredModes(proposal);
  useEffect(() => {
    if (offered.length > 0 && !offered.includes(chargeMode)) setValue("charge_mode", offered[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the offer changes
  }, [offered.join(","), chargeMode, setValue]);

  const group = groups.find((candidate) => candidate.id === groupId);
  const full = group?.capacity != null && group.students >= group.capacity;
  const message = (key: string | undefined) => (key ? t(`errors.${key as GroupErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = transfer
        ? await transferStudent({ ...values, enrollment_id: target.enrollmentId })
        : await enrolStudent(values);
      if (!result.ok) return setFormError(result.error);
      toast(t(transfer ? "enrol.transferDone" : "enrol.done"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        {target.student ? null : (
          <Field label={t("enrol.student")} htmlFor="enrol-student" error={message(errors.student_id?.message)}>
            <StudentPicker
              id="enrol-student"
              value={student}
              excludeGroupId={fixedGroup?.id}
              invalid={Boolean(errors.student_id)}
              onChange={(next) => {
                setStudent(next);
                setValue("student_id", next?.id ?? "", { shouldValidate: Boolean(errors.student_id) });
              }}
            />
          </Field>
        )}

        {transfer ? (
          <fieldset className="flex flex-col gap-3 rounded-card border border-border p-3">
            <legend className="px-1 text-footnote text-text-secondary">
              {t("enrol.creditFor", { group: target.fromGroup.name })}
            </legend>
            <p className="text-footnote text-text-secondary">{t("enrol.creditHint")}</p>
            <Field
              label={t("enrol.creditAmount")}
              htmlFor="enrol-credit"
              error={message(errors.credit_amount?.message)}
            >
              <Input
                id="enrol-credit"
                inputMode="numeric"
                autoComplete="off"
                className="numeric"
                aria-invalid={errors.credit_amount ? true : undefined}
                {...register("credit_amount")}
              />
            </Field>
            <Field
              label={t("enrol.creditNote")}
              htmlFor="enrol-credit-note"
              error={message(errors.credit_note?.message)}
            >
              <Input
                id="enrol-credit-note"
                autoComplete="off"
                aria-invalid={errors.credit_note ? true : undefined}
                {...register("credit_note")}
              />
            </Field>
          </fieldset>
        ) : null}

        {fixedGroup ? null : (
          <Field
            label={t(transfer ? "enrol.toGroup" : "enrol.group")}
            htmlFor="enrol-group"
            error={message(errors.group_id?.message)}
          >
            <Controller
              control={control}
              name="group_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="enrol-group" aria-invalid={errors.group_id ? true : undefined}>
                    <SelectValue placeholder={t("enrol.chooseGroup")} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups
                      .filter((option) => !transfer || option.id !== target.fromGroup.id)
                      .map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        )}
        {full && group ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-control bg-warning-tint px-3 py-2 text-footnote text-warning"
          >
            <TriangleAlert className="size-4" aria-hidden />
            {t("enrol.groupFull", { students: group.students, capacity: group.capacity ?? 0 })}
          </p>
        ) : null}

        <Field
          label={t(transfer ? "enrol.transferDate" : "enrol.joinDate")}
          htmlFor="enrol-date"
          error={message(errors.joined_on?.message)}
        >
          <Input
            id="enrol-date"
            type="date"
            max={transfer ? today : undefined}
            aria-invalid={errors.joined_on ? true : undefined}
            {...register("joined_on")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("enrol.discount")} htmlFor="enrol-discount-kind">
            <Controller
              control={control}
              name="discount_kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="enrol-discount-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("enrol.discountNone")}</SelectItem>
                    <SelectItem value="percent">{t("enrol.discountPercent")}</SelectItem>
                    <SelectItem value="amount">{t("enrol.discountAmount")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {discountKind === "none" ? null : (
            <Field
              label={t(discountKind === "percent" ? "enrol.discountPercentValue" : "enrol.discountAmountValue")}
              htmlFor="enrol-discount-value"
              error={message(errors.discount_value?.message)}
            >
              <Input
                id="enrol-discount-value"
                inputMode="numeric"
                autoComplete="off"
                className="numeric"
                aria-invalid={errors.discount_value ? true : undefined}
                {...register("discount_value")}
              />
            </Field>
          )}
        </div>

        {transfer ? null : (
          <Field label={t("enrol.note")} htmlFor="enrol-note" error={message(errors.note?.message)}>
            <Input id="enrol-note" autoComplete="off" {...register("note")} />
          </Field>
        )}

        <fieldset className="flex flex-col gap-2" data-slot="first-charge">
          <legend className="mb-1.5 text-footnote text-text-secondary">{t("enrol.firstCharge")}</legend>
          {!proposal ? (
            <p className="rounded-control border border-border px-3 py-2 text-body text-text-secondary">
              {t(groupId ? "enrol.calculating" : "enrol.chooseGroupFirst")}
            </p>
          ) : (
            <Controller
              control={control}
              name="charge_mode"
              render={({ field }) => (
                <RadioGroup.Root
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-label={t("enrol.firstCharge")}
                  className="flex flex-col gap-2"
                >
                  {offered.map((mode) => {
                    const nothing = mode === "prorated" && proposal.lessonsCounted === 0;
                    const amount =
                      mode === "prorated" ? proposal.amount : mode === "full" ? proposal.fullAmount : null;
                    return (
                      <RadioGroup.Item
                        key={mode}
                        value={mode}
                        data-charge-mode={mode}
                        className="group flex items-center gap-3 rounded-control border border-border px-3 py-2 text-left outline-none motion-fast focus-visible:ring-3 focus-visible:ring-focus-ring data-[state=checked]:border-purple data-[state=checked]:bg-purple-tint"
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg group-data-[state=checked]:border-purple">
                          <RadioGroup.Indicator className="size-2 rounded-full bg-purple" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-body text-text">
                            {nothing ? t("enrol.nothing") : t(`enrol.mode.${mode}`)}
                          </span>
                          <span className="text-footnote text-text-secondary">
                            {mode === "custom"
                              ? t("enrol.customDetail")
                              : nothing
                                ? t("enrol.nothingDetail")
                                : mode === "prorated"
                                  ? t("enrol.proratedDetail", {
                                      counted: proposal.lessonsCounted,
                                      total: proposal.lessonsInMonth,
                                    })
                                  : t(proposal.isProrated ? "enrol.fullDetail" : "enrol.beforeFirst")}
                          </span>
                        </span>
                        {amount === null ? null : (
                          <MoneyText amount={amount} className="shrink-0 font-medium text-text" />
                        )}
                      </RadioGroup.Item>
                    );
                  })}
                </RadioGroup.Root>
              )}
            />
          )}
          {chargeMode === "custom" && proposal ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("enrol.customAmount")}
                htmlFor="enrol-custom-amount"
                error={message(errors.custom_amount?.message)}
              >
                <Input
                  id="enrol-custom-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  className="numeric"
                  aria-invalid={errors.custom_amount ? true : undefined}
                  {...register("custom_amount")}
                />
              </Field>
              <Field
                label={t("enrol.customNote")}
                htmlFor="enrol-charge-note"
                error={message(errors.charge_note?.message)}
              >
                <Input
                  id="enrol-charge-note"
                  autoComplete="off"
                  aria-invalid={errors.charge_note ? true : undefined}
                  {...register("charge_note")}
                />
              </Field>
            </div>
          ) : null}
        </fieldset>

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
        <Button type="submit" variant="primary" disabled={pending || !proposal}>
          {t(transfer ? "enrol.saveTransfer" : "enrol.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Enrol a student in a group with the first-charge choice, or transfer one
 * from another group (leave A and enrol B on the same date).
 */
export function EnrolSheet({
  target,
  groups,
  today,
  onClose,
}: {
  target: EnrolTarget | null;
  groups: OpenGroup[];
  /** "YYYY-MM-DD" in Tashkent. */
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("groups.enrol");
  const title = !target
    ? ""
    : target.kind === "transfer"
      ? t("transferTitle", { student: target.student.full_name })
      : target.student
        ? t("titleStudent", { student: target.student.full_name })
        : t("titleGroup", { group: target.group?.name ?? "" });

  return (
    <Sheet open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {target?.kind === "transfer"
              ? t("transferHint", { group: target.fromGroup.name })
              : t("hint")}
          </SheetDescription>
        </SheetHeader>
        {target ? (
          <EnrolForm
            key={target.kind === "transfer" ? target.enrollmentId : `${target.student?.id}-${target.group?.id}`}
            target={target}
            groups={groups}
            today={today}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
