"use client";

import { CheckinScreen, type CheckinActions } from "@/components/checkin/checkin-screen";
import type { CheckinResult, CheckinVisit } from "@/lib/checkin/types";

const arrived: CheckinVisit = {
  ok: true,
  kind: "arrived",
  repeat: false,
  time: "14:52",
  student: { id: "s-1", name: "Aziza Karimova", photoUrl: null },
  lessons: [
    { group: "TOPIK II · Kechki", start_time: "15:00", end_time: "16:30", room: "3", exam: false },
    { group: "Matematika · Shanba", start_time: "17:00", end_time: "18:30", room: null, exam: true },
  ],
  debt: true,
};
const left: CheckinVisit = { ...arrived, kind: "left", time: "18:34", debt: false, lessons: [] };

const STATES: Record<string, CheckinResult | null> = {
  idle: null,
  search: null,
  arrived,
  left,
  error: { ok: false, error: "expired" },
};

const actions: CheckinActions = {
  scan: async () => arrived,
  search: async () => [
    { id: "s-1", name: "Aziza Karimova", groups: "TOPIK II · Kechki, Matematika · Shanba" },
    { id: "s-2", name: "Azizbek Tursunov", groups: "TOPIK I · Ertalabki" },
    { id: "s-3", name: "Aziza Yoʻldosheva", groups: null },
  ],
  byHand: async () => left,
};

export function CheckinPreview({ state }: { state: string }) {
  return (
    <CheckinScreen
      centreName="Seon Topik"
      actions={actions}
      exit={{ href: "#", kind: state === "left" ? "back" : "signOut" }}
      initial={STATES[state] ?? null}
      camera={false}
      // The card stays for the screenshot.
      cardMs={600_000}
    />
  );
}
