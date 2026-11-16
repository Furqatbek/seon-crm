import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CoinRow = {
  studentId: string;
  fullName: string;
  /** Coins earned in this group: what the rank is by. */
  earned: number;
  /** Coins the student can still spend, from every group. */
  balance: number;
  /** 1 is the most coins earned in the group; equal counts share a place. */
  rank: number;
};

/**
 * A group's students with their coins, best first. The database returns it
 * to staff and to the group's own teacher, and to nobody else.
 */
export async function getGroupCoins(groupId: string): Promise<CoinRow[]> {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("group_coins", { p_group_id: groupId });
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    studentId: row.student_id,
    fullName: row.full_name,
    earned: row.earned,
    balance: row.balance,
    rank: row.rank,
  }));
}
