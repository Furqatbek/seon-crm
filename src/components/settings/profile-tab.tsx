"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { useSwitchLocale } from "@/components/shell/use-switch-locale";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { changePassword, saveAlertSettings, saveProfile, unlinkTelegram } from "@/lib/settings/actions";
import type { AlertSettings, Profile } from "@/lib/settings/queries";
import type { ResetPasswordValues } from "@/lib/validation/auth";
import {
  UI_LANGUAGES,
  passwordSchema,
  profileSchema,
  type ProfileInput,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem, Section } from "./parts";

type Failure = Extract<SettingsResult, { ok: false }>;

function PasswordForm() {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "", confirm: "" } });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      const result = await changePassword(values);
      if (!result.ok) return setFailure(result);
      reset();
      toast(t("profile.passwordSaved"));
    });
  });

  return (
    <Section title={t("profile.password")}>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t("profile.newPassword")} htmlFor="profile-password" error={message(errors.password?.message)}>
          <Input id="profile-password" type="password" autoComplete="new-password" aria-invalid={errors.password ? true : undefined} {...register("password")} />
        </Field>
        <Field label={t("profile.confirmPassword")} htmlFor="profile-confirm" error={message(errors.confirm?.message)}>
          <Input id="profile-confirm" type="password" autoComplete="new-password" aria-invalid={errors.confirm ? true : undefined} {...register("confirm")} />
        </Field>
        <Problem failure={failure} />
        <Button type="submit" disabled={pending} className="self-start">
          {t("profile.savePassword")}
        </Button>
      </form>
    </Section>
  );
}

/** Lead alerts, for the owner and managers: their own Telegram link and two switches. */
function LeadAlerts({ alerts }: { alerts: AlertSettings }) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [alertsOn, setAlertsOn] = useState(alerts.alertsOn);
  const [sound, setSound] = useState(alerts.alertSound);

  const save = (patch: { alerts_on?: boolean; alert_sound?: boolean }, undo: () => void) =>
    startTransition(async () => {
      const result = await saveAlertSettings(patch);
      if (!result.ok) {
        undo();
        toast(t(`errors.${result.error}`));
      }
    });
  const unlink = () =>
    startTransition(async () => {
      const result = await unlinkTelegram();
      toast(result.ok ? t("alerts.unlinked") : t(`errors.${result.error}`));
    });

  return (
    <Section title={t("alerts.title")}>
      <p className="text-footnote text-text-secondary">{t("alerts.about")}</p>
      <div className="flex flex-col gap-2" data-telegram-linked={alerts.linked}>
        <p className="text-body text-text">{t(alerts.linked ? "alerts.linked" : "alerts.notLinked")}</p>
        <div className="flex flex-wrap gap-2">
          {alerts.linkUrl ? (
            <Button asChild variant={alerts.linked ? "secondary" : "primary"}>
              <a href={alerts.linkUrl} target="_blank" rel="noreferrer" data-telegram-link>
                <Send aria-hidden />
                {t(alerts.linked ? "alerts.linkAgain" : "alerts.link")}
              </a>
            </Button>
          ) : (
            <p className="text-footnote text-text-secondary">{t("alerts.noBot")}</p>
          )}
          {alerts.linked ? (
            <Button variant="ghost" disabled={pending} onClick={unlink}>
              {t("alerts.unlink")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="alerts-on">{t("alerts.telegram")}</Label>
          <p className="text-footnote text-text-secondary">{t("alerts.telegramHint")}</p>
        </div>
        <Switch
          id="alerts-on"
          checked={alertsOn}
          disabled={pending}
          onCheckedChange={(on) => {
            setAlertsOn(on);
            save({ alerts_on: on }, () => setAlertsOn(!on));
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="alert-sound">{t("alerts.sound")}</Label>
          <p className="text-footnote text-text-secondary">{t("alerts.soundHint")}</p>
        </div>
        <Switch
          id="alert-sound"
          checked={sound}
          disabled={pending}
          onCheckedChange={(on) => {
            setSound(on);
            save({ alert_sound: on }, () => setSound(!on));
          }}
        />
      </div>
    </Section>
  );
}

/** Everyone, for themselves: name, interface language, password; and for the owner and managers, lead alerts. */
export function ProfileTab({ profile, alerts }: { profile: Profile; alerts: AlertSettings | null }) {
  const t = useTranslations("settings");
  const tLanguage = useTranslations("language");
  const tCommon = useTranslations("common");
  const { switchLocale } = useSwitchLocale();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile.fullName, language: profile.language },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      const result = await saveProfile(values);
      if (!result.ok) return setFailure(result);
      toast(t("saved"));
      // The language is saved on the profile; the screen follows it.
      switchLocale(values.language);
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
        <Field label={t("profile.email")} htmlFor="profile-email">
          <Input id="profile-email" value={profile.email} readOnly disabled />
        </Field>
        <Field label={t("profile.name")} htmlFor="profile-name" error={message(errors.full_name?.message)}>
          <Input id="profile-name" autoComplete="name" aria-invalid={errors.full_name ? true : undefined} {...register("full_name")} />
        </Field>
        <Field label={t("profile.language")} htmlFor="profile-language" className="sm:max-w-xs">
          <Controller
            control={control}
            name="language"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="profile-language">
                  <SelectValue>{tLanguage(field.value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UI_LANGUAGES.map((code) => (
                    <SelectItem key={code} value={code} lang={code}>
                      {tLanguage(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Problem failure={failure} />
        <Button type="submit" variant="primary" disabled={pending} className="self-start">
          {tCommon("save")}
        </Button>
      </form>
      <PasswordForm />
      {alerts ? <LeadAlerts alerts={alerts} /> : null}
    </div>
  );
}
