import { Suspense } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { redirect } from "@/i18n/navigation";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";

// The proxy already turns away visitors without a session; this is the
// second check, next to the data, and it gives the shell its user.
async function SignedIn({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/sign-in", locale });
  return <AppShell user={user}>{children}</AppShell>;
}

export default async function AppLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  const locale = await initLocale(params);
  return (
    <Suspense fallback={null}>
      <SignedIn locale={locale}>{children}</SignedIn>
    </Suspense>
  );
}
