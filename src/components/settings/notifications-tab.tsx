"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { formatPhone } from "@/lib/format";
import { connectTelegramWebhook, saveNotifications, sendTestSms } from "@/lib/settings/actions";
import type { CentreSettings, Integrations } from "@/lib/settings/queries";
import {
  notificationsSchema,
  type NotificationsInput,
  type NotificationsValues,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem, Section } from "./parts";

type Failure = Extract<SettingsResult, { ok: false }>;

function TelegramCard({ integrations }: { integrations: Integrations }) {
  const t = useTranslations("settings.notifications");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, startTransition] = useTransition();
  const bot = integrations.telegram;

  function connect() {
    setFailure(null);
    startTransition(async () => {
      const result = await connectTelegramWebhook();
      if (!result.ok) setFailure(result);
      else toast(t("connectedToast", { username: result.data.username }));
    });
  }

  const pill =
    bot.state === "not_configured" ? (
      <StatusPill>{t("telegramNotConfigured")}</StatusPill>
    ) : bot.state === "unreachable" ? (
      <StatusPill tone="danger">{t("telegramUnreachable")}</StatusPill>
    ) : bot.connected ? (
      <StatusPill tone="success">{t("telegramConnected")}</StatusPill>
    ) : (
      <StatusPill tone="warning">{t("telegramNotConnected")}</StatusPill>
    );

  return (
    <Section title={t("telegram")} aside={<span data-slot="telegram-status">{pill}</span>}>
      {bot.state === "not_configured" ? (
        <p className="text-footnote text-text-secondary">{t("telegramNotConfiguredHint")}</p>
      ) : (
        <>
          {bot.state === "ready" && bot.username ? <p className="text-body text-text">@{bot.username}</p> : null}
          {bot.state === "unreachable" ? <p className="text-footnote break-words text-text-secondary">{bot.error}</p> : null}
          <p className="text-footnote text-text-secondary">
            {t("webhook")}: <span className="break-all text-text">{integrations.webhookUrl}</span>
          </p>
          {bot.state === "ready" && bot.webhook && !bot.connected ? (
            <p className="text-footnote break-all text-text-secondary">{t("webhookElsewhere", { url: bot.webhook })}</p>
          ) : null}
          {bot.state === "ready" && bot.lastError ? (
            <p className="text-footnote break-words text-danger">{t("lastError", { error: bot.lastError })}</p>
          ) : null}
          {!integrations.webhookPossible ? (
            <p className="text-footnote text-text-secondary">{t("webhookNeedsHttps")}</p>
          ) : null}
          <Problem failure={failure} />
          <Button onClick={connect} disabled={busy || !integrations.webhookPossible} className="self-start">
            {t("connect")}
          </Button>
        </>
      )}
    </Section>
  );
}

function EskizCard({ integrations }: { integrations: Integrations }) {
  const t = useTranslations("settings.notifications");
  const tErrors = useTranslations("settings.errors");
  const [phone, setPhone] = useState("+998");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, startTransition] = useTransition();
  const { configured, sender } = integrations.eskiz;

  function send(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    startTransition(async () => {
      const number = phone.replace(/[\s()-]/g, "");
      const result = await sendTestSms({ phone: number });
      if (!result.ok) setFailure(result);
      else toast(t("testSent", { phone: formatPhone(number) }));
    });
  }

  return (
    <Section
      title={t("eskiz")}
      aside={
        <span data-slot="eskiz-status">
          <StatusPill tone={configured ? "success" : "neutral"}>{t(configured ? "eskizConfigured" : "eskizNotConfigured")}</StatusPill>
        </span>
      }
    >
      {!configured ? (
        <p className="text-footnote text-text-secondary">{t("eskizNotConfiguredHint")}</p>
      ) : (
        <form onSubmit={send} noValidate className="flex flex-col gap-3">
          {sender ? <p className="text-footnote text-text-secondary">{t("sender", { sender })}</p> : null}
          <Field
            label={t("testPhone")}
            htmlFor="test-sms-phone"
            error={failure?.error === "phoneInvalid" ? tErrors("phoneInvalid") : null}
          >
            <Input id="test-sms-phone" type="tel" inputMode="tel" autoComplete="off" className="numeric sm:max-w-xs" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <p className="text-footnote text-text-secondary">{t("testHint")}</p>
          {failure && failure.error !== "phoneInvalid" ? <Problem failure={failure} /> : null}
          <Button type="submit" disabled={busy} className="self-start">
            {t("sendTest")}
          </Button>
        </form>
      )}
    </Section>
  );
}

/** Owner only: reminders on or off, lesson reminder hours, quiet hours, and the two services' status. */
export function NotificationsTab({ settings, integrations }: { settings: CentreSettings; integrations: Integrations }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<NotificationsInput, unknown, NotificationsValues>({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      reminders_enabled: settings.reminders_enabled,
      lesson_reminder_hours: settings.lesson_reminder_hours,
      quiet_from: settings.quiet_from,
      quiet_to: settings.quiet_to,
    },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      const result = await saveNotifications(values);
      if (!result.ok) setFailure(result);
      else toast(t("saved"));
    });
  });

  return (
    <div className="flex flex-col gap-6">
      {!integrations.serverReady ? (
        <p role="alert" className="max-w-xl rounded-control bg-warning-tint px-3 py-2 text-footnote text-warning">
          {t("notifications.serverNotReady")}
        </p>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <label htmlFor="reminders-enabled" className="flex flex-col gap-0.5">
            <span className="text-body font-medium text-text">{t("notifications.enabled")}</span>
            <span className="text-footnote text-text-secondary">{t("notifications.enabledHint")}</span>
          </label>
          <Controller
            control={control}
            name="reminders_enabled"
            render={({ field }) => <Switch id="reminders-enabled" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </div>
        <Field
          label={t("notifications.lessonHours")}
          htmlFor="lesson-hours"
          error={message(errors.lesson_reminder_hours?.message)}
          className="sm:max-w-xs"
        >
          <Input id="lesson-hours" type="number" min={1} max={48} inputMode="numeric" className="numeric" aria-invalid={errors.lesson_reminder_hours ? true : undefined} {...register("lesson_reminder_hours")} />
        </Field>
        <div className="grid gap-4 sm:max-w-sm sm:grid-cols-2">
          <Field label={t("notifications.quietFrom")} htmlFor="quiet-from" error={message(errors.quiet_from?.message)}>
            <Input id="quiet-from" type="time" className="numeric" {...register("quiet_from")} />
          </Field>
          <Field label={t("notifications.quietTo")} htmlFor="quiet-to" error={message(errors.quiet_to?.message)}>
            <Input id="quiet-to" type="time" className="numeric" {...register("quiet_to")} />
          </Field>
        </div>
        <p className="text-footnote text-text-secondary">{t("notifications.quietHint")}</p>
        <Problem failure={failure} />
        <Button type="submit" variant="primary" disabled={pending} className="self-start">
          {tCommon("save")}
        </Button>
      </form>

      <TelegramCard integrations={integrations} />
      <EskizCard integrations={integrations} />
    </div>
  );
}
