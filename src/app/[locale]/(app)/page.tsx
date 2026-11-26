import { Suspense } from "react";

import { redirect as plainRedirect } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getSignedInUser } from "@/lib/auth";

// After sign-in the owner lands on Reports, a manager on Groups → Today and a
// teacher on their own groups.
async function RoleRedirect({ locale }: { locale: Locale }) {
  const user = await getSignedInUser();
  if (!user) plainRedirect(`/auth/sign-out?locale=${locale}`);
  const href = user.role === "owner" ? "/reports" : user.role === "manager" ? "/groups" : "/my-groups";
  return redirect({ href, locale });
}

export default async function HomePage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  return (
    <Suspense fallback={null}>
      <RoleRedirect locale={locale} />
    </Suspense>
  );
}
