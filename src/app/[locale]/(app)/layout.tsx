import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getSignedInUser } from "@/lib/auth";
import { getCentreName } from "@/lib/centre";
import { getOpenRequestCount } from "@/lib/points/queries";

// The proxy already turns away visitors without a session. This is the
// second check: the user must also have an active profile. Anyone else is
// signed out.
async function SignedIn({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Asked for together: one trip to the database, not two.
  const [user, name, openRequests] = await Promise.all([getSignedInUser(), getCentreName(), getOpenRequestCount()]);
  if (!user) redirect(`/auth/sign-out?locale=${locale}`);
  const centreName = name ?? (await getTranslations({ locale, namespace: "app" }))("name");
  return (
    <AppShell user={user} centreName={centreName} openRequests={openRequests}>
      {children}
    </AppShell>
  );
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
