"use client";

import { Inbox } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BadgeTone } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/format";
import { handleRedemption } from "@/lib/points/actions";
import type { RedemptionRow } from "@/lib/points/queries";
import type { PointsErrorKey } from "@/lib/validation/points";

const STATUS_TONE: Record<RedemptionRow["status"], BadgeTone> = {
  requested: "warning",
  ready: "brand",
  given: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/**
 * Reward requests: the open ones first. Give marks a reward handed over and is
 * final; Reject needs a reason and returns the points and the stock.
 */
export function RequestsTab({ rows }: { rows: RedemptionRow[] }) {
  const t = useTranslations("points");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<RedemptionRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<PointsErrorKey | null>(null);

  function give(row: RedemptionRow) {
    startTransition(async () => {
      const result = await handleRedemption({ id: row.id, action: "give", note: "" });
      toast(result.ok ? t("requests.given", { name: row.student.name }) : t(`errors.${result.error}`));
    });
  }

  function reject(event: React.FormEvent) {
    event.preventDefault();
    if (!rejecting) return;
    if (reason.trim() === "") return setError("reasonRequired");
    setError(null);
    startTransition(async () => {
      const result = await handleRedemption({ id: rejecting.id, action: "reject", note: reason });
      if (!result.ok) return setError(result.error);
      toast(t("requests.rejected", { name: rejecting.student.name }));
      setRejecting(null);
    });
  }

  if (rows.length === 0) return <EmptyState icon={Inbox}>{t("requests.empty")}</EmptyState>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("requests.date")}</TableHead>
            <TableHead>{t("requests.student")}</TableHead>
            <TableHead>{t("requests.reward")}</TableHead>
            <TableHead numeric>{t("requests.cost")}</TableHead>
            <TableHead>{t("requests.from")}</TableHead>
            <TableHead>{t("requests.status")}</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-request-row={row.status} data-student={row.student.id}>
              <TableCell className="whitespace-nowrap numeric">{formatDateTime(row.at, locale)}</TableCell>
              <TableCell>
                <Link
                  href={`/students/${row.student.id}?tab=points`}
                  className="rounded-inner font-medium whitespace-nowrap text-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-focus-ring"
                >
                  {row.student.name}
                </Link>
              </TableCell>
              <TableCell className="min-w-40">{row.reward}</TableCell>
              <TableCell numeric>{row.cost}</TableCell>
              <TableCell className="whitespace-nowrap text-text-secondary">{t(`requests.via.${row.via}`)}</TableCell>
              <TableCell>
                <span className="flex min-w-32 flex-col gap-0.5 py-1">
                  <StatusPill tone={STATUS_TONE[row.status]} className="self-start">
                    {t(`requests.statuses.${row.status}`)}
                  </StatusPill>
                  {row.note ? <span className="text-footnote text-text-secondary">{row.note}</span> : null}
                </span>
              </TableCell>
              <TableCell>
                {row.status === "requested" ? (
                  <span className="flex justify-end gap-2">
                    <Button variant="primary" disabled={pending} onClick={() => give(row)}>
                      {t("requests.give")}
                      <span className="sr-only">: {row.student.name}</span>
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() => {
                        setReason("");
                        setError(null);
                        setRejecting(row);
                      }}
                    >
                      {t("requests.reject")}
                      <span className="sr-only">: {row.student.name}</span>
                    </Button>
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <form onSubmit={reject} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("requests.rejectTitle", { name: rejecting?.student.name ?? "" })}</DialogTitle>
              <DialogDescription>{t("requests.rejectBody", { count: rejecting?.cost ?? 0 })}</DialogDescription>
            </DialogHeader>
            <Field label={t("reason")} htmlFor="reject-reason" error={error ? t(`errors.${error}`) : null}>
              <Input id="reject-reason" value={reason} maxLength={200} autoComplete="off" aria-invalid={error ? true : undefined} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" variant="destructive-fill" disabled={pending}>
                {t("requests.reject")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
