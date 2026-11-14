"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/lib/auth-actions";
import {
  resetPasswordSchema,
  type AuthErrorKey,
  type ResetPasswordValues,
} from "@/lib/validation/auth";

import { FormError } from "./form-error";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePassword(values, locale);
      if (result && !result.ok) setFormError(result.error);
      else toast(t("passwordSaved"));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label={t("newPassword")}
        htmlFor="password"
        error={errors.password ? t(`errors.${errors.password.message as AuthErrorKey}`) : null}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
      </Field>
      <Field
        label={t("confirmPassword")}
        htmlFor="confirm"
        error={errors.confirm ? t(`errors.${errors.confirm.message as AuthErrorKey}`) : null}
      >
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
          {...register("confirm")}
        />
      </Field>
      {formError ? <FormError>{t(`errors.${formError}`)}</FormError> : null}
      <Button type="submit" variant="primary" disabled={pending} className="mt-2">
        {t("savePassword")}
      </Button>
    </form>
  );
}
