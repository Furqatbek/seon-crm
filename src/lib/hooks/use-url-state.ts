"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";

/** Filters, tabs and open records live in the URL, so a link reopens the same screen. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = useCallback(
    (patch: Record<string, string | null>, options: { push?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (options.push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { setParams, searchParams };
}
