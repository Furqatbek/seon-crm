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

import { TakePaymentContext, TakePaymentSheet } from "./take-payment-sheet";

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
  const [payment, setPayment] = useState<{ studentId?: string } | null>(null);
  const [shownTab, showTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();
  const tabList = useRef<HTMLDivElement>(null);

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
    <TakePaymentContext value={(studentId) => setPayment({ studentId })}>
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
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-slot="month-strip">
          <KpiCard label={t("strip.collected")}>
            <span data-kpi="collected" data-value={summary.collected}>
              <MoneyText amount={summary.collected} />
            </span>
          </KpiCard>
          <KpiCard label={t("strip.billed")}>
            <span data-kpi="billed" data-value={summary.billed}>
              <MoneyText amount={summary.billed} />
            </span>
          </KpiCard>
          <KpiCard label={t("strip.debt")}>
            <span data-kpi="debt" data-value={summary.debt}>
              <MoneyText amount={summary.debt} className={summary.debt > 0 ? "text-danger" : undefined} />
            </span>
          </KpiCard>
          <KpiCard label={t("strip.expenses")}>
            <span data-kpi="expenses" data-value={summary.expenses}>
              <MoneyText amount={summary.expenses} />
            </span>
          </KpiCard>
        </div>
      ) : null}

      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as FinanceTab);
            setParams({ tab: value === "payments" ? null : value, page: null, method: null, category: null });
          })
        }
        className="gap-6"
      >
        <TabsList ref={tabList}>
          {tabs.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`tabs.${name}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={shownTab}>{children}</TabsContent>
      </Tabs>

      <TakePaymentSheet
        open={payment !== null}
        studentId={payment?.studentId}
        today={today}
        onClose={() => setPayment(null)}
      />
    </TakePaymentContext>
  );
}
