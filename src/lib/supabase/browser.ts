"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "./env";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/**
 * Supabase client for the browser, as the signed-in user. Only for Realtime
 * (who else is on a screen); data is read and written on the server.
 */
export function getBrowserClient(): SupabaseClient<Database> | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  client ??= createBrowserClient<Database>(env.url, env.publishableKey);
  return client;
}
