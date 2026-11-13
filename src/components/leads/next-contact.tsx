"use client";

import { CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { isFollowUpDue, type LeadStatus } from "@/lib/domain/leads";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Next contact date. When it is due, an icon and a word say so, not only the colour. */
export function NextContact({
  lead,
  now,
  className,
}: {
  lead: { status: LeadStatus; next_contact_at: string | null };
  now: Date;
  className?: string;
}) {
  const t = useTranslations("leads");
  const locale = useLocale();
  if (!lead.next_contact_at) return null;
  const due = isFollowUpDue(lead, now);
  const date = formatDate(lead.next_contact_at, locale);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap numeric",
        due ? "text-warning" : "text-text-secondary",
        className,
      )}
    >
      {due ? <CalendarClock className="size-3.5" aria-hidden /> : null}
      {date}
      {due ? <span className="sr-only">{t("followUpDue")}</span> : null}
    </span>
  );
}
