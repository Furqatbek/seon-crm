"use client";

import { useEffect, useState } from "react";

import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * The names of other people who have this form's editor open, through
 * Supabase Realtime presence. Empty when Realtime is not available.
 */
export function usePresence(formId: string, me: { id: string; name: string }): string[] {
  const [others, setOthers] = useState<string[]>([]);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    // One key per tab: the same person in two tabs is still one name.
    const channel = supabase.channel(`form-editor:${formId}`, { config: { presence: { key: crypto.randomUUID() } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id: string; name: string }>();
        const names = new Set<string>();
        for (const tabs of Object.values(state)) for (const tab of tabs) if (tab.id !== me.id && tab.name) names.add(tab.name);
        setOthers([...names].sort());
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ id: me.id, name: me.name });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [formId, me.id, me.name]);

  return others;
}
