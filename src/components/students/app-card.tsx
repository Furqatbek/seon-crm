"use client";

import { Link2, Link2Off, Send, Smartphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status-pill";
import type { UserRole } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { sendAppInvite } from "@/lib/notify/actions";
import { setAppLink } from "@/lib/students/actions";
import type { StudentDetail } from "@/lib/students/queries";

/**
 * The student's account in the mobile app — docs/STUDENT_APP_SPEC.md → "CRM
 * changes → Student page": Linked or Not signed up, Send app invite for the
 * owner and managers, Unlink and Relink for the owner.
 */
export function AppCard({ student, role }: { student: StudentDetail; role: UserRole }) {
  const t = useTranslations("students.app");
  const tErrors = useTranslations("students.errors");
  const tNotify = useTranslations("notify.errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const linked = student.app.linkedAt !== null;

  function invite() {
    setProblem(null);
    startTransition(async () => {
      const result = await sendAppInvite(student.id);
      if (!result.ok) return setProblem(tNotify(result.error, { from: result.quiet?.from ?? "", to: result.quiet?.to ?? "" }));
      if (result.delivered) toast(t("inviteSent", { name: student.full_name }));
      else setProblem(t("inviteFailed"));
    });
  }

  function setLinked(next: boolean) {
    setProblem(null);
    setUnlinking(false);
    startTransition(async () => {
      const result = await setAppLink(student.id, next);
      if (!result.ok) return setProblem(tErrors(result.error));
      toast(t(next ? "relinked" : "unlinked", { name: student.full_name }));
    });
  }

  return (
    <section aria-labelledby="app-title" className="flex flex-col gap-3" data-app-linked={linked}>
      <h2 id="app-title" className="text-headline text-text">
        {t("title")}
      </h2>
      <div className="flex flex-col gap-3 rounded-card border border-border p-4">
        <p className="flex flex-wrap items-center gap-2 text-body text-text">
          <StatusPill tone={linked ? "success" : "neutral"} icon={linked ? Smartphone : undefined}>
            {t(linked ? "linked" : "notSignedUp")}
          </StatusPill>
          {student.app.linkedAt ? (
            <span className="text-footnote text-text-secondary">
              {t("linkedSince", { date: formatDay(student.app.linkedAt.slice(0, 10), locale, { year: true }) })}
            </span>
          ) : null}
        </p>
        <p className="text-footnote text-text-secondary">
          {t(linked ? "linkedHint" : student.app.waiting ? "waitingHint" : "notSignedUpHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {linked ? null : (
            <Button onClick={invite} disabled={busy}>
              <Send aria-hidden />
              {t("invite")}
            </Button>
          )}
          {role !== "owner" ? null : linked ? (
            <Button variant="destructive" onClick={() => setUnlinking(true)} disabled={busy}>
              <Link2Off aria-hidden />
              {t("unlink")}
            </Button>
          ) : (
            <Button onClick={() => setLinked(true)} disabled={busy}>
              <Link2 aria-hidden />
              {t("relink")}
            </Button>
          )}
        </div>
        {problem ? (
          <p role="alert" className="text-footnote text-danger">
            {problem}
          </p>
        ) : null}
      </div>

      <Dialog open={unlinking} onOpenChange={(next) => !next && setUnlinking(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("unlinkTitle", { name: student.full_name })}</DialogTitle>
            <DialogDescription>{t("unlinkBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUnlinking(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={() => setLinked(false)} disabled={busy}>
              {t("unlink")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
