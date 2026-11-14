"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";

/** Filters, tabs and open records live in the URL, so a link reopens the same screen. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Two changes in quick succession (untick a filter, then pick another) must
  // build on each other, not on the URL from before the first one landed.
  const latest = useRef(searchParams.toString());
  useEffect(() => {
    latest.current = searchParams.toString();
  }, [searchParams]);

  const setParams = useCallback(
    (patch: Record<string, string | null>, options: { push?: boolean } = {}) => {
      const next = new URLSearchParams(latest.current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      latest.current = query;
      const href = query ? `${pathname}?${query}` : pathname;
      if (options.push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  return { setParams, searchParams };
}
