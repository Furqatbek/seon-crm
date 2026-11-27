"use client";

import { useTranslations } from "next-intl";

import { KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { conversionPercent } from "@/lib/domain/open-lessons";
import { formatPercent } from "@/lib/format";
import type { VoucherReportRow } from "@/lib/offers/queries";

/**
 * Vouchers issued in the period, by type: how many were used to enrol (the
 * conversion) and how many ran out. Every count arrives from the database.
 */
export function VouchersReport({ rows, locale }: { rows: VoucherReportRow[]; locale: Locale }) {
  const t = useTranslations("offers.report");
  const tType = useTranslations("offers.types");
  const total = rows.reduce((sum, row) => ({ issued: sum.issued + row.issued, redeemed: sum.redeemed + row.redeemed, expired: sum.expired + row.expired }), { issued: 0, redeemed: 0, expired: 0 });
  const percent = (issued: number, redeemed: number) => {
    const value = conversionPercent(issued, redeemed);
    return value === null ? "—" : formatPercent(value, locale);
  };
  return (
    <div className="flex flex-col gap-6" data-slot="vouchers-report">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("issued")}>{total.issued}</KpiCard>
        <KpiCard label={t("redeemed")}>{total.redeemed}</KpiCard>
        <KpiCard label={t("conversion")}>{percent(total.issued, total.redeemed)}</KpiCard>
        <KpiCard label={t("expired")}>{total.expired}</KpiCard>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-headline text-text">{t("byType")}</h2>
        <p className="text-footnote text-text-secondary">{t("hint")}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("type")}</TableHead>
              <TableHead className="text-right">{t("issued")}</TableHead>
              <TableHead className="text-right">{t("redeemed")}</TableHead>
              <TableHead className="text-right">{t("conversion")}</TableHead>
              <TableHead className="text-right">{t("expired")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.type} data-voucher-type={row.type}>
                <TableCell>{tType(row.type)}</TableCell>
                <TableCell className="numeric text-right">{row.issued}</TableCell>
                <TableCell className="numeric text-right">{row.redeemed}</TableCell>
                <TableCell className="numeric text-right">{percent(row.issued, row.redeemed)}</TableCell>
                <TableCell className="numeric text-right">{row.expired}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
