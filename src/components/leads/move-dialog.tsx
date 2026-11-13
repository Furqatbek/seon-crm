"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOST_REASONS, tashkentDate } from "@/lib/domain/leads";
import { moveLead } from "@/lib/leads/actions";
import type { GroupOption } from "@/lib/leads/queries";
import type { LeadErrorKey } from "@/lib/validation/leads";

export type PendingMove = { lead: { id: string; full_name: string }; to: "lost" | "trial" };

const OTHER = "other";

function MoveForm({
  move,
  groups,
  onClose,
}: {
  move: PendingMove;
  groups: GroupOption[];
  onClose: () => void;
}) {
  const t = useTranslations("leads");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<LeadErrorKey | null>(null);
  const [reason, setReason] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [date, setDate] = useState(() => tashkentDate(new Date()));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await moveLead(
        move.to === "lost"
          ? { id: move.lead.id, to: "lost", lostReason: reason === OTHER ? otherText : reason }
          : { id: move.lead.id, to: "trial", trialGroupId: groupId || undefined, trialDate: date || undefined },
      );
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {t(move.to === "lost" ? "lost.title" : "trial.title", { name: move.lead.full_name })}
        </DialogTitle>
        <DialogDescription>{t(move.to === "lost" ? "lost.body" : "trial.body")}</DialogDescription>
      </DialogHeader>

      {move.to === "lost" ? (
        <>
          <Field label={t("lost.reason")} htmlFor="lost-reason">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="lost-reason" aria-invalid={error === "lostReasonRequired" || undefined}>
                <SelectValue placeholder={t("lost.choose")} />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`lostReason.${code}`)}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>{t("lostReason.other")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {reason === OTHER ? (
            <Field label={t("lost.otherLabel")} htmlFor="lost-other">
              <Input
                id="lost-other"
                value={otherText}
                maxLength={200}
                autoFocus
                onChange={(event) => setOtherText(event.target.value)}
                aria-invalid={error === "lostReasonRequired" || undefined}
              />
            </Field>
          ) : null}
        </>
      ) : (
        <>
          <Field label={t("trial.group")} htmlFor="trial-group">
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="trial-group" aria-invalid={error === "trialGroupRequired" || undefined}>
                <SelectValue placeholder={t("trial.choose")} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("trial.date")} htmlFor="trial-date">
            <Input
              id="trial-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={error === "trialDateRequired" || undefined}
            />
          </Field>
        </>
      )}

      {error ? (
        <p role="alert" className="text-footnote text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button
          type="submit"
          variant={move.to === "lost" ? "destructive-fill" : "primary"}
          disabled={pending}
        >
          {t(move.to === "lost" ? "actions.markLost" : "actions.bookTrial")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Moving to Lost asks for the reason; moving to Trial asks for the group and date. */
export function MoveDialog({
  move,
  groups,
  onClose,
}: {
  move: PendingMove | null;
  groups: GroupOption[];
  onClose: () => void;
}) {
  return (
    <Dialog open={move !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {move ? (
          <MoveForm key={`${move.lead.id}-${move.to}`} move={move} groups={groups} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
