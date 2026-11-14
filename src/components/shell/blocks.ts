import {
  ChartColumn,
  GraduationCap,
  Presentation,
  Settings,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type BlockKey =
  | "leads"
  | "students"
  | "groups"
  | "teachers"
  | "finance"
  | "reports"
  | "settings";

export type Block = { key: BlockKey; href: `/${BlockKey}`; icon: LucideIcon };

/** The six blocks, in sidebar order. */
export const BLOCKS: Block[] = [
  { key: "leads", href: "/leads", icon: UserPlus },
  { key: "students", href: "/students", icon: GraduationCap },
  { key: "groups", href: "/groups", icon: Users },
  { key: "teachers", href: "/teachers", icon: Presentation },
  { key: "finance", href: "/finance", icon: Wallet },
  { key: "reports", href: "/reports", icon: ChartColumn },
];

/** Shown at the bottom of the sidebar, to the owner only. */
export const SETTINGS_BLOCK: Block = { key: "settings", href: "/settings", icon: Settings };

export const ALL_BLOCKS: Block[] = [...BLOCKS, SETTINGS_BLOCK];
