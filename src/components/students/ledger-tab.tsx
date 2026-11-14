import { useLocale, useTranslations } from "next-intl";

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
import type { LedgerEntry } from "@/lib/domain/ledger";
import { formatDate, formatMonth } from "@/lib/format";
import type { StudentCharge, StudentPayment } from "@/lib/students/queries";
import { cn } from "@/lib/utils";

export type StudentLedgerEntry = LedgerEntry<StudentCharge, StudentPayment>;

/**
 * Date, description, charge, payment and the running balance, newest first.
 * The balance column is computed in src/lib/domain/ledger.ts.
 */
export function LedgerTab({ entries }: { entries: StudentLedgerEntry[] }) {
  const t = useTranslations("students.ledger");
  const locale = useLocale();

  if (entries.length === 0) {
    return (
      <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
        {t("empty")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("date")}</TableHead>
          <TableHead>{t("description")}</TableHead>
          <TableHead numeric>{t("charge")}</TableHead>
          <TableHead numeric>{t("payment")}</TableHead>
          <TableHead numeric>{t("balance")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const group = entry.kind === "charge" ? entry.charge.group?.name : entry.payment.group?.name;
          return (
            <TableRow key={entry.key} data-ledger={entry.kind} data-balance={entry.balance}>
              <TableCell className="whitespace-nowrap numeric">
                {formatDate(entry.at, locale, { year: true })}
              </TableCell>
              <TableCell>
                <span className="flex min-w-48 flex-col py-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {entry.kind === "payment"
                      ? t("paymentLine", {
                          method: t(`method.${entry.payment.method}`),
                          receipt: entry.payment.receipt_no,
                        })
                      : entry.charge.type === "monthly_fee"
                        ? t("monthlyFee", { month: formatMonth(entry.charge.billing_month, locale) })
                        : t(entry.charge.amount < 0 ? "credit" : "adjustment")}
                    {entry.kind === "payment" && entry.voided ? (
                      <StatusPill tone="danger">{t("voided")}</StatusPill>
                    ) : null}
                  </span>
                  <span className="text-footnote text-text-secondary">
                    {[
                      group,
                      entry.kind === "charge" && entry.charge.is_prorated
                        ? t("prorated", {
                            counted: entry.charge.lessons_counted ?? 0,
                            total: entry.charge.lessons_in_month ?? 0,
                          })
                        : null,
                      entry.kind === "charge" ? entry.charge.note : entry.payment.note,
                      entry.kind === "payment" && entry.voided ? entry.payment.void_reason : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </TableCell>
              <TableCell numeric>
                {entry.kind === "charge" ? <MoneyText amount={entry.charge.amount} /> : null}
              </TableCell>
              <TableCell numeric>
                {entry.kind === "payment" ? (
                  <MoneyText
                    amount={entry.payment.amount}
                    className={cn(entry.voided && "text-text-secondary line-through")}
                  />
                ) : null}
              </TableCell>
              <TableCell numeric>
                <MoneyText amount={entry.balance} debt className="font-medium" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
