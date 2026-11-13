import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * Ends the session and returns to sign-in. The app shell sends a user here
 * when their session is valid but their profile is missing or deactivated;
 * redirecting them straight to sign-in would bounce back, because the proxy
 * still sees a session.
 */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("locale");
  const locale = routing.locales.find((candidate) => candidate === requested) ?? routing.defaultLocale;

  const supabase = await createClient();
  await supabase?.auth.signOut();

  return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.nextUrl.origin));
}
