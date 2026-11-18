import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { InboxProvider } from "@/components/leads/inbox-provider";
import { AppShell } from "@/components/shell/app-shell";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getSignedInUser } from "@/lib/auth";
import { getCentreName } from "@/lib/centre";
import { getAlertSound, getInbox } from "@/lib/leads/inbox";
import { getOpenRequestCount } from "@/lib/points/queries";

// The proxy already turns away visitors without a session. This is the
// second check: the user must also have an active profile. Anyone else is
// signed out.
async function SignedIn({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Asked for together: one trip to the database, not two.
  const [user, name, openRequests, inbox, sound] = await Promise.all([
    getSignedInUser(),
    getCentreName(),
    getOpenRequestCount(),
    getInbox(),
    getAlertSound(),
  ]);
  if (!user) redirect(`/auth/sign-out?locale=${locale}`);
  const centreName = name ?? (await getTranslations({ locale, namespace: "app" }))("name");
  return (
    // The shared inbox is live on every page: the count in the sidebar and the
    // tab title, and a toast when a lead arrives. Teachers have no inbox.
    <InboxProvider initial={inbox} sound={sound} enabled={user.role !== "teacher"}>
      <AppShell user={user} centreName={centreName} openRequests={openRequests}>
        {children}
      </AppShell>
    </InboxProvider>
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
