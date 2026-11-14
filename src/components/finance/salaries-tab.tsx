"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Calculator, ChevronDown, ChevronRight, Ellipsis, HandCoins } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RateValue } from "@/components/teachers/pay-tab";
import { Link } from "@/i18n/navigation";
import { calculatePayouts, markPayoutPaid, savePayoutAdjustment } from "@/lib/finance/actions";
import type { PayoutRow } from "@/lib/finance/queries";
import { formatDate, formatMoneyInput, formatMonth } from "@/lib/format";
import {
  payoutAdjustmentSchema,
  type FinanceErrorKey,
  type PayoutAdjustmentInput,
  type PayoutAdjustmentValues,
} from "@/lib/validation/finance";

/** The payout's rate, shown the way the teacher's Pay tab shows it. */
function Rate({ payout }: { payout: PayoutRow }) {
  const percent = payout.pay_type === "percent_of_revenue";
  return (
    <RateValue
      rate={{ pay_type: payout.pay_type, amount: percent ? null : payout.rate, percent: percent ? payout.rate : null }}
    />
  );
}

/** What the calculated amount is made of, group by group. */
function Breakdown({ payout }: { payout: PayoutRow }) {
  const t = useTranslations("finance");
  const locale = useLocale();
  return (
    <div className="flex max-w-xl flex-col gap-3 py-3" data-slot="payout-breakdown">
      <p className="text-footnote text-text-secondary">
        {t("salaries.rate")}: <Rate payout={payout} />
      </p>
      {payout.breakdown.length === 0 ? (
        <p className="text-footnote text-text-secondary">{t("salaries.noLines")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {payout.breakdown.map((line) => (
            <li key={line.group_id} className="flex items-center justify-between gap-4 py-2" data-breakdown-line>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{line.group_name}</span>
                <span className="text-footnote text-text-secondary">
                  {payout.pay_type === "percent_of_revenue" ? (
                    <>
                      <MoneyText amount={line.collected} /> {t("salaries.collected")}
                    </>
                  ) : (
                    t("salaries.lessons", { count: line.lessons })
                  )}
                </span>
              </span>
              {line.amount !== null ? <MoneyText amount={line.amount} /> : null}
            </li>
          ))}
        </ul>
      )}
      {payout.note ? (
        <p className="text-footnote text-text-secondary">
          {t("salaries.note")}: {payout.note}
        </p>
      ) : null}
      {payout.paid_at ? (
        <p className="text-footnote text-text-secondary">
          {t("salaries.paidOn", { date: formatDate(payout.paid_at, locale, { year: true }) })}
        </p>
      ) : null}
    </div>
  );
}

function AdjustForm({ payout, onClose }: { payout: PayoutRow; onClose: () => void }) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<FinanceErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<PayoutAdjustmentInput, unknown, PayoutAdjustmentValues>({
    resolver: zodResolver(payoutAdjustmentSchema),
    defaultValues: {
      payout_id: payout.id,
      bonus: payout.bonus > 0 ? formatMoneyInput(payout.bonus) : "",
      deduction: payout.deduction > 0 ? formatMoneyInput(payout.deduction) : "",
      note: payout.note ?? "",
    },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as FinanceErrorKey}`) : null);

  const onSubmit = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await savePayoutAdjustment(getValues());
      if (!result.ok) return setFormError(result.error);
      toast(t("salaries.adjustSaved"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <div className="flex items-center justify-between gap-3 rounded-control bg-bg-subtle px-3 py-2 text-body">
          <span className="text-text-secondary">{t("salaries.calculatedColumn")}</span>
          <MoneyText amount={payout.calculated} className="font-medium" />
        </div>
        <Field label={t("salaries.bonusField")} htmlFor="payout-bonus" error={message(errors.bonus?.message)}>
          <Input
            id="payout-bonus"
            inputMode="numeric"
            autoComplete="off"
            className="numeric"
            aria-invalid={errors.bonus ? true : undefined}
            {...register("bonus")}
          />
        </Field>
        <Field
          label={t("salaries.deductionField")}
          htmlFor="payout-deduction"
          error={message(errors.deduction?.message)}
        >
          <Input
            id="payout-deduction"
            inputMode="numeric"
            autoComplete="off"
            className="numeric"
            aria-invalid={errors.deduction ? true : undefined}
            {...register("deduction")}
          />
        </Field>
        <Field label={t("salaries.noteField")} htmlFor="payout-note" error={message(errors.note?.message)}>
          <Input
            id="payout-note"
            autoComplete="off"
            aria-invalid={errors.note ? true : undefined}
            {...register("note")}
          />
        </Field>
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
        <Button type="submit" variant="primary" disabled={pending}>
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Owner only: Calculate, one row per teacher with an expandable breakdown,
 * bonus and deduction with a note, and Mark paid, which locks the row.
 */
export function SalariesTab({
  month,
  rows,
  monthOver,
}: {
  month: string;
  rows: PayoutRow[];
  /** False for the month still in progress: its lessons and payments are not all in yet. */
  monthOver: boolean;
}) {
  const t = useTranslations("finance");
  const tTeachers = useTranslations("teachers");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [adjusting, setAdjusting] = useState<PayoutRow | null>(null);
  const [paying, setPaying] = useState<PayoutRow | null>(null);
  const [error, setError] = useState<FinanceErrorKey | null>(null);
  const [busy, startTransition] = useTransition();
  const monthName = formatMonth(month, locale);

  function calculate() {
    setError(null);
    startTransition(async () => {
      const result = await calculatePayouts(month);
      if (!result.ok) return setError(result.error);
      toast(t("salaries.calculated", { count: result.data.count }));
    });
  }

  function markPaid() {
    if (!paying) return;
    setError(null);
    startTransition(async () => {
      // The amount agreed to in the dialog is the amount that gets locked.
      const result = await markPayoutPaid({ payout_id: paying.id, expected: paying.final_amount });
      if (!result.ok) return setError(result.error);
      setPaying(null);
      toast(t("salaries.markedPaid"));
    });
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-footnote text-text-secondary">{t("salaries.hint")}</p>
        <Button onClick={calculate} disabled={busy} className="w-full sm:w-auto">
          <Calculator aria-hidden />
          {t("salaries.calculate")}
        </Button>
      </div>
      {error && !paying ? (
        <p role="alert" className="text-footnote text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={HandCoins}>{t("salaries.empty", { month: monthName })}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-px" />
              <TableHead>{t("fields.teacher")}</TableHead>
              <TableHead>{tTeachers("fields.payType")}</TableHead>
              <TableHead numeric>{t("salaries.calculatedColumn")}</TableHead>
              <TableHead numeric>{t("salaries.bonus")}</TableHead>
              <TableHead numeric>{t("salaries.deduction")}</TableHead>
              <TableHead numeric>{t("salaries.toPay")}</TableHead>
              <TableHead>{t("salaries.status")}</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const name = row.teacher?.full_name ?? "—";
              const open = expanded.has(row.id);
              return (
                <Fragment key={row.id}>
                  <TableRow data-payout-row={row.teacher?.id} data-payout-status={row.status}>
                    <TableCell className="px-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-expanded={open}
                        aria-label={t(open ? "salaries.hideBreakdown" : "salaries.showBreakdown", { teacher: name })}
                        onClick={() => toggle(row.id)}
                      >
                        {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {row.teacher ? (
                        <Link
                          href={`/teachers/${row.teacher.id}`}
                          className="rounded-inner font-medium whitespace-nowrap outline-none hover:text-purple focus-visible:ring-3 focus-visible:ring-focus-ring"
                        >
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{tTeachers(`payType.${row.pay_type}`)}</TableCell>
                    <TableCell numeric data-cell="calculated">
                      <MoneyText amount={row.calculated} />
                    </TableCell>
                    <TableCell numeric data-cell="bonus">
                      {row.bonus > 0 ? <MoneyText amount={row.bonus} /> : "—"}
                    </TableCell>
                    <TableCell numeric data-cell="deduction">
                      {row.deduction > 0 ? <MoneyText amount={row.deduction} /> : "—"}
                    </TableCell>
                    <TableCell numeric data-cell="to-pay">
                      <MoneyText amount={row.final_amount} debt className="font-medium" />
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={row.status === "paid" ? "success" : "neutral"}>
                        {t(`salaries.${row.status}`)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="px-1">
                      {/* A paid payout is locked: nothing is left to do with it. */}
                      {row.status === "draft" ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t("salaries.rowActions", { teacher: name })}>
                              <Ellipsis aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setAdjusting(row)}>{t("salaries.adjust")}</DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setError(null);
                                setPaying(row);
                              }}
                            >
                              {t("salaries.markPaid")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={8} className="h-auto">
                        <Breakdown payout={row} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Sheet open={adjusting !== null} onOpenChange={(next) => !next && setAdjusting(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("salaries.adjustTitle", { teacher: adjusting?.teacher?.full_name ?? "" })}</SheetTitle>
            <SheetDescription>{t("salaries.adjustHint")}</SheetDescription>
          </SheetHeader>
          {adjusting ? <AdjustForm payout={adjusting} onClose={() => setAdjusting(null)} /> : null}
        </SheetContent>
      </Sheet>

      <Dialog open={paying !== null} onOpenChange={(next) => !next && setPaying(null)}>
        <DialogContent>
          {paying ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{t("salaries.markPaidTitle", { teacher: paying.teacher?.full_name ?? "" })}</DialogTitle>
                <DialogDescription>{t("salaries.markPaidBody")}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-3 rounded-control bg-bg-subtle px-3 py-2 text-body">
                <span className="text-text-secondary">
                  {t("salaries.toPay")} · {monthName}
                </span>
                <MoneyText amount={paying.final_amount} className="font-medium" />
              </div>
              {!monthOver ? (
                <p className="rounded-control bg-warning-tint px-3 py-2 text-footnote text-warning" data-slot="month-open-warning">
                  {t("salaries.monthOpenWarning", { month: monthName })}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-footnote text-danger">
                  {t(`errors.${error}`)}
                </p>
              ) : null}
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPaying(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button variant="primary" disabled={busy} onClick={markPaid}>
                  {t("salaries.markPaid")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
