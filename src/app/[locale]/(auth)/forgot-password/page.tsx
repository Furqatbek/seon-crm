import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { initLocale, type LocaleParams } from "@/i18n/params";

export default async function ForgotPasswordPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-title text-text">{t("forgotTitle")}</h1>
        <p className="text-body text-text-secondary">{t("forgotHint")}</p>
      </div>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </>
  );
}
