import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Supabase client with the service role, which bypasses Row Level Security.
 * Only for work no signed-in user does: the reminders job, the Telegram
 * webhook, and writing a message's delivery status. Never import this into
 * anything a browser can reach, and check who is asking before using it on a
 * user's behalf. Null until SUPABASE_SECRET_KEY is set.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
