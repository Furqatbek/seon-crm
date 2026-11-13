"use client";

import { ListChecks } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { AdjustmentRow } from "@/lib/finance/queries";
import { formatDateTime } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";

/** Owner only: every credit and voided payment with who, when and why. */
export function AdjustmentsTab({ rows, total, page }: { rows: AdjustmentRow[]; total: number; page: number }) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const { setParams } = useUrlState();

  if (total === 0) {
    return <EmptyState icon={ListChecks}>{t("adjustments.empty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.date")}</TableHead>
            <TableHead>{t("fields.type")}</TableHead>
            <TableHead>{t("fields.student")}</TableHead>
            <TableHead>{t("fields.group")}</TableHead>
            <TableHead numeric>{t("fields.amount")}</TableHead>
            <TableHead>{t("fields.by")}</TableHead>
            <TableHead>{t("fields.reason")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.kind}-${row.happenedAt}-${index}`} data-adjustment-row={row.kind}>
              <TableCell className="whitespace-nowrap numeric">{formatDateTime(row.happenedAt, locale)}</TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="flex flex-col items-start gap-0.5 py-2">
                  <StatusPill tone={row.kind === "void" ? "danger" : "neutral"}>
                    {t(`adjustments.${row.kind}`)}
                  </StatusPill>
                  {row.receiptNo !== null ? (
                    <span className="text-footnote text-text-secondary numeric">
                      {t("adjustments.receipt", { receipt: row.receiptNo })}
                    </span>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>
                <Link
                  href={`/students/${row.student.id}`}
                  className="rounded-inner font-medium whitespace-nowrap outline-none hover:text-purple focus-visible:ring-3 focus-visible:ring-focus-ring"
                >
                  {row.student.full_name}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">{row.groupName ?? "—"}</TableCell>
              <TableCell numeric>
                <MoneyText amount={row.amount} />
              </TableCell>
              <TableCell className="whitespace-nowrap">{row.byName ?? "—"}</TableCell>
              <TableCell className="min-w-48 text-text-secondary">{row.reason ?? "—"}</TableCell>
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
