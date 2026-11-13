import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links in Supabase emails (password reset). Exchanges the
 * one-time code for a session, then continues to ?next=.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";

  // Only same-site paths that start with a known locale.
  const locale =
    routing.locales.find(
      (candidate) => next === `/${candidate}` || next.startsWith(`/${candidate}/`),
    ) ?? routing.defaultLocale;
  const safeNext = next.startsWith(`/${locale}`) ? next : `/${locale}`;

  if (code) {
    const supabase = await createClient();
    const result = await supabase?.auth.exchangeCodeForSession(code);
    if (result && !result.error) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }
  return NextResponse.redirect(new URL(`/${locale}/forgot-password?error=link`, origin));
}
