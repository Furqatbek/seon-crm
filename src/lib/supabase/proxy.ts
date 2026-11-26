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

/** Whether a /tv/<token> link is the current one. Asked without a session: the token is the key. */
export async function tvTokenOk(token: string | undefined): Promise<boolean> {
  const env = getSupabaseEnv();
  if (!env || !token || !/^[0-9a-f]{32,64}$/.test(token)) return false;
  try {
    const response = await fetch(`${env.url}/rest/v1/rpc/tv_token_ok`, {
      method: "POST",
      headers: { apikey: env.publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ p_token: token }),
      cache: "no-store",
    });
    return response.ok && (await response.json()) === true;
  } catch {
    return false;
  }
}
