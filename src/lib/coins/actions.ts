"use server";

import { refresh } from "next/cache";

import { getSignedInUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  COIN_ERRORS,
  giveCoinsSchema,
  signedAmount,
  staffCoinsSchema,
  type CoinsErrorKey,
  type CoinsResult,
} from "@/lib/validation/coins";

// Coins — docs/SPEC.md → "Business rules → Coins". Both actions call
// add_coins(), which decides what the caller may do: a teacher 1–10 coins in
// their own group, staff any amount and spending.

async function addCoins(args: { student: string; group: string; amount: number; reason: string | null }): Promise<CoinsResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "generic" };
  const { data, error } = await supabase.rpc("add_coins", {
    p_student_id: args.student,
    p_group_id: args.group,
    p_amount: args.amount,
    p_reason: args.reason ?? undefined,
  });
  if (error) return { ok: false, error: (error.code && COIN_ERRORS[error.code]) || "generic" };
  refresh();
  return { ok: true, balance: data };
}

const firstIssue = (error: { issues: { message: string }[] }) => (error.issues[0]?.message as CoinsErrorKey) ?? "generic";

/** A teacher gives 1–10 coins to a student of their own group. */
export async function giveCoins(input: unknown): Promise<CoinsResult> {
  const parsed = giveCoinsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const user = await getSignedInUser();
  if (user?.role !== "teacher") return { ok: false, error: "notAllowed" };
  const { student_id, group_id, amount, reason } = parsed.data;
  return addCoins({ student: student_id, group: group_id, amount, reason });
}

/** Owner or manager gives coins, or spends them with a reason. */
export async function changeCoins(input: unknown): Promise<CoinsResult> {
  const parsed = staffCoinsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const user = await getSignedInUser();
  if (!user || user.role === "teacher") return { ok: false, error: "notAllowed" };
  const { student_id, group_id, kind, amount, reason } = parsed.data;
  return addCoins({ student: student_id, group: group_id, amount: signedAmount(kind, amount), reason });
}
