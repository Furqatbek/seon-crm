import { getTranslations } from "next-intl/server";

import { AcceptInvite } from "@/components/auth/accept-invite";
import { initLocale, type LocaleParams } from "@/i18n/params";

// Reached from the invitation email. The link carries the new user's session
// in the address fragment; the component stores it and moves on to choosing
// a password.
export default async function AcceptInvitePage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <>
      <h1 className="text-center text-title text-text">{t("inviteTitle")}</h1>
      <AcceptInvite />
    </>
  );
}
