"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { saveLanguage } from "@/lib/settings/actions";

/**
 * Switches the interface language and keeps the current page. next-intl
 * remembers the choice in the NEXT_LOCALE cookie; with `remember`, it is also
 * saved on the signed-in user's profile, for the next sign-in on any device.
 */
export function useSwitchLocale(options: { remember?: boolean } = {}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: string) {
    const target = routing.locales.find((candidate) => candidate === next);
    if (!target || target === locale) return;
    startTransition(async () => {
      if (options.remember) await saveLanguage(target);
      router.replace(`${pathname}${window.location.search}`, { locale: target });
    });
  }

  return { locale: locale as Locale, locales: routing.locales, switchLocale, pending };
}
