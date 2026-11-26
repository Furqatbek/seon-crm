import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CheckinScreen } from "@/components/checkin/checkin-screen";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getCheckinUser } from "@/lib/auth";
import { getCentreName } from "@/lib/centre";
import { checkInByCode, checkInByHand, searchForCheckin } from "@/lib/checkin/actions";

export async function generateMetadata({ params }: LocaleParams) {
  const locale = await initLocale(params);
  return { title: (await getTranslations({ locale, namespace: "checkin" }))("title") };
}

// The reception scanner: for a kiosk account, the owner and managers. A
// teacher, or anyone else who is signed in, is sent away; the database refuses
// them the check-in itself as well.
async function Checkin({ locale }: { locale: Locale }) {
  const [user, name] = await Promise.all([getCheckinUser(), getCentreName()]);
  if (!user) redirect(`/${locale}`);
  const centreName = name ?? (await getTranslations({ locale, namespace: "app" }))("name");
  return (
    <CheckinScreen
      centreName={centreName}
      actions={{ scan: checkInByCode, search: searchForCheckin, byHand: checkInByHand }}
      exit={user.role === "kiosk" ? { href: `/auth/sign-out?locale=${locale}`, kind: "signOut" } : { href: `/${locale}`, kind: "back" }}
    />
  );
}

export default async function CheckinPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  return (
    <Suspense fallback={<div className="h-dvh bg-bg-subtle" />}>
      <Checkin locale={locale} />
    </Suspense>
  );
}
