import { getTranslations } from "next-intl/server";

import { SignInForm } from "@/components/auth/sign-in-form";
import { initLocale, type LocaleParams } from "@/i18n/params";

export default async function SignInPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations({ locale, namespace: "app" });
  return (
    <>
      <h1 className="text-center text-title text-text">{t("name")}</h1>
      <SignInForm />
    </>
  );
}
