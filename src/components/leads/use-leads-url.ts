"use client";

import { useUrlState } from "@/lib/hooks/use-url-state";

/** URL state of /leads: filters, the view and the open lead. */
export function useLeadsUrl() {
  const { setParams } = useUrlState();
  return {
    setParams,
    openLead: (id: string) => setParams({ lead: id }, { push: true }),
    closeLead: () => setParams({ lead: null }),
  };
}
