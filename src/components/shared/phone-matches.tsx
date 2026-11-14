"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";
import { normalizePhone } from "@/lib/domain/leads";
import { findPhoneMatches, type PhoneMatch } from "@/lib/leads/actions";

const CHECK_DELAY_MS = 400;

/** Leads and students that already use a phone number, looked up as the user types. */
export function usePhoneMatches(
  phone: string | undefined,
  exclude: { leadId?: string | null; studentId?: string | null },
): PhoneMatch[] {
  const [matches, setMatches] = useState<PhoneMatch[]>([]);
  const { leadId, studentId } = exclude;

  useEffect(() => {
    const normalized = normalizePhone(phone ?? "");
    const timer = setTimeout(
      async () =>
        setMatches(normalized ? await findPhoneMatches(normalized, { leadId, studentId }) : []),
      CHECK_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [phone, leadId, studentId]);

  return matches;
}

/** The warning under a phone field. It never blocks saving. */
export function PhoneMatches({ id, matches }: { id: string; matches: PhoneMatch[] }) {
  const t = useTranslations("common.phoneMatch");
  if (matches.length === 0) return null;

  return (
    <div
      id={id}
      role="status"
      className="flex items-start gap-2 rounded-control bg-warning-tint px-3 py-2 text-footnote text-warning"
    >
      <TriangleAlert className="size-4" aria-hidden />
      <ul className="flex flex-col gap-0.5">
        {matches.map((match) => (
          <li key={`${match.kind}-${match.id}`}>
            {t(match.kind)}{" "}
            <Link
              href={match.kind === "lead" ? `/leads?lead=${match.id}` : `/students/${match.id}`}
              target="_blank"
              className="font-medium underline underline-offset-2"
            >
              {match.full_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
