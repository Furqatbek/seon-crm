"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { MoneyText } from "@/components/ui/money-text";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { formatDateTime, formatDay } from "@/lib/format";
import { rejectReceipt } from "@/lib/receipts/actions";
import type { ReceiptRow } from "@/lib/receipts/queries";
import { rejectReceiptSchema, type ReceiptErrorKey, type ReceiptStatus, type RejectReceiptInput } from "@/lib/validation/receipts";

import { useTakePayment } from "./take-payment-sheet";

const TONE = { pending: "warning", approved: "success", rejected: "danger" } as const;

function RejectDialog({ receipt, onClose }: { receipt: ReceiptRow; onClose: () => void }) {
  const t = useTranslations("receipts");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ReceiptErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RejectReceiptInput>({ resolver: zodResolver(rejectReceiptSchema), defaultValues: { receipt_id: receipt.id, reason: "" } });
  const problem = error ?? (errors.reason?.message as ReceiptErrorKey | undefined);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await rejectReceipt(values);
      if (!result.ok) return setError(result.error);
      toast(t("rejected"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("reject.title")}</DialogTitle>
        <DialogDescription>{t("reject.hint", { name: receipt.studentName })}</DialogDescription>
      </DialogHeader>
      <Field label={t("reject.reason")} htmlFor="receipt-reject-reason" error={problem ? t(`errors.${problem}`) : null}>
        <Textarea id="receipt-reject-reason" rows={3} maxLength={300} autoFocus aria-invalid={problem ? true : undefined} {...register("reason")} />
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("reject.confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One receipt: who sent what for which day, the file, what looks like a duplicate, and the decision. */
function ReceiptCard({ receipt, locale, onReject }: { receipt: ReceiptRow; locale: Locale; onReject: () => void }) {
  const t = useTranslations("receipts");
  const takePayment = useTakePayment();
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border p-3 sm:flex-row sm:items-start" data-receipt={receipt.status} data-receipt-id={receipt.id}>
      {receipt.fileUrl ? (
        <a
          href={receipt.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-control bg-bg-subtle outline-none focus-visible:ring-3 focus-visible:ring-focus-ring sm:w-28"
          aria-label={t("openFile", { name: receipt.studentName })}
          data-slot="receipt-preview"
        >
          {receipt.fileType === "pdf" ? (
            <span className="flex flex-col items-center gap-1 text-footnote text-text-secondary">
              <FileText className="size-8" aria-hidden />
              PDF
            </span>
          ) : (
            // A short-lived signed link to a private file: not something to optimise or cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receipt.fileUrl} alt="" className="size-full object-cover" />
          )}
        </a>
      ) : (
        <span className="flex h-32 w-full shrink-0 items-center justify-center rounded-control bg-bg-subtle text-footnote text-text-secondary sm:w-28">{t("noFile")}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Link href={`/students/${receipt.studentId}`} className="text-body font-medium text-brand-ink hover:underline">
            {receipt.studentName}
          </Link>
          <MoneyText amount={receipt.amount} className="text-headline text-text" />
        </div>
        <p className="text-footnote text-text-secondary">
          {receipt.groupName} · {t("paidOn", { date: formatDay(receipt.paidOn, locale, { month: "long" }) })} · {t("sentAt", { date: formatDateTime(receipt.createdAt, locale) })}
        </p>
        {receipt.comment ? <p className="text-body break-words whitespace-pre-wrap text-text">{receipt.comment}</p> : null}
        {receipt.sameFile || receipt.sameAmountDate ? (
          <p role="status" className="flex items-start gap-2 rounded-control bg-warning-tint px-3 py-2 text-footnote text-warning" data-slot="duplicate-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span>{[receipt.sameFile ? t("duplicate.sameFile") : null, receipt.sameAmountDate ? t("duplicate.sameAmountDate") : null].filter(Boolean).join(" ")}</span>
          </p>
        ) : null}
        {receipt.status === "pending" ? (
          <div className="mt-1 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => takePayment(receipt.studentId, { id: receipt.id, groupId: receipt.groupId, amount: receipt.amount, paidOn: receipt.paidOn })}>
              {t("approve")}
            </Button>
            <Button variant="secondary" onClick={onReject}>
              {t("reject.open")}
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-footnote text-text-secondary">
            <StatusPill tone={TONE[receipt.status]}>{t(`status.${receipt.status}`)}</StatusPill>
            {receipt.status === "rejected" && receipt.rejectReason ? <span className="text-text">{receipt.rejectReason}</span> : null}
            {receipt.status === "approved" && receipt.paymentId && receipt.receiptNo ? (
              <Link href={`/receipts/${receipt.paymentId}`} target="_blank" className="text-brand-ink hover:underline">
                {t("payment", { number: receipt.receiptNo })}
              </Link>
            ) : null}
            {receipt.reviewedAt ? (
              <span>
                {receipt.reviewedBy ? `${receipt.reviewedBy} · ` : ""}
                {formatDateTime(receipt.reviewedAt, locale)}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Finance → Receipts: what students sent from the app. Pending ones wait here,
 * the oldest first: Approve opens Take payment filled in from the receipt, and
 * saving it records the payment and links it; Reject needs a reason.
 */
export function ReceiptsTab({ receipts, status }: { receipts: ReceiptRow[]; status: ReceiptStatus }) {
  const t = useTranslations("receipts");
  const locale = useLocale() as Locale;
  const { setParams } = useUrlState();
  const [rejecting, setRejecting] = useState<ReceiptRow | null>(null);
  return (
    <div className="flex flex-col gap-4" data-slot="receipts">
      <SegmentedControl
        aria-label={t("show")}
        value={status}
        onValueChange={(next) => setParams({ receipts: next === "pending" ? null : next })}
        options={(["pending", "approved", "rejected"] as const).map((value) => ({ value, label: t(`status.${value}`) }))}
        className="self-start"
      />
      {receipts.length === 0 ? (
        <p className="text-body text-text-secondary">{t(status === "pending" ? "emptyPending" : "empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {receipts.map((receipt) => (
            <ReceiptCard key={receipt.id} receipt={receipt} locale={locale} onReject={() => setRejecting(receipt)} />
          ))}
        </ul>
      )}
      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>{rejecting ? <RejectDialog key={rejecting.id} receipt={rejecting} onClose={() => setRejecting(null)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}
