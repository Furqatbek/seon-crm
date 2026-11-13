"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Switches the interface language and keeps the current page. next-intl
 * remembers the choice in the NEXT_LOCALE cookie.
 */
export function useSwitchLocale() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: string) {
    const target = routing.locales.find((candidate) => candidate === next);
    if (!target || target === locale) return;
    startTransition(() => {
      router.replace(`${pathname}${window.location.search}`, { locale: target });
    });
  }

  return { locale: locale as Locale, locales: routing.locales, switchLocale, pending };
}
