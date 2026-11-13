"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, use, useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { StudentPicker } from "@/components/enrolments/student-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import { Link } from "@/i18n/navigation";
import { getPaymentContext, takePayment, type PaymentContext } from "@/lib/finance/actions";
import { formatMoneyInput } from "@/lib/format";
import {
  PAYMENT_METHODS,
  paymentSchema,
  type FinanceErrorKey,
  type PaymentInput,
  type PaymentValues,
} from "@/lib/validation/finance";


/** Lets any part of a screen open the Take payment sheet, optionally for one student. */
export const TakePaymentContext = createContext<(studentId?: string) => void>(() => {});
export const useTakePayment = () => use(TakePaymentContext);

type Saved = { id: string; receiptNo: number; amount: number };

function PaymentForm({
  context,
  today,
  onCancel,
  onSaved,
}: {
  context: PaymentContext;
  today: string;
  onCancel: () => void;
  onSaved: (saved: Saved) => void;
}) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<FinanceErrorKey | null>(null);

  // The group is pre-selected when the student has one active group.
  const active = context.groups.filter((group) => group.active);
  const onlyGroup =
    active.length === 1 ? active[0] : context.groups.length === 1 ? context.groups[0] : null;

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<PaymentInput, unknown, PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      student_id: context.student.id,
      group_id: onlyGroup?.id ?? "",
      // A debtor usually pays what is owed. The debt is only suggested when
      // the student has a single group: a payment is booked to one group, and
      // a debt across two groups must not land on one of them.
      amount: context.suggestedAmount === null ? "" : formatMoneyInput(context.suggestedAmount),
      method: "cash",
      paid_on: today,
      note: "",
    },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as FinanceErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // The server validates the same raw form again.
      const result = await takePayment(getValues());
      if (!result.ok) return setFormError(result.error);
      onSaved({ ...result.data, amount: values.amount });
    });
  });

  if (context.groups.length === 0) {
    return (
      <>
        <SheetBody>
          <p className="rounded-control bg-bg-subtle px-3 py-2 text-body text-text-secondary">
            {t("payment.noGroups")}
          </p>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={onCancel}>
            {tCommon("close")}
          </Button>
        </SheetFooter>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <p className="flex items-center justify-between gap-3 rounded-control bg-bg-subtle px-3 py-2 text-body" data-slot="payment-balance">
          <span className="text-text-secondary">{t("payment.balance")}</span>
          <MoneyText amount={context.balance} debt className="font-medium" />
        </p>

        <Field label={t("fields.group")} htmlFor="payment-group" error={message(errors.group_id?.message)}>
          <Controller
            control={control}
            name="group_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="payment-group" aria-invalid={errors.group_id ? true : undefined}>
                  <SelectValue placeholder={t("payment.chooseGroup")} />
                </SelectTrigger>
                <SelectContent>
                  {context.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label={t("payment.amount")} htmlFor="payment-amount" error={message(errors.amount?.message)}>
          <Input
            id="payment-amount"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="600 000"
            className="numeric"
            aria-invalid={errors.amount ? true : undefined}
            {...register("amount")}
          />
        </Field>

        <Field label={t("fields.method")} htmlFor="payment-method">
          <Controller
            control={control}
            name="method"
            render={({ field }) => (
              <SegmentedControl
                aria-label={t("fields.method")}
                fullWidth
                value={field.value}
                onValueChange={field.onChange}
                options={PAYMENT_METHODS.map((method) => ({ value: method, label: t(`method.${method}`) }))}
              />
            )}
          />
        </Field>

        <Field label={t("fields.date")} htmlFor="payment-date" error={message(errors.paid_on?.message)}>
          <Input
            id="payment-date"
            type="date"
            max={today}
            aria-invalid={errors.paid_on ? true : undefined}
            {...register("paid_on")}
          />
        </Field>

        <Field label={t("fields.note")} htmlFor="payment-note" error={message(errors.note?.message)}>
          <Input id="payment-note" autoComplete="off" {...register("note")} />
        </Field>

        {formError ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${formError}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("payment.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

function Content({
  studentId,
  today,
  onClose,
}: {
  studentId: string | undefined;
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [chosen, setChosen] = useState<string | undefined>(studentId);
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    let current = true;
    if (!chosen) return;
    getPaymentContext(chosen).then((next) => {
      if (!current) return;
      setContext(next);
      setMissing(next === null);
    });
    return () => {
      current = false;
    };
  }, [chosen]);

  if (saved && context) {
    return (
      <>
        <SheetBody className="items-center justify-center gap-3 text-center" data-slot="payment-saved">
          <CircleCheck className="size-10 text-success" aria-hidden />
          <p className="text-headline text-text">{t("payment.saved")}</p>
          <p className="text-title text-text">
            <MoneyText amount={saved.amount} />
          </p>
          <p className="text-body text-text-secondary">
            {context.student.full_name}
            <br />
            <span data-receipt-no={saved.receiptNo}>{t("payment.receipt", { number: saved.receiptNo })}</span>
          </p>
        </SheetBody>
        <SheetFooter>
          <Button asChild>
            <Link href={`/receipts/${saved.id}`} target="_blank">
              <Printer aria-hidden />
              {t("payment.print")}
            </Link>
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("payment.done")}
          </Button>
        </SheetFooter>
      </>
    );
  }

  return (
    <>
      {studentId ? null : (
        <div className="px-6 pb-2">
          <Field label={t("fields.student")} htmlFor="payment-student">
            <StudentPicker
              id="payment-student"
              value={context?.student ?? null}
              onChange={(student) => {
                setContext(null);
                setMissing(false);
                setChosen(student?.id);
              }}
            />
          </Field>
        </div>
      )}
      {context ? (
        <PaymentForm key={context.student.id} context={context} today={today} onCancel={onClose} onSaved={setSaved} />
      ) : (
        <>
          <SheetBody>
            {chosen ? (
              <p className="text-body text-text-secondary">{t(missing ? "errors.notFound" : "payment.loading")}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="secondary" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
          </SheetFooter>
        </>
      )}
    </>
  );
}

/**
 * Take payment: student search (unless the student is given), group, amount,
 * method, date and note. Saving shows the receipt number and a print link.
 */
export function TakePaymentSheet({
  open,
  studentId,
  today,
  onClose,
}: {
  open: boolean;
  /** Fixed when opened from a student page or a debtor row. */
  studentId?: string;
  /** "YYYY-MM-DD" in Tashkent. */
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("finance.payment");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("title")}</SheetDescription>
        </SheetHeader>
        {open ? <Content key={studentId ?? "search"} studentId={studentId} today={today} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}
