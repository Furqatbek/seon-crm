"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Leads → the board and list, the forms that bring leads in, or the free open lessons. */
export function LeadsTabs({ active }: { active: "leads" | "forms" | "openLessons" }) {
  const t = useTranslations("forms");
  const tabs = [
    { key: "leads", href: "/leads", label: t("tabs.leads") },
    { key: "forms", href: "/leads/forms", label: t("tabs.forms") },
    { key: "openLessons", href: "/leads/open-lessons", label: t("tabs.openLessons") },
  ] as const;
  return (
    <nav aria-label={t("tabs.label")} className="flex w-full gap-6 border-b border-border" data-leads-tabs>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-control items-center border-b-2 text-body font-medium whitespace-nowrap outline-none motion-fast pointer-coarse:h-control-touch focus-visible:rounded-inner focus-visible:ring-3 focus-visible:ring-focus-ring",
            tab.key === active ? "border-brand text-text" : "border-transparent text-text-secondary hover:text-text",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
