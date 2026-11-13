import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { ChargesTab } from "@/components/finance/charges-tab";
import { DebtorsTab } from "@/components/finance/debtors-tab";
import { FinanceScreen } from "@/components/finance/finance-screen";
import { PaymentsTab } from "@/components/finance/payments-tab";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser, type UserRole } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import {
  getDebtors,
  getMonthCharges,
  getMonthSummary,
  getPayments,
  type MonthSummary,
} from "@/lib/finance/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { financeSearchSchema, type FinanceSearch, type FinanceTab } from "@/lib/validation/finance";

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

async function Finance({ searchParams }: { searchParams: SearchParams }) {
  const search = financeSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;
  const isOwner = user.role === "owner";

  const today = tashkentDate(new Date());
  const currentMonth = today.slice(0, 7);
  const month = search.month && search.month <= currentMonth ? search.month : currentMonth;
  // Billed and collected totals, and generating charges, are the owner's.
  const tabs: FinanceTab[] = isOwner ? ["payments", "debtors", "charges"] : ["payments", "debtors"];
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
    </FinanceScreen>
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <PageHeader title={t("finance")} />;
}

export default async function FinancePage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Finance searchParams={searchParams} />
    </Suspense>
  );
}
