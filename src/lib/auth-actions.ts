"use server";

import { hasLocale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  sessionTokensSchema,
  signInSchema,
  type AuthResult,
} from "@/lib/validation/auth";

function toLocale(value: unknown): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

export async function signIn(input: unknown, localeInput: unknown): Promise<AuthResult> {
  const locale = toLocale(localeInput);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidCredentials" };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "notConfigured" };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const wrongLogin = error.code === "invalid_credentials" || error.status === 400;
    return { ok: false, error: wrongLogin ? "invalidCredentials" : "generic" };
  }

  // The interface opens in the language saved on the user's profile. The home
  // route sends owners to Reports and managers to Groups.
  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = user.user
    ? await supabase.from("profiles").select("language").eq("id", user.user.id).maybeSingle()
    : { data: null };
  return redirect({ href: "/", locale: profile ? toLocale(profile.language) : locale });
}

/**
 * The last step of an invitation. The emailed link lands on /accept-invite
 * with the new session in the address fragment, which only the browser sees;
 * the page hands it over here to be stored, then the user chooses a password.
 */
export async function acceptInvite(tokens: unknown, localeInput: unknown): Promise<AuthResult> {
  const locale = toLocale(localeInput);
  const parsed = sessionTokensSchema.safeParse(tokens);
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "notConfigured" };
  if (!parsed.success) return { ok: false, error: "linkInvalid" };

  const { error } = await supabase.auth.setSession(parsed.data);
  if (error) return { ok: false, error: "linkInvalid" };
  return redirect({ href: "/reset-password", locale });
}

export async function requestPasswordReset(
  input: unknown,
  localeInput: unknown,
): Promise<AuthResult> {
  const locale = toLocale(localeInput);
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "emailInvalid" };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "notConfigured" };

  const next = encodeURIComponent(`/${locale}/reset-password`);
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await appUrl()}/auth/callback?next=${next}`,
  });
  // Same answer whether or not the address has an account. Only real failures
  // (rate limit, mail not configured) are reported.
  if (error && error.status !== 400 && error.status !== 404) {
    return { ok: false, error: "generic" };
  }
  return { ok: true };
}

export async function updatePassword(
  input: unknown,
  localeInput: unknown,
): Promise<AuthResult> {
  const locale = toLocale(localeInput);
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message === "passwordMismatch" ? "passwordMismatch" : "passwordTooShort",
    };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "notConfigured" };

  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "linkInvalid" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "generic" };

  return redirect({ href: "/", locale });
}

export async function signOut(localeInput: unknown): Promise<void> {
  const locale = toLocale(localeInput);
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect({ href: "/sign-in", locale });
}
