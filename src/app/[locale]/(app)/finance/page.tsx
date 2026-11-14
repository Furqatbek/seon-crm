import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { AdjustmentsTab } from "@/components/finance/adjustments-tab";
import { ChargesTab } from "@/components/finance/charges-tab";
import { DebtorsTab } from "@/components/finance/debtors-tab";
import { ExpensesTab } from "@/components/finance/expenses-tab";
import { FinanceScreen } from "@/components/finance/finance-screen";
import { PaymentsTab } from "@/components/finance/payments-tab";
import { SalariesTab } from "@/components/finance/salaries-tab";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser, type UserRole } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import {
  getAdjustments,
  getDebtors,
  getExpenses,
  getMonthCharges,
  getMonthSummary,
  getPayments,
  getPayouts,
  type MonthSummary,
} from "@/lib/finance/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import {
  FINANCE_TABS,
  MANAGER_FINANCE_TABS,
  financeSearchSchema,
  type FinanceSearch,
  type FinanceTab,
} from "@/lib/validation/finance";

async function Payments({ search, month, role }: { search: FinanceSearch; month: string; role: UserRole }) {
  const { rows, total } = await getPayments({ month, method: search.method, page: search.page });
  return <PaymentsTab rows={rows} total={total} page={search.page} method={search.method} role={role} />;
}

async function Debtors({ page }: { page: number }) {
  const { rows, total } = await getDebtors(page);
  return <DebtorsTab rows={rows} total={total} page={page} />;
}

async function Charges({
  month,
  page,
  summary,
  canGenerate,
}: {
  month: string;
  page: number;
  summary: MonthSummary;
  canGenerate: boolean;
}) {
  const { rows, total } = await getMonthCharges(month, page);
  return (
    <ChargesTab month={month} summary={summary} rows={rows} total={total} page={page} canGenerate={canGenerate} />
  );
}

// The three below are the owner's: the page never renders them for a manager,
// and the database returns a manager no rows.

async function Expenses({ search, month, today }: { search: FinanceSearch; month: string; today: string }) {
  const { rows, total } = await getExpenses({ month, category: search.category, page: search.page });
  return <ExpensesTab rows={rows} total={total} page={search.page} category={search.category} today={today} />;
}

async function Salaries({ month, locale, monthOver }: { month: string; locale: string; monthOver: boolean }) {
  return <SalariesTab month={month} rows={await getPayouts(month, locale)} monthOver={monthOver} />;
}

async function Adjustments({ month, page }: { month: string; page: number }) {
  const { rows, total } = await getAdjustments(month, page);
  return <AdjustmentsTab rows={rows} total={total} page={page} />;
}

async function Finance({ searchParams, locale }: { searchParams: SearchParams; locale: string }) {
  const search = financeSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;
  const isOwner = user.role === "owner";

  const today = tashkentDate(new Date());
  const currentMonth = today.slice(0, 7);
  const month = search.month && search.month <= currentMonth ? search.month : currentMonth;
  // Charges, expenses, salaries and adjustments are the owner's.
  const tabs: readonly FinanceTab[] = isOwner ? FINANCE_TABS : MANAGER_FINANCE_TABS;
  const tab = tabs.includes(search.tab) ? search.tab : "payments";
  const summary = isOwner ? await getMonthSummary(month) : null;

  return (
    <FinanceScreen
      tab={tab}
      tabs={tabs}
      month={month}
      currentMonth={currentMonth}
      today={today}
      role={user.role}
      summary={summary}
    >
      {tab === "payments" ? <Payments search={search} month={month} role={user.role} /> : null}
      {tab === "debtors" ? <Debtors page={search.page} /> : null}
      {tab === "charges" && summary ? <Charges month={month} page={search.page} summary={summary} canGenerate={month === currentMonth} /> : null}
      {tab === "expenses" && isOwner ? <Expenses search={search} month={month} today={today} /> : null}
      {tab === "salaries" && isOwner ? <Salaries month={month} locale={locale} monthOver={month < currentMonth} /> : null}
      {tab === "adjustments" && isOwner ? <Adjustments month={month} page={search.page} /> : null}
    </FinanceScreen>
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("finance")} kpis={4} tabs={3} filters={false} />;
}

export default async function FinancePage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Finance searchParams={searchParams} locale={locale} />
    </Suspense>
  );
}
