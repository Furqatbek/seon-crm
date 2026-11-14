import type { BadgeTone } from "@/components/ui/badge";
import type { RateStatus } from "@/lib/domain/pay-rates";
import type { Enums } from "@/lib/supabase/types";

export const LESSON_TONE: Record<Enums<"lesson_status">, BadgeTone> = {
  scheduled: "neutral",
  held: "success",
  cancelled: "danger",
};

export const RATE_TONE: Record<RateStatus, BadgeTone> = {
  current: "success",
  upcoming: "purple",
  past: "neutral",
};
