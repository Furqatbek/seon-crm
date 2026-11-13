"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { MoneyText } from "@/components/ui/money-text";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rateOn, rateStatus, type PayRate } from "@/lib/domain/pay-rates";
import { tashkentDate, tashkentMonth } from "@/lib/domain/time";
import { formatDay, formatMonth } from "@/lib/format";
import type { TeacherPayout, TeacherRate } from "@/lib/teachers/queries";

import { RateFormSheet } from "./rate-form-sheet";
import { RATE_TONE } from "./teacher-meta";

/** "5 000 000 soʻm a month", "120 000 soʻm per lesson", "40% of collected fees". */
export function RateValue({ rate }: { rate: Pick<PayRate, "pay_type" | "amount" | "percent"> }) {
  const t = useTranslations("teachers.pay");
  if (rate.pay_type === "percent_of_revenue") {
    return <span className="whitespace-nowrap numeric">{t("percentValue", { percent: rate.percent ?? 0 })}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <MoneyText amount={rate.amount ?? 0} />{" "}
      {t(rate.pay_type === "per_lesson" ? "perLesson" : "perMonth")}
    </span>
  );
}

/** Owner only: rate history, Set new rate, past payouts. */
export function PayTab({
  teacherId,
  rates,
  payouts,
  now,
}: {
  teacherId: string;
  rates: TeacherRate[];
  payouts: TeacherPayout[];
  now: Date;
}) {
  const t = useTranslations("teachers");
  const locale = useLocale();
  const [formOpen, setFormOpen] = useState(false);
  const today = tashkentDate(now);
  const current = rateOn(rates, today);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="rates-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rates-title" className="text-headline text-text">
            {t("pay.rateHistory")}
          </h2>
          <Button onClick={() => setFormOpen(true)}>
            <Plus aria-hidden />
            {t("pay.setNewRate")}
          </Button>
        </div>

        <KpiCard label={t("pay.currentRate")} className="sm:max-w-sm">
          {current ? (
            <>
              <span className="block text-footnote font-normal text-text-secondary">
                {t(`payType.${current.pay_type}`)}
              </span>
              <RateValue rate={current} />
            </>
          ) : (
            <span className="text-body font-normal text-text-secondary">{t("pay.noRate")}</span>
          )}
        </KpiCard>

        {rates.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pay.effectiveFrom")}</TableHead>
                <TableHead>{t("fields.payType")}</TableHead>
                <TableHead numeric>{t("pay.rate")}</TableHead>
                <TableHead>{t("pay.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => {
                const status = rateStatus(rate, rates, today);
                return (
                  <TableRow key={rate.id} data-rate={rate.effective_from} data-rate-status={status}>
                    <TableCell className="whitespace-nowrap numeric">
                      {formatDay(rate.effective_from, locale, { year: true })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{t(`payType.${rate.pay_type}`)}</TableCell>
                    <TableCell numeric>
                      <RateValue rate={rate} />
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={RATE_TONE[status]}>{t(`pay.rateStatus.${status}`)}</StatusPill>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </section>

      <section aria-labelledby="payouts-title" className="flex flex-col gap-4">
        <h2 id="payouts-title" className="text-headline text-text">
          {t("pay.payouts")}
        </h2>
        {payouts.length === 0 ? (
          <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
            {t("pay.noPayouts")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pay.month")}</TableHead>
                <TableHead>{t("fields.payType")}</TableHead>
                <TableHead numeric>{t("pay.calculated")}</TableHead>
                <TableHead numeric>{t("pay.bonus")}</TableHead>
                <TableHead numeric>{t("pay.deduction")}</TableHead>
                <TableHead numeric>{t("pay.paid")}</TableHead>
                <TableHead>{t("pay.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((payout) => (
                <TableRow key={payout.id} data-payout={payout.month} data-payout-status={payout.status}>
                  <TableCell className="whitespace-nowrap numeric">
                    {formatMonth(payout.month.slice(0, 7), locale)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t(`payType.${payout.pay_type}`)}</TableCell>
                  <TableCell numeric>
                    <MoneyText amount={payout.calculated} />
                  </TableCell>
                  <TableCell numeric>{payout.bonus > 0 ? <MoneyText amount={payout.bonus} /> : "—"}</TableCell>
                  <TableCell numeric>{payout.deduction > 0 ? <MoneyText amount={payout.deduction} /> : "—"}</TableCell>
                  <TableCell numeric>
                    <MoneyText amount={payout.final_amount} className="font-medium" />
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={payout.status === "paid" ? "success" : "neutral"}>
                      {t(`pay.payoutStatus.${payout.status}`)}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <RateFormSheet
        open={formOpen}
        teacherId={teacherId}
        // The rate in effect on the 1st pays the month, so suggest the next 1st.
        defaultDate={tashkentMonth(now, 1).start}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
