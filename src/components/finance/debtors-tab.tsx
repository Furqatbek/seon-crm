"use client";

import { BellRing, CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { SoonButton } from "@/components/shared/soon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { DebtorRow } from "@/lib/finance/queries";
import { formatDate, formatMonth } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";

import { useTakePayment } from "./take-payment-sheet";

/** Student, groups, debt, oldest unpaid month, last payment, and Remind. */
export function DebtorsTab({ rows, total, page }: { rows: DebtorRow[]; total: number; page: number }) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const { setParams } = useUrlState();
  const takePayment = useTakePayment();
  if (total === 0) {
    return <EmptyState icon={CircleCheck}>{t("debtors.empty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-text-secondary">{t("debtors.count", { count: total })}</p>
        {/* Reminders are sent once notifications are connected. */}
        <SoonButton hint={t("debtors.remindSoon")}>
          <BellRing aria-hidden />
          {t("debtors.remindAll")}
        </SoonButton>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.student")}</TableHead>
            <TableHead>{t("fields.groups")}</TableHead>
            <TableHead numeric>{t("fields.debt")}</TableHead>
            <TableHead>{t("fields.oldestUnpaid")}</TableHead>
            <TableHead>{t("fields.lastPayment")}</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-debtor-row={row.id}>
              <TableCell>
                <Link
                  href={`/students/${row.id}`}
                  className="rounded-inner font-medium whitespace-nowrap outline-none hover:text-purple focus-visible:ring-3 focus-visible:ring-focus-ring"
                >
                  {row.full_name}
                </Link>
              </TableCell>
              <TableCell>
                {row.groups.length > 0 ? (
                  <span className="flex gap-1">
                    {row.groups.map((group) => (
                      <Badge key={group.id}>{group.name}</Badge>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell numeric>
                {/* The debt is the balance, shown as owed. */}
                <MoneyText amount={row.balance} debt />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {row.oldestUnpaidMonth ? formatMonth(row.oldestUnpaidMonth, locale) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap numeric">
                {row.lastPaymentAt ? formatDate(row.lastPaymentAt, locale, { year: true }) : t("debtors.never")}
              </TableCell>
              <TableCell>
                <span className="flex items-center justify-end gap-2">
                  <Button onClick={() => takePayment(row.id)}>{t("payment.title")}</Button>
                  <SoonButton hint={t("debtors.remindSoon")}>{t("debtors.remind")}</SoonButton>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        total={total}
        onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
      />
    </div>
  );
}
