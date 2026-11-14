import {
  Camera,
  CircleEllipsis,
  Footprints,
  Globe,
  Phone,
  Send,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { BadgeTone } from "@/components/ui/badge";
import type { LeadSource, LeadStatus } from "@/lib/domain/leads";

export const STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  new: "neutral",
  contacted: "neutral",
  trial: "purple",
  won: "success",
  lost: "danger",
};

export const SOURCE_ICON: Record<LeadSource, LucideIcon> = {
  instagram: Camera,
  telegram: Send,
  phone_call: Phone,
  walk_in: Footprints,
  referral: UsersRound,
  website: Globe,
  other: CircleEllipsis,
};
