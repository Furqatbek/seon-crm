"use client";

import { useTranslations } from "next-intl";

import type { SettingsResult } from "@/lib/validation/settings";

type Failure = Extract<SettingsResult, { ok: false }>;

/** Why an action did not go through, with what the outside service said when there is more to say. */
export function Problem({ failure }: { failure: Failure | null }) {
  const t = useTranslations("settings.errors");
  if (!failure) return null;
  return (
    <p role="alert" className="text-footnote text-danger">
      {t(failure.error)}
      {failure.detail ? <span className="block break-words text-text-secondary">{failure.detail}</span> : null}
    </p>
  );
}

/** A titled block of settings on a card. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-card border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-headline text-text">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
