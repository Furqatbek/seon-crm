import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatDay, formatPhone } from "@/lib/format";
import type { TrialVisitor } from "@/lib/groups/queries";

/** This week's trial visitors, from Leads. */
export function GroupTrialsTab({ visitors }: { visitors: TrialVisitor[] }) {
  const t = useTranslations("groups.trials");
  const locale = useLocale();

  if (visitors.length === 0) {
    return (
      <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-footnote text-text-secondary">{t("thisWeek")}</p>
      <ul className="divide-y divide-border rounded-card border border-border">
        {visitors.map((lead) => (
          <li key={lead.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <Link
                href={`/leads?lead=${lead.id}`}
                className="truncate rounded-inner text-body font-medium text-purple outline-none hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
              >
                {lead.full_name}
              </Link>
              <span className="text-footnote text-text-secondary numeric">{formatPhone(lead.phone)}</span>
            </span>
            <span className="text-body text-text numeric">
              {lead.trial_date ? formatDay(lead.trial_date, locale, { month: "long" }) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
