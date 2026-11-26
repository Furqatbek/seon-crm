"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchInbox } from "@/lib/leads/actions";
import type { InboxItem } from "@/lib/leads/inbox";
import { getBrowserClient } from "@/lib/supabase/browser";

// The shared inbox, live — docs/SPEC.md → "Lead forms add-on → Shared inbox and
// staff alerts → In the CRM". New leads arrive through Supabase Realtime (row
// level security applies, so only the owner and managers hear anything); a
// toast names the form and the lead, a short sound plays unless it is turned
// off in Profile, and the count shows in the sidebar and the tab title.

type Inbox = {
  items: InboxItem[];
  /** Ask the server again now. */
  refresh: () => Promise<void>;
  /** Take a lead off the list at once, before the server confirms. */
  remove: (id: string) => void;
};

const InboxContext = createContext<Inbox>({ items: [], refresh: async () => {}, remove: () => {} });

export const useInbox = () => useContext(InboxContext);

/** If Realtime is not connected, the inbox is still asked for this often. */
const POLL_MS = 60_000;

/** A short two-note chime, made in the browser: no sound file to load. */
function chime() {
  try {
    const context = new AudioContext();
    const start = context.currentTime;
    for (const [index, frequency] of [880, 1175].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.14;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.32);
    }
    setTimeout(() => void context.close(), 900);
  } catch {
    // No sound is not a problem: the toast and the count still show.
  }
}

export function InboxProvider({
  initial,
  sound,
  enabled,
  children,
}: {
  initial: InboxItem[];
  /** The person's "sound" switch in Profile. */
  sound: boolean;
  /** Off for teachers: no inbox, no subscription. */
  enabled: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("leads");
  const [items, setItems] = useState(initial);
  const known = useRef(new Set(initial.map((item) => item.id)));
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
  }, [sound]);

  const refresh = useCallback(async () => {
    const next = await fetchInbox().catch(() => null);
    if (!next) return;
    const fresh = next.filter((item) => !known.current.has(item.id));
    known.current = new Set(next.map((item) => item.id));
    setItems(next);
    if (fresh.length === 0) return;
    for (const item of fresh.slice(0, 3)) {
      toast(item.formName ? t("inbox.newToast", { form: item.formName, name: item.fullName }) : t("inbox.newToastPlain", { name: item.fullName }));
    }
    if (soundOn.current) chime();
  }, [t]);

  const remove = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Several changes in a row (a lead and its timeline) are one refresh.
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase
      ?.channel("lead-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, soon)
      .subscribe((status) => {
        // Anything that happened while it was connecting.
        if (status === "SUBSCRIBED") soon();
      });
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  // "(3) Leads" in the browser tab, whatever page is open.
  const count = items.length;
  useEffect(() => {
    if (!enabled) return;
    const strip = (title: string) => title.replace(/^\(\d+\)\s/, "");
    const apply = () => {
      const base = strip(document.title);
      const wanted = count > 0 ? `(${count}) ${base}` : base;
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // A new page sets its own title: put the count back in front.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = strip(document.title);
    };
  }, [count, enabled]);

  const value = useMemo(() => ({ items, refresh, remove }), [items, refresh, remove]);
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
