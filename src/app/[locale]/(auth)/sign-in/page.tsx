import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { SignInForm } from "@/components/auth/sign-in-form";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCentreName } from "@/lib/centre";

/** The centre's name from Settings; the app's own name until it has loaded or if it cannot be read. */
async function CentreName({ fallback }: { fallback: string }) {
  return (await getCentreName()) ?? fallback;
}

export default async function SignInPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations({ locale, namespace: "app" });
  return (
    <>
      <h1 className="text-center text-title break-words text-text">
        <Suspense fallback={t("name")}>
          <CentreName fallback={t("name")} />
        </Suspense>
      </h1>
      <SignInForm />
    </>
  );
}
