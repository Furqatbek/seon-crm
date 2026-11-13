import type { BadgeTone } from "@/components/ui/badge";
import type { Enums } from "@/lib/supabase/types";

export const GROUP_TONE: Record<Enums<"group_status">, BadgeTone> = {
  forming: "purple",
  active: "success",
  finished: "neutral",
};

export const LESSON_TONE: Record<Enums<"lesson_status">, BadgeTone> = {
  scheduled: "neutral",
  held: "success",
  cancelled: "danger",
};

export type Weekday = "1" | "2" | "3" | "4" | "5" | "6" | "7";

export const hhmm = (time: string) => time.slice(0, 5);
