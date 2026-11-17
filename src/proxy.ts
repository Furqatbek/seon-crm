import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { refreshSession, tvTokenOk } from "@/lib/supabase/proxy";

const handleI18n = createIntlMiddleware(routing);

// Reachable without a session. Everything else under /[locale] is protected.
const PUBLIC_PATHS = ["/sign-in", "/forgot-password", "/accept-invite"];
const DEV_PATHS = ["/dev"];

function matches(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function redirectTo(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Keep refreshed session cookies and the locale cookie.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export default async function proxy(request: NextRequest) {
  const response = handleI18n(request);

  const { pathname } = request.nextUrl;
  const locale = routing.locales.find(
    (candidate) => pathname === `/${candidate}` || pathname.startsWith(`/${candidate}/`),
  );
  // No locale prefix yet: next-intl is redirecting to one.
  if (!locale) return response;

  const path = pathname.slice(locale.length + 1) || "/";

  // The TV screen has no login: its secret link is the key. A wrong or old
  // link is a 404 and shows nothing.
  if (matches(path, ["/tv"])) {
    if (await tvTokenOk(path.split("/")[2])) return response;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/tv`;
    return NextResponse.rewrite(url, { status: 404 });
  }

  const signedIn = await refreshSession(request, response);

  if (process.env.NODE_ENV === "development" && matches(path, DEV_PATHS)) {
    return response;
  }
  // An invitation is opened whoever is signed in on this browser: it replaces the session.
  if (matches(path, ["/accept-invite"])) return response;
  if (matches(path, PUBLIC_PATHS)) {
    return signedIn ? redirectTo(request, response, `/${locale}`) : response;
  }
  return signedIn ? response : redirectTo(request, response, `/${locale}/sign-in`);
}

export const config = {
  // Everything except API routes, the auth callback, Next internals and files.
  matcher: "/((?!api|auth|_next|_vercel|.*\\..*).*)",
};
