import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase session for this request and writes the new cookies
 * onto the response. Returns whether a valid user is signed in.
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<boolean> {
  const env = getSupabaseEnv();
  if (!env) return false;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() verifies the token's signature and renews an expired session;
  // getSession() alone would trust the cookie. With asymmetric signing keys the
  // check needs no call to Supabase Auth, which keeps every page load fast.
  const { data, error } = await supabase.auth.getClaims();
  return !error && Boolean(data?.claims?.sub);
}
