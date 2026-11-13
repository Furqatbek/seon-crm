import { getTranslations } from "next-intl/server";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { initLocale, type LocaleParams } from "@/i18n/params";

// Reached from the emailed link, after /auth/callback has signed the user in.
export default async function ResetPasswordPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <>
      <h1 className="text-center text-title text-text">{t("resetTitle")}</h1>
      <ResetPasswordForm />
    </>
  );
}
