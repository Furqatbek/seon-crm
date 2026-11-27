import {
  ChartColumn,
  GraduationCap,
  CircleHelp,
  CalendarHeart,
  ClipboardList,
  History,
  Presentation,
  ScanLine,
  Settings,
  Star,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type BlockKey =
  | "leads"
  | "students"
  | "groups"
  | "points"
  | "teachers"
  | "finance"
  | "reports"
  | "checkin"
  | "settings"
  | "myGroups"
  | "pointsHistory"
  | "pointsReport"
  | "questions"
  | "exams"
  | "openLessons";

export type Block = { key: BlockKey; href: `/${string}`; icon: LucideIcon };

/** The blocks, in sidebar order. */
export const BLOCKS: Block[] = [
  { key: "leads", href: "/leads", icon: UserPlus },
  { key: "students", href: "/students", icon: GraduationCap },
  { key: "groups", href: "/groups", icon: Users },
  { key: "points", href: "/points", icon: Trophy },
  { key: "teachers", href: "/teachers", icon: Presentation },
  { key: "finance", href: "/finance", icon: Wallet },
  { key: "reports", href: "/reports", icon: ChartColumn },
  // The reception scanner: a full-screen page of its own.
  { key: "checkin", href: "/checkin", icon: ScanLine },
];

/** Shown at the bottom of the sidebar, to the owner only. */
export const SETTINGS_BLOCK: Block = { key: "settings", href: "/settings", icon: Settings };

export const ALL_BLOCKS: Block[] = [...BLOCKS, SETTINGS_BLOCK];

/** A teacher's whole sidebar. */
export const TEACHER_BLOCKS: Block[] = [
  { key: "myGroups", href: "/my-groups", icon: Star },
  { key: "pointsHistory", href: "/my-groups/history", icon: History },
  { key: "pointsReport", href: "/my-groups/reports", icon: ChartColumn },
  { key: "questions", href: "/my-groups/questions", icon: CircleHelp },
  { key: "exams", href: "/my-groups/exams", icon: ClipboardList },
  { key: "openLessons", href: "/my-groups/open-lessons", icon: CalendarHeart },
];
