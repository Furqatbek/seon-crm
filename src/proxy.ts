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

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * Whether the request came to the public forms address (FORMS_HOST, e.g.
 * forms.yourcentre.uz). A port in FORMS_HOST must match; without one any port does.
 */
function onFormsHost(request: NextRequest): boolean {
  const formsHost = process.env.FORMS_HOST?.trim().toLowerCase();
  const host = request.headers.get("host")?.toLowerCase();
  if (!formsHost || !host) return false;
  return host === formsHost || (!formsHost.includes(":") && host.split(":")[0] === formsHost);
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The forms host serves a form at /<slug> and the intake endpoints, and
  // nothing else: every staff route is a 404 there.
  if (onFormsHost(request)) {
    if (/^\/api\/(v1|meta)(\/|$)/.test(pathname)) return NextResponse.next();
    const slug = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(pathname)?.[1];
    if (!slug) return notFound();
    const url = request.nextUrl.clone();
    url.pathname = `/form/${slug}`;
    return NextResponse.rewrite(url);
  }
  // And a form page, the intake API and the Meta webhook are a 404 on the staff host.
  if (pathname === "/form" || pathname.startsWith("/form/")) return notFound();
  if (/^\/api\/(v1|meta)(\/|$)/.test(pathname)) return notFound();
  // API routes and the auth callback look after themselves.
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) return NextResponse.next();

  const response = handleI18n(request);

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
  // Everything except Next internals and files. API routes and the auth
  // callback are let through above, once the host has been checked.
  matcher: "/((?!_next|_vercel|.*\\..*).*)",
};
