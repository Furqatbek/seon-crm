import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { getSupabaseEnv } from "./env";
import type { Database } from "./types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It acts as the signed-in user, so Row Level Security applies.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;

  // The auth client reads the clock (token expiry), so it must only ever run
  // for a real request, never while a page shell is being prerendered.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
