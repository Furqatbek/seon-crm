"use server";

import { hasLocale } from "next-intl";
import { headers } from "next/headers";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  type AuthResult,
} from "@/lib/validation/auth";

function toLocale(value: unknown): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
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

  // The home route sends owners to Reports and managers to Groups.
  return redirect({ href: "/", locale });
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
