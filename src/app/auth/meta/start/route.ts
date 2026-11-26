import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { appUrl } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/auth";
import { loginUrl } from "@/lib/meta/graph";
import { metaConfig } from "@/lib/meta/store";

const META_STATE_COOKIE = "meta_oauth_state";

/**
 * "Connect with Facebook" (Settings → Integrations, owner only): sends the
 * owner to Facebook's permission dialog. A random state is kept in a cookie
 * and checked when Facebook sends them back to /auth/meta/callback.
 */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("locale");
  const locale = routing.locales.find((candidate) => candidate === requested) ?? routing.defaultLocale;
  const base = await appUrl();
  const back = (problem: string) => NextResponse.redirect(new URL(`/${locale}/settings?tab=integrations&meta=${problem}`, base));

  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return NextResponse.redirect(new URL(`/${locale}`, base));
  const config = metaConfig();
  if (!config) return back("not_configured");

  const state = `${randomBytes(24).toString("hex")}.${locale}`;
  const response = NextResponse.redirect(loginUrl(config.appId, `${base}/auth/meta/callback`, state));
  response.cookies.set(META_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https://"), maxAge: 600, path: "/auth/meta" });
  return response;
}
