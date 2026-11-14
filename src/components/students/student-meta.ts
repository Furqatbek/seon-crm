import type { BadgeTone } from "@/components/ui/badge";
import type { AttendanceStatus } from "@/lib/domain/attendance";
import type { BalanceState } from "@/lib/domain/ledger";
import type { Enums } from "@/lib/supabase/types";

export const STUDENT_TONE: Record<Enums<"student_status">, BadgeTone> = {
  active: "success",
  paused: "warning",
  left: "neutral",
};

/** Only a balance below zero gets a pill: Debt or Due. */
export const BALANCE_TONE: Record<BalanceState, BadgeTone> = {
  debt: "danger",
  due: "warning",
  settled: "neutral",
  credit: "success",
};

export const MARK_TONE: Record<AttendanceStatus, BadgeTone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  excused: "neutral",
};

export const MESSAGE_TONE: Record<Enums<"message_status">, BadgeTone> = {
  queued: "neutral",
  sent: "success",
  failed: "danger",
  skipped: "warning",
};
