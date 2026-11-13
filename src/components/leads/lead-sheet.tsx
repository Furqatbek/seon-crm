"use client";

import {
  Archive,
  ArrowRight,
  CalendarCheck,
  Ellipsis,
  Pencil,
  Phone,
  StickyNote,
  UserCheck,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { UserRole } from "@/lib/auth";
import {
  LEAD_STATUSES,
  canMoveLead,
  isLostReasonCode,
  type LeadStatus,
} from "@/lib/domain/leads";
import { formatDateTime, formatDay, formatPhone } from "@/lib/format";
import { addLeadActivity, archiveLead } from "@/lib/leads/actions";
import type { GroupOption, LeadActivity, LeadDetail, StaffOption } from "@/lib/leads/queries";
import type { LeadErrorKey } from "@/lib/validation/leads";

import { STATUS_TONE } from "./lead-meta";
import { NextContact } from "./next-contact";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2">
      <dt className="text-footnote text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-body break-words text-text">{children}</dd>
    </div>
  );
}

function Composer({
  leadId,
  kind,
  onClose,
}: {
  leadId: string;
  kind: "call" | "note";
  onClose: () => void;
}) {
  const t = useTranslations("leads");
  const tCommon = useTranslations("common");
  const [body, setBody] = useState("");
  const [error, setError] = useState<LeadErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addLeadActivity({ leadId, kind, body });
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-card border border-border p-3">
      <label htmlFor="lead-composer" className="text-footnote text-text-secondary">
        {t(kind === "call" ? "composer.callLabel" : "composer.noteLabel")}
      </label>
      <Textarea
        id="lead-composer"
        value={body}
        autoFocus
        maxLength={2000}
        onChange={(event) => setBody(event.target.value)}
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p role="alert" className="text-footnote text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {t(kind === "call" ? "composer.saveCall" : "composer.saveNote")}
        </Button>
      </div>
    </form>
  );
}

function TimelineItem({ activity, author }: { activity: LeadActivity; author: string | null }) {
  const t = useTranslations("leads");
  const locale = useLocale();
  const Icon = activity.kind === "call" ? Phone : activity.kind === "note" ? StickyNote : ArrowRight;
  const reason = activity.kind === "status_change" && activity.to_status === "lost" ? activity.body : null;

  return (
    <li className="flex gap-3" data-activity={activity.kind}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-text-secondary">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-body text-text">
          {activity.kind === "status_change" && activity.from_status && activity.to_status
            ? t("timeline.statusChange", {
                from: t(`status.${activity.from_status}`),
                to: t(`status.${activity.to_status}`),
              })
            : t(`timeline.${activity.kind === "call" ? "call" : "note"}`)}
        </p>
        {reason ? (
          <p className="text-body break-words text-text-secondary">
            {t("timeline.reason", {
              reason: isLostReasonCode(reason) ? t(`lostReason.${reason}`) : reason,
            })}
          </p>
        ) : activity.kind !== "status_change" && activity.body ? (
          <p className="text-body break-words whitespace-pre-wrap text-text-secondary">{activity.body}</p>
        ) : null}
        <p className="text-footnote text-text-secondary">
          {author ? `${author} · ` : ""}
          <time dateTime={activity.created_at}>
            {formatDateTime(activity.created_at, locale)}
          </time>
        </p>
      </div>
    </li>
  );
}

/** Details, timeline and actions for one lead. A won lead is read-only. */
export function LeadSheet({
  lead,
  staff,
  groups,
  role,
  now,
  onClose,
  onEdit,
  onMove,
}: {
  lead: LeadDetail | null;
  staff: StaffOption[];
  groups: GroupOption[];
  role: UserRole;
  now: Date;
  onClose: () => void;
  onEdit: () => void;
  onMove: (lead: LeadDetail, to: LeadStatus) => void;
}) {
  const t = useTranslations("leads");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [composer, setComposer] = useState<"call" | "note" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, startArchive] = useTransition();

  const nameOf = (id: string | null) => staff.find((person) => person.id === id)?.full_name ?? null;
  const readOnly = lead?.status === "won";

  function archive() {
    if (!lead) return;
    startArchive(async () => {
      const result = await archiveLead(lead.id);
      setConfirmArchive(false);
      if (result.ok) {
        toast(t("archive.done"));
        onClose();
      } else {
        toast(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <>
      <Sheet open={lead !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent>
          {lead ? (
            <>
              <SheetHeader>
                <SheetTitle>{lead.full_name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 pt-1" data-lead-status={lead.status}>
                    <StatusPill tone={STATUS_TONE[lead.status]}>
                      {t(`status.${lead.status}`)}
                    </StatusPill>
                    <a
                      href={`tel:${lead.phone}`}
                      className="rounded-inner text-body text-purple outline-none numeric hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
                    >
                      {formatPhone(lead.phone)}
                    </a>
                  </div>
                </SheetDescription>
              </SheetHeader>

              <SheetBody className="gap-6 pb-6">
                {readOnly ? (
                  <p className="flex items-start gap-2 rounded-control bg-success-tint px-3 py-2 text-footnote text-success">
                    <UserCheck className="size-4" aria-hidden />
                    <span>
                      {t("readOnly")}{" "}
                      {lead.converted_student_id ? (
                        <Link
                          href={`/students/${lead.converted_student_id}`}
                          className="font-medium underline underline-offset-2"
                        >
                          {t("openStudent")}
                        </Link>
                      ) : null}
                    </span>
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={lead.status}
                        onValueChange={(value) => onMove(lead, value as LeadStatus)}
                      >
                        <SelectTrigger aria-label={t("actions.moveTo")} className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((status) => (
                            <SelectItem
                              key={status}
                              value={status}
                              disabled={status !== lead.status && !canMoveLead(lead.status, status)}
                            >
                              {t(`status.${status}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" aria-label={t("actions.more")}>
                            <Ellipsis aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={onEdit}>
                            <Pencil aria-hidden />
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          {role === "owner" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setConfirmArchive(true)}
                              >
                                <Archive aria-hidden />
                                {t("actions.archive")}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setComposer("call")}>
                        <Phone aria-hidden />
                        {t("actions.logCall")}
                      </Button>
                      <Button onClick={() => setComposer("note")}>
                        <StickyNote aria-hidden />
                        {t("actions.addNote")}
                      </Button>
                      {lead.status !== "trial" ? (
                        <Button onClick={() => onMove(lead, "trial")}>
                          <CalendarCheck aria-hidden />
                          {t("actions.bookTrial")}
                        </Button>
                      ) : null}
                      {/* Enabled in Phase 5, when a lead can become a student. */}
                      <Button disabled>
                        <UserCheck aria-hidden />
                        {t("actions.convert")}
                      </Button>
                      {lead.status !== "lost" ? (
                        <Button variant="destructive" onClick={() => onMove(lead, "lost")}>
                          {t("actions.markLost")}
                        </Button>
                      ) : null}
                    </div>
                    {composer ? (
                      <Composer
                        key={composer}
                        leadId={lead.id}
                        kind={composer}
                        onClose={() => setComposer(null)}
                      />
                    ) : null}
                  </div>
                )}

                <dl className="divide-y divide-border border-y border-border">
                  <Detail label={t("fields.source")}>{t(`source.${lead.source}`)}</Detail>
                  {lead.subject_interest ? (
                    <Detail label={t("fields.subject")}>{lead.subject_interest}</Detail>
                  ) : null}
                  {lead.preferred_time ? (
                    <Detail label={t("fields.preferredTime")}>{lead.preferred_time}</Detail>
                  ) : null}
                  <Detail label={t("fields.assignedTo")}>
                    {nameOf(lead.assigned_to) ?? t("fields.unassigned")}
                  </Detail>
                  {lead.next_contact_at ? (
                    <Detail label={t("fields.nextContact")}>
                      <NextContact lead={lead} now={now} className="text-body" />
                    </Detail>
                  ) : null}
                  {lead.status === "trial" && lead.trial_date ? (
                    <Detail label={t("fields.trial")}>
                      {groups.find((group) => group.id === lead.trial_group_id)?.name ?? "—"}
                      {" · "}
                      {formatDay(lead.trial_date, locale, { month: "long" })}
                    </Detail>
                  ) : null}
                  {lead.status === "lost" && lead.lost_reason ? (
                    <Detail label={t("fields.lostReason")}>
                      {isLostReasonCode(lead.lost_reason)
                        ? t(`lostReason.${lead.lost_reason}`)
                        : lead.lost_reason}
                    </Detail>
                  ) : null}
                  {lead.notes ? (
                    <Detail label={t("fields.notes")}>
                      <span className="whitespace-pre-wrap">{lead.notes}</span>
                    </Detail>
                  ) : null}
                </dl>

                <section aria-labelledby="lead-timeline" className="flex flex-col gap-3">
                  <h3 id="lead-timeline" className="text-headline text-text">
                    {t("timeline.title")}
                  </h3>
                  {lead.activities.length === 0 ? (
                    <p className="text-body text-text-secondary">{t("timeline.empty")}</p>
                  ) : (
                    <ol className="flex flex-col gap-4">
                      {lead.activities.map((activity) => (
                        <TimelineItem
                          key={activity.id}
                          activity={activity}
                          author={nameOf(activity.created_by)}
                        />
                      ))}
                    </ol>
                  )}
                </section>
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("archive.title", { name: lead?.full_name ?? "" })}</DialogTitle>
            <DialogDescription>{t("archive.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive-fill" disabled={archiving} onClick={archive}>
              {t("actions.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
