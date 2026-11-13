"use client";

import { ReceiptText, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { MoneyText } from "@/components/ui/money-text";
import { Pagination } from "@/components/ui/pagination";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import {
  generateMonthlyCharges,
  previewMonthlyCharges,
  type ChargePreview,
} from "@/lib/finance/actions";
import type { ChargeRow, MonthSummary } from "@/lib/finance/queries";
import { formatMonth } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { FinanceErrorKey } from "@/lib/validation/finance";

/**
 * Owner only: billed vs collected for the month, the month's charges, and
 * Generate charges with a preview list before confirming.
 */
export function ChargesTab({
  month,
  summary,
  rows,
  total,
  page,
  canGenerate,
}: {
  month: string;
  summary: MonthSummary;
  rows: ChargeRow[];
  total: number;
  page: number;
  /** Only the current month can be billed by hand. */
  canGenerate: boolean;
}) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { setParams } = useUrlState();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ChargePreview | null>(null);
  const [error, setError] = useState<FinanceErrorKey | null>(null);
  const [busy, startTransition] = useTransition();
  const monthName = formatMonth(month, locale);

  function openPreview() {
    setPreview(null);
    setError(null);
    setOpen(true);
    startTransition(async () => {
      const result = await previewMonthlyCharges(month);
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await generateMonthlyCharges(month);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      toast(t("charges.created", { count: result.data.created }));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* On a phone the two totals take the full width and the button goes below them. */}
        <div className="grid w-full flex-none gap-4 sm:w-auto sm:max-w-xl sm:flex-1 sm:grid-cols-2">
          <KpiCard label={t("charges.billed", { month: monthName })}>
            <MoneyText amount={summary.billed} />
          </KpiCard>
          <KpiCard label={t("charges.collected", { month: monthName })}>
            <MoneyText amount={summary.collected} />
          </KpiCard>
        </div>
        {canGenerate ? (
          <Button onClick={openPreview}>
            <Sparkles aria-hidden />
            {t("charges.generate")}
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText}>{t("charges.empty")}</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.student")}</TableHead>
                <TableHead>{t("fields.group")}</TableHead>
                <TableHead>{t("fields.description")}</TableHead>
                <TableHead numeric>{t("fields.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-charge-row={row.type}>
                  <TableCell>
                    {row.student ? (
                      <Link
                        href={`/students/${row.student.id}?tab=ledger`}
                        className="rounded-inner font-medium whitespace-nowrap outline-none hover:text-purple focus-visible:ring-3 focus-visible:ring-focus-ring"
                      >
                        {row.student.full_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.group?.name ?? "—"}</TableCell>
                  <TableCell>
                    <span className="flex flex-col py-1">
                      <span className="whitespace-nowrap">
                        {row.type === "monthly_fee"
                          ? t("charges.monthlyFee")
                          : t(row.amount < 0 ? "charges.credit" : "charges.adjustment")}
                      </span>
                      <span className="text-footnote text-text-secondary">
                        {[
                          row.is_prorated
                            ? t("charges.prorated", {
                                counted: row.lessons_counted ?? 0,
                                total: row.lessons_in_month ?? 0,
                              })
                            : null,
                          row.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    <MoneyText amount={row.amount} />
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
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("charges.previewTitle", { month: monthName })}</SheetTitle>
            <SheetDescription>{t("charges.previewHint")}</SheetDescription>
          </SheetHeader>
          <SheetBody data-slot="charge-preview">
            {error ? (
              <p role="alert" className="text-footnote text-danger">
                {t(`errors.${error}`)}
              </p>
            ) : !preview ? (
              <p className="text-body text-text-secondary">{t("payment.loading")}</p>
            ) : preview.rows.length === 0 ? (
              <p className="rounded-control bg-bg-subtle px-3 py-2 text-body text-text-secondary">
                {t("charges.nothingToGenerate")}
              </p>
            ) : (
              <>
                <p className="flex items-center justify-between gap-3 rounded-control bg-bg-subtle px-3 py-2 text-body">
                  <span>{t("charges.previewCount", { count: preview.count })}</span>
                  <MoneyText amount={preview.total} className="font-medium" />
                </p>
                <ul className="divide-y divide-border">
                  {preview.rows.map((row) => (
                    <li key={row.enrollmentId} className="flex items-center justify-between gap-3 py-2" data-preview-row>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body text-text">{row.studentName}</span>
                        <span className="truncate text-footnote text-text-secondary">
                          {row.groupName}
                          {row.discountAmount > 0 ? (
                            <>
                              {" · "}
                              {t("charges.discount")} <MoneyText amount={row.discountAmount} />
                            </>
                          ) : null}
                        </span>
                      </span>
                      <MoneyText amount={row.amount} className="shrink-0" />
                    </li>
                  ))}
                </ul>
                {preview.count > preview.rows.length ? (
                  <p className="pt-2 text-footnote text-text-secondary">
                    {t("charges.previewMore", { count: preview.count - preview.rows.length })}
                  </p>
                ) : null}
              </>
            )}
          </SheetBody>
          <SheetFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tCommon(preview?.rows.length === 0 ? "close" : "cancel")}
            </Button>
            {preview && preview.rows.length > 0 ? (
              <Button variant="primary" disabled={busy} onClick={confirm}>
                {t("charges.confirm", { count: preview.count })}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
