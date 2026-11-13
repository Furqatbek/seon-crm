"use client";

import { Ban, Ellipsis, Printer, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { UserRole } from "@/lib/auth";
import { voidPayment } from "@/lib/finance/actions";
import type { PaymentRow } from "@/lib/finance/queries";
import { formatDate } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type FinanceErrorKey, type PaymentMethod } from "@/lib/validation/finance";

const ALL = "all";

/** Date, receipt no., student, group, method, amount, received by. */
export function PaymentsTab({
  rows,
  total,
  page,
  method,
  role,
}: {
  rows: PaymentRow[];
  total: number;
  page: number;
  method: PaymentMethod | undefined;
  role: UserRole;
}) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { setParams } = useUrlState();
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<FinanceErrorKey | null>(null);
  const [busy, startTransition] = useTransition();

  function submitVoid(event: React.FormEvent) {
    event.preventDefault();
    if (!voiding) return;
    setError(null);
    startTransition(async () => {
      const result = await voidPayment({ payment_id: voiding.id, reason });
      if (!result.ok) return setError(result.error);
      setVoiding(null);
      toast(t("void.done"));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={method ?? ALL}
        onValueChange={(value) => setParams({ method: value === ALL ? null : value, page: null })}
      >
        <SelectTrigger aria-label={t("fields.method")} className="w-full sm:w-48">
          <SelectValue>{method ? t(`method.${method}`) : t("filters.allMethods")}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allMethods")}</SelectItem>
          {PAYMENT_METHODS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`method.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet}>{t("payments.empty")}</EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead>{t("fields.receipt")}</TableHead>
                <TableHead>{t("fields.student")}</TableHead>
                <TableHead>{t("fields.group")}</TableHead>
                <TableHead>{t("fields.method")}</TableHead>
                <TableHead numeric>{t("fields.amount")}</TableHead>
                <TableHead>{t("fields.receivedBy")}</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-payment-row={row.receipt_no} data-voided={row.voided_at ? "true" : "false"}>
                  <TableCell className="whitespace-nowrap numeric">{formatDate(row.paid_at, locale, { year: true })}</TableCell>
                  <TableCell className="whitespace-nowrap numeric">{row.receipt_no}</TableCell>
                  <TableCell>
                    {row.student ? (
                      <Link
                        href={`/students/${row.student.id}`}
                        className="rounded-inner font-medium whitespace-nowrap outline-none hover:text-purple focus-visible:ring-3 focus-visible:ring-focus-ring"
                      >
                        {row.student.full_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.group?.name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{t(`method.${row.method}`)}</TableCell>
                  <TableCell numeric>
                    <span className="inline-flex items-center justify-end gap-2">
                      {row.voided_at ? <StatusPill tone="danger">{t("void.voided")}</StatusPill> : null}
                      <MoneyText
                        amount={row.amount}
                        className={cn(row.voided_at && "text-text-secondary line-through")}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.received?.full_name ?? "—"}</TableCell>
                  <TableCell className="px-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t("payments.rowActions", { receipt: row.receipt_no })}>
                          <Ellipsis aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/receipts/${row.id}`} target="_blank">
                            <Printer aria-hidden />
                            {t("payment.print")}
                          </Link>
                        </DropdownMenuItem>
                        {/* Only the owner voids a payment. */}
                        {role === "owner" && !row.voided_at ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              setReason("");
                              setError(null);
                              setVoiding(row);
                            }}
                          >
                            <Ban aria-hidden />
                            {t("void.action")}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        </>
      )}

      <Dialog open={voiding !== null} onOpenChange={(open) => !open && setVoiding(null)}>
        <DialogContent>
          {voiding ? (
            <form onSubmit={submitVoid} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{t("void.title", { receipt: voiding.receipt_no })}</DialogTitle>
                <DialogDescription>{t("void.body")}</DialogDescription>
              </DialogHeader>
              <Field label={t("void.reason")} htmlFor="void-reason" error={error ? t(`errors.${error}`) : null}>
                <Input
                  id="void-reason"
                  value={reason}
                  maxLength={300}
                  autoFocus
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={error ? true : undefined}
                />
              </Field>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setVoiding(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" variant="destructive-fill" disabled={busy}>
                  {t("void.action")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
