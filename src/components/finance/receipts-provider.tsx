"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { fetchPendingReceipts } from "@/lib/receipts/actions";
import type { PendingReceipts } from "@/lib/receipts/queries";
import { getBrowserClient } from "@/lib/supabase/browser";

// Receipts waiting for review, live — docs/STUDENT_APP_SPEC.md → "CRM
// changes": new receipts use the live inbox pattern. A receipt sent from the
// app arrives through Supabase Realtime (row level security applies, so only
// the owner and managers hear anything): the count shows in the sidebar, a
// toast names the student, and an open Receipts list is read again.

const ReceiptsContext = createContext(0);

/** How many receipts wait for review. */
export const usePendingReceipts = () => useContext(ReceiptsContext);

/** If Realtime is not connected, the count is still asked for this often. */
const POLL_MS = 60_000;

export function ReceiptsProvider({ initial, enabled, children }: { initial: PendingReceipts; /** Off for teachers: no receipts, no subscription. */ enabled: boolean; children: React.ReactNode }) {
  const t = useTranslations("receipts");
  const router = useRouter();
  const [count, setCount] = useState(initial.count);
  const known = useRef(new Set(initial.latest.map((item) => item.id)));

  const refresh = useCallback(async () => {
    const next = await fetchPendingReceipts().catch(() => null);
    if (!next) return;
    const fresh = next.latest.filter((item) => !known.current.has(item.id));
    for (const item of next.latest) known.current.add(item.id);
    setCount((before) => {
      // Something changed: whatever list is open shows it.
      if (before !== next.count || fresh.length > 0) router.refresh();
      return next.count;
    });
    for (const item of fresh.slice(0, 3)) toast(t("newToast", { name: item.studentName }));
  }, [router, t]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase
      ?.channel("payment-receipts")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_receipts" }, soon)
      .subscribe((status) => {
        // Anything that happened while it was connecting.
        if (status === "SUBSCRIBED") soon();
      });
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return <ReceiptsContext value={count}>{children}</ReceiptsContext>;
}
