"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { signIn } from "@/lib/auth-actions";
import { signInSchema, type AuthErrorKey, type SignInValues } from "@/lib/validation/auth";

import { FormError } from "./form-error";

export function SignInForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signIn(values, locale);
      if (result && !result.ok) setFormError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label={t("email")}
        htmlFor="email"
        error={errors.email ? t(`errors.${errors.email.message as AuthErrorKey}`) : null}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
      </Field>
      <Field
        label={t("password")}
        htmlFor="password"
        error={errors.password ? t(`errors.${errors.password.message as AuthErrorKey}`) : null}
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
      </Field>
      {formError ? <FormError>{t(`errors.${formError}`)}</FormError> : null}
      <Button type="submit" variant="primary" disabled={pending} className="mt-2">
        {t("signIn")}
      </Button>
      <Link
        href="/forgot-password"
        className="self-center rounded-inner text-body text-purple outline-none motion-fast hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
      >
        {t("forgotPassword")}
      </Link>
    </form>
  );
}
