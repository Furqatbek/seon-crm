"use client";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { MonthNav } from "@/components/shared/month-nav";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { MoneyText } from "@/components/ui/money-text";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserRole } from "@/lib/auth";
import type { MonthSummary } from "@/lib/finance/queries";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { FinanceTab } from "@/lib/validation/finance";

import { usePendingReceipts } from "./receipts-provider";
import { TakePaymentContext, TakePaymentSheet, type ReceiptToApprove } from "./take-payment-sheet";

// On a phone six stacked cards would push the tabs off the screen: there each
// figure is one row, label on the left and amount on the right.
const STRIP_CARD =
  "max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:px-4 max-sm:py-2.5 max-sm:[&>span:last-child]:text-headline";

/**
 * The Finance frame: month, the owner's month strip, Take payment and the
 * tab bar. The active tab's content is rendered on the server and passed in.
 */
export function FinanceScreen({
  tab,
  tabs,
  month,
  currentMonth,
  today,
  role,
  summary,
  children,
}: {
  tab: FinanceTab;
  /** The tabs this user has: a manager has Payments and Debtors only. */
  tabs: readonly FinanceTab[];
  month: string;
  currentMonth: string;
  today: string;
  role: UserRole;
  /** Owner only. */
  summary: MonthSummary | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("finance");
  const tNav = useTranslations("nav");
  const { setParams } = useUrlState();
  const [payment, setPayment] = useState<{ studentId?: string; receipt?: ReceiptToApprove } | null>(null);
  const [shownTab, showTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();
  const tabList = useRef<HTMLDivElement>(null);
  // Receipts waiting for review, kept live by the receipts provider.
  const waitingReceipts = usePendingReceipts();

  // The owner's six tabs do not fit a phone: keep the open one in view.
  useEffect(() => {
    const list = tabList.current;
    const active = list?.querySelector<HTMLElement>('[data-state="active"]');
    if (!list || !active) return;
    // Only the tab bar moves, sideways; the page itself is never scrolled.
    const left = active.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (left + active.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = left + active.offsetWidth - list.clientWidth;
    }
  }, [shownTab]);

  return (
    <TakePaymentContext value={(studentId, receipt) => setPayment({ studentId, receipt })}>
      <PageHeader
        title={tNav("finance")}
        action={
          <Button variant="primary" onClick={() => setPayment({})}>
            <Wallet aria-hidden />
            {t("payment.title")}
          </Button>
        }
      >
        <MonthNav
          month={month}
          max={currentMonth}
          onChange={(next) => setParams({ month: next === currentMonth ? null : next, page: null })}
        />
      </PageHeader>

      {role === "owner" && summary ? (
        <div className="mb-6 flex flex-col gap-2" data-slot="month-strip">
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
            <KpiCard className={STRIP_CARD} label={t("strip.billed")}>
              <span data-kpi="billed" data-value={summary.billed}>
                <MoneyText amount={summary.billed} />
              </span>
            </KpiCard>
            <KpiCard className={STRIP_CARD} label={t("strip.paid")}>
              <span data-kpi="paid" data-value={summary.paid}>
                <MoneyText amount={summary.paid} className={summary.paid > 0 ? "text-success" : undefined} />
              </span>
            </KpiCard>
            <KpiCard className={STRIP_CARD} label={t("strip.unpaid")}>
              <span data-kpi="unpaid" data-value={summary.unpaid}>
                <MoneyText amount={summary.unpaid} className={summary.unpaid > 0 ? "text-danger" : undefined} />
              </span>
            </KpiCard>
          </div>
          <p className="mb-2 text-footnote text-text-secondary">{t("strip.rule")}</p>
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
            <KpiCard className={STRIP_CARD} label={t("strip.collected")}>
              <span data-kpi="collected" data-value={summary.collected}>
                <MoneyText amount={summary.collected} />
              </span>
            </KpiCard>
            <KpiCard className={STRIP_CARD} label={t("strip.debt")}>
              <span data-kpi="debt" data-value={summary.debt}>
                <MoneyText amount={summary.debt} className={summary.debt > 0 ? "text-danger" : undefined} />
              </span>
            </KpiCard>
            <KpiCard className={STRIP_CARD} label={t("strip.expenses")}>
              <span data-kpi="expenses" data-value={summary.expenses}>
                <MoneyText amount={summary.expenses} />
              </span>
            </KpiCard>
          </div>
        </div>
      ) : null}

      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as FinanceTab);
            setParams({ tab: value === "payments" ? null : value, page: null, method: null, category: null, receipts: null });
          })
        }
        className="gap-6"
      >
        <TabsList ref={tabList}>
          {tabs.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`tabs.${name}`)}
              {name === "receipts" && waitingReceipts > 0 ? (
                <span className="ml-1.5 rounded-full bg-brand px-1.5 text-caption font-medium text-on-brand numeric" data-slot="receipts-count">
                  {waitingReceipts}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={shownTab}>{children}</TabsContent>
      </Tabs>

      <TakePaymentSheet
        open={payment !== null}
        studentId={payment?.studentId}
        receipt={payment?.receipt}
        today={today}
        onClose={() => setPayment(null)}
      />
    </TakePaymentContext>
  );
}
