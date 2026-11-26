"use client";

import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { archiveFinanceRecord, type ArchiveKind } from "@/lib/finance/actions";
import type { FinanceErrorKey } from "@/lib/validation/finance";

/**
 * Owner only: archives one payment, charge, expense or payout after a
 * confirmation that says what will change. `what` names the record for a
 * screen reader ("receipt 126", a student, an amount).
 */
export function ArchiveButton({ kind, id, what }: { kind: ArchiveKind; id: string; what: string }) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<FinanceErrorKey | null>(null);
  const [busy, startTransition] = useTransition();
  const consequence = { payment: "bodyPayment", charge: "bodyCharge", payout: "bodyPayout", expense: null }[kind];

  function archive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveFinanceRecord({ kind, id });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      toast(t("archive.done"));
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t(`archive.${kind}`, { what })}
        title={t("archive.action")}
        data-archive={kind}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Archive aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("archive.title")}</DialogTitle>
            <DialogDescription>
              {consequence ? `${t(`archive.${consequence}` as "archive.bodyCharge")} ` : ""}
              {t("archive.body")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-footnote text-danger">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive-fill" disabled={busy} onClick={archive}>
              {t("archive.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
