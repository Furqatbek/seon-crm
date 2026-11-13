"use client";

import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { LeadSummary } from "@/lib/leads/queries";

import { NextContact } from "./next-contact";

/** Leads with a next contact date of today or earlier. */
export function FollowUpStrip({
  leads,
  now,
  onOpen,
}: {
  leads: LeadSummary[];
  now: Date;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("leads");
  if (leads.length === 0) return null;

  return (
    <section aria-labelledby="follow-up-title" className="mb-6 flex flex-col gap-2">
      <h2 id="follow-up-title" className="flex items-center gap-2 text-headline text-text">
        <CalendarClock className="text-text-secondary" aria-hidden />
        {t("followUpToday")}
        <Badge>{leads.length}</Badge>
      </h2>
      {/* relative: keeps the visually hidden text inside this scroller */}
      <ul className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {leads.map((lead) => (
          <li key={lead.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onOpen(lead.id)}
              className="flex w-52 flex-col gap-0.5 rounded-control border border-border bg-bg px-3 py-2 text-left outline-none motion-fast hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring"
            >
              <span className="truncate text-body font-medium text-text">{lead.full_name}</span>
              <span className="flex items-center justify-between gap-2 text-footnote text-text-secondary">
                <span className="truncate">{lead.subject_interest ?? t(`status.${lead.status}`)}</span>
                <NextContact lead={lead} now={now} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
