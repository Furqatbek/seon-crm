import type { Language, LinkRole } from "./types.ts";

// The shapes the bot and the points messages read. They mirror
// points_summary() and bot_top() in the database.

export type PointsSummary = {
  student_id: string;
  name: string;
  /** Status Active and not archived. */
  active: boolean;
  /** The month the ranks and month_points are for, "YYYY-MM". */
  month: string;
  balance: number;
  week_points: number;
  month_points: number;
  centre_rank: number | null;
  /** The student's active groups, most points first. */
  groups: Array<{ name: string; points: number; rank: number }>;
  perfect_month_bonus: number;
  last: Array<{
    delta: number;
    source: string;
    reason: string | null;
    preset: Record<Language, string> | null;
  }>;
  /** The cheapest reward on offer the student cannot afford yet. */
  next_reward: { name: string; cost: number; needed: number } | null;
};

export type BoardLine = { name: string; points: number; rank: number };
export type BotTop = {
  centre: BoardLine[];
  own: { rank: number; points: number } | null;
  groups: Array<{ name: string; rows: BoardLine[]; own: { rank: number; points: number } }>;
};

export type Link = { studentId: string; fullName: string; role: LinkRole; chatId: number; language: Language };

export type RewardOffer = { id: string; name: string; cost: number; stock: number | null };

/** A text of the bot in one language: `key` is under "bot" in messages/*.json. */
export type Texts = (language: Language) => (key: string, values?: Record<string, string | number>) => string;
