"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset } from "@/lib/auth-actions";
import {
  forgotPasswordSchema,
  type AuthErrorKey,
  type ForgotPasswordValues,
} from "@/lib/validation/auth";

import { FormError } from "./form-error";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const expiredLink = useSearchParams().get("error") === "link";
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<AuthErrorKey | null>(
    expiredLink ? "linkInvalid" : null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values, locale);
      if (result.ok) setSent(true);
      else setFormError(result.error);
    });
  });

  const backLink = (
    <Link
      href="/sign-in"
      className="self-center rounded-inner text-body text-purple outline-none motion-fast hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
    >
      {t("backToSignIn")}
    </Link>
  );

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-success-tint px-3 py-2 text-footnote text-success"
        >
          <MailCheck className="size-4" aria-hidden />
          <span>{t("linkSent")}</span>
        </p>
        {backLink}
      </div>
    );
  }

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
      {formError ? <FormError>{t(`errors.${formError}`)}</FormError> : null}
      <Button type="submit" variant="primary" disabled={pending} className="mt-2">
        {t("sendLink")}
      </Button>
      {backLink}
    </form>
  );
}
