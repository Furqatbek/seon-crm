"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";
import { acceptInvite } from "@/lib/auth-actions";

/** Reads the session out of the address fragment, stores it and continues to the password form. */
export function AcceptInvite() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const tokens = { access_token: fragment.get("access_token"), refresh_token: fragment.get("refresh_token") };
    // The tokens do not stay in the address bar or the browser history.
    window.history.replaceState(null, "", window.location.pathname);
    if (!tokens.access_token || !tokens.refresh_token) {
      // An expired or already used link arrives with an error instead of a session.
      queueMicrotask(() => setFailed(true));
      return;
    }
    void acceptInvite(tokens, locale).then((result) => {
      if (result && !result.ok) setFailed(true);
    });
  }, [locale]);

  if (!failed) {
    return (
      <p role="status" className="text-center text-body text-text-secondary">
        {t("inviteOpening")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4 text-center">
      <p role="alert" className="text-body text-danger">
        {t("inviteInvalid")}
      </p>
      <Link href="/sign-in" className="text-body font-medium text-purple hover:underline">
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
