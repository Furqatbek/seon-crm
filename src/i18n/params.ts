import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing, type Locale } from "./routing";

export type LocaleParams = { params: Promise<{ locale: string }> };

/** Validates the [locale] segment and enables static rendering for it. */
export async function initLocale(params: LocaleParams["params"]): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
