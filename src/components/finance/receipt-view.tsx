"use client";

import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Receipt } from "@/lib/finance/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Paper = "roll" | "a4";

// Paper sizes for the printer, not design tokens: an 80 mm receipt roll and A4.
const PAGE: Record<Paper, string> = {
  roll: "@page { size: 80mm auto; margin: 4mm; }",
  a4: "@page { size: A4; margin: 20mm; }",
};

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-footnote text-text-secondary">{label}</dt>
      <dd className="text-right text-body break-words text-text">{children}</dd>
    </div>
  );
}

/** A payment receipt, sized for an 80 mm receipt printer or for A4. */
export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const [paper, setPaper] = useState<Paper>("roll");

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 bg-bg-subtle p-4 print:block print:min-h-0 print:bg-bg print:p-0">
      <style>{PAGE[paper]}</style>
      <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
        <SegmentedControl
          aria-label={t("receipt.paper")}
          value={paper}
          onValueChange={setPaper}
          options={[
            { value: "roll", label: t("receipt.roll") },
            { value: "a4", label: t("receipt.a4") },
          ]}
        />
        <Button variant="primary" onClick={() => window.print()}>
          <Printer aria-hidden />
          {t("receipt.print")}
        </Button>
      </div>

      <article
        data-slot="receipt"
        data-paper={paper}
        className={cn(
          "flex w-full flex-col gap-3 rounded-card border border-border bg-bg p-4 print:rounded-none print:border-0 print:p-0",
          paper === "roll" ? "max-w-[72mm]" : "max-w-[170mm] sm:p-10 print:max-w-none",
        )}
      >
        <header className="flex flex-col items-center gap-1 border-b border-border pb-3 text-center">
          <h1 className="text-headline text-text">{receipt.centreName}</h1>
          <p className="text-body text-text numeric">{t("payment.receipt", { number: receipt.receipt_no })}</p>
          <p className="text-footnote text-text-secondary numeric">{formatDateTime(receipt.paid_at, locale)}</p>
        </header>

        {receipt.voided_at ? (
          <p className="rounded-control border border-danger px-3 py-2 text-center text-body font-medium text-danger">
            {t("void.voided")}
            {receipt.void_reason ? `: ${receipt.void_reason}` : ""}
          </p>
        ) : null}

        <dl className="flex flex-col">
          <Line label={t("fields.student")}>{receipt.student?.full_name ?? "—"}</Line>
          <Line label={t("fields.group")}>{receipt.group?.name ?? "—"}</Line>
          <Line label={t("fields.method")}>{t(`method.${receipt.method}`)}</Line>
          {receipt.note ? <Line label={t("fields.note")}>{receipt.note}</Line> : null}
          <Line label={t("fields.receivedBy")}>{receipt.received?.full_name ?? "—"}</Line>
        </dl>

        <p className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <span className="text-body text-text">{t("receipt.paid")}</span>
          <span className="text-title text-text">
            <MoneyText amount={receipt.amount} />
          </span>
        </p>
      </article>
    </div>
  );
}
