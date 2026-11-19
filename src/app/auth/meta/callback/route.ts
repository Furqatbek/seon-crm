import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { appUrl } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/auth";
import { metaClient } from "@/lib/meta/store";
import { createAdminClient } from "@/lib/supabase/admin";

const STATE_COOKIE = "meta_oauth_state";

/**
 * Facebook sends the owner back here after the permission dialog. The code is
 * exchanged for a long-lived token of that person, which waits in Vault (never
 * in the browser) while they choose which Pages to connect in Settings.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const state = query.get("state") ?? "";
  const cookie = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const locale = routing.locales.find((candidate) => candidate === state.split(".")[1]) ?? routing.defaultLocale;
  const base = await appUrl();
  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/${locale}/settings?tab=integrations&meta=${result}`, base));
    response.cookies.delete({ name: STATE_COOKIE, path: "/auth/meta" });
    return response;
  };

  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return NextResponse.redirect(new URL(`/${locale}`, base));
  // The state must be the one this browser was given: nobody else can finish this owner's connection.
  const [given, expected] = [Buffer.from(state), Buffer.from(cookie)];
  if (state === "" || given.length !== expected.length || !timingSafeEqual(given, expected)) return back("state");
  // The owner pressed Cancel in Facebook's dialog.
  if (query.get("error") || !query.get("code")) return back("cancelled");

  const client = metaClient();
  const admin = createAdminClient();
  if (!client || !admin) return back("not_configured");
  try {
    const token = await client.exchangeCode(query.get("code") as string, `${base}/auth/meta/callback`);
    const { error } = await admin.rpc("meta_set_pending", { p_user: user.id, p_token: token });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("meta connect", error instanceof Error ? error.message : error);
    return back("failed");
  }
  return back("choose");
}
