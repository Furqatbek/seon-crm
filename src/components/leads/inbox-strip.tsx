"use client";

import { Inbox, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatPhone } from "@/lib/format";
import { takeLead } from "@/lib/leads/actions";
import type { StaffOption } from "@/lib/leads/queries";

import { useInbox } from "./inbox-provider";

/** Whole minutes a lead has waited. */
export function waitedMinutes(since: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
}

/**
 * The shared inbox above the board: leads from forms that nobody has taken.
 * Each card shows who, which form, a line of answers and how long it has
 * waited; Take makes it yours. The owner can give one to someone.
 */
export function InboxStrip({
  staff,
  isOwner,
  nowIso,
  onOpen,
}: {
  staff: StaffOption[];
  isOwner: boolean;
  nowIso: string;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("leads");
  const { items, refresh, remove } = useInbox();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  // The waiting times move on by themselves.
  const [now, setNow] = useState(() => Date.parse(nowIso));
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  if (items.length === 0) return null;

  const take = (id: string, name: string, assignTo?: StaffOption) => {
    setBusy(id);
    start(async () => {
      const result = await takeLead(id, assignTo?.id);
      setBusy(null);
      if (!result.ok) {
        toast(t(`errors.${result.error}`));
      } else if (!result.taken) {
        toast(result.by ? t("inbox.takenBy", { name: result.by }) : t("inbox.notWaiting"));
      } else {
        toast(assignTo ? t("inbox.assigned", { lead: name, name: assignTo.full_name }) : t("inbox.taken", { lead: name }));
        if (!assignTo) onOpen(id);
      }
      remove(id);
      void refresh();
    });
  };

  const waited = (since: string) => {
    const minutes = waitedMinutes(since, now);
    if (minutes < 1) return t("inbox.justNow");
    if (minutes < 60) return t("inbox.minutes", { minutes });
    return t("inbox.hours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  };

  return (
    <section aria-labelledby="inbox-title" className="mb-6 rounded-card border border-brand bg-brand-tint p-4" data-inbox>
      <h2 id="inbox-title" className="flex items-center gap-2 text-headline text-text">
        <Inbox className="size-5 text-brand-ink" aria-hidden />
        {t("inbox.title", { count: items.length })}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} data-inbox-lead={item.id} className="flex flex-col gap-2 rounded-card border border-border bg-bg p-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="min-w-0 rounded-inner text-left text-body font-medium break-words text-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-focus-ring"
              >
                {item.fullName}
              </button>
              <span className="shrink-0 text-footnote text-text-secondary numeric" data-waited>
                {waited(item.since)}
              </span>
            </div>
            <a
              href={`tel:${item.phone}`}
              className="self-start rounded-inner text-body text-brand-ink outline-none numeric hover:text-brand-ink-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
            >
              {formatPhone(item.phone)}
            </a>
            {item.formName ? <p className="text-footnote font-medium break-words text-text">{item.formName}</p> : null}
            {item.summary ? <p className="line-clamp-2 text-footnote break-words text-text-secondary">{item.summary}</p> : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <Button variant="primary" disabled={busy === item.id} onClick={() => take(item.id, item.fullName)}>
                {t("inbox.take")}
              </Button>
              {isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" disabled={busy === item.id}>
                      <UserPlus aria-hidden />
                      {t("inbox.assign")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>{t("inbox.assignTo")}</DropdownMenuLabel>
                    {staff.map((person) => (
                      <DropdownMenuItem key={person.id} onSelect={() => take(item.id, item.fullName, person)}>
                        {person.full_name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
