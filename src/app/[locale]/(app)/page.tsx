import { Suspense } from "react";

import { redirect as plainRedirect } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";

// After sign-in the owner lands on Reports and a manager on Groups → Today.
async function RoleRedirect({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  if (!user) plainRedirect(`/auth/sign-out?locale=${locale}`);
  return redirect({ href: user.role === "owner" ? "/reports" : "/groups", locale });
}

export default async function HomePage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  return (
    <Suspense fallback={null}>
      <RoleRedirect locale={locale} />
    </Suspense>
  );
}
