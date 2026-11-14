"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Template } from "@/lib/notify/reminders";
import { smsLength } from "@/lib/notify/sms-length";
import {
  PLACEHOLDERS,
  amountValue,
  dateValue,
  forChannel,
  monthValue,
  renderTemplate,
  type Placeholder,
} from "@/lib/notify/templates";
import { saveTemplate } from "@/lib/settings/actions";
import {
  MESSAGE_CHANNELS,
  MESSAGE_TYPES,
  TEMPLATE_LANGUAGES,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem } from "./parts";

type Key = Pick<Template, "type" | "channel" | "language">;
type Failure = Extract<SettingsResult, { ok: false }>;

/** Example values for the preview, in the template's language. */
function sample(language: Template["language"], centreName: string, today: string): Record<Placeholder, string> {
  return {
    student: "Aziza Karimova",
    group: "English B1",
    month: monthValue(today, language),
    amount: amountValue(600_000),
    due_date: dateValue(`${today.slice(0, 7)}-05`, language),
    time: "18:00",
    centre: centreName,
  };
}

function Editor({
  template,
  centreName,
  today,
}: {
  template: Key & { body: string };
  centreName: string;
  today: string;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [body, setBody] = useState(template.body);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);

  // What is sent: placeholders filled in, and for an SMS the plain-Latin form.
  const preview = forChannel(renderTemplate(body, sample(template.language, centreName, today)), template.channel);
  const sms = template.channel === "sms" ? smsLength(preview) : null;
  const unknown = [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].filter(
    (name) => !(PLACEHOLDERS as readonly string[]).includes(name),
  );

  function insert(placeholder: Placeholder) {
    const area = field.current;
    const token = `{${placeholder}}`;
    const start = area?.selectionStart ?? body.length;
    const end = area?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    // Put the cursor after what was inserted, once the new text is in the field.
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save() {
    setFailure(null);
    startTransition(async () => {
      const result = await saveTemplate({ ...template, body });
      if (!result.ok) setFailure(result);
      else toast(t("saved"));
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label={t("templates.text")} htmlFor="template-body">
          <Textarea
            id="template-body"
            ref={field}
            rows={7}
            maxLength={1000}
            lang={template.language}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote text-text-secondary">{t("templates.placeholders")}</span>
          <div className="flex flex-wrap gap-1.5" data-slot="placeholder-chips">
            {PLACEHOLDERS.map((placeholder) => (
              <button
                key={placeholder}
                type="button"
                title={t(`templates.placeholder.${placeholder}`)}
                aria-label={t("templates.insert", { placeholder: t(`templates.placeholder.${placeholder}`) })}
                onClick={() => insert(placeholder)}
                className="rounded-full border border-border-strong bg-bg px-2.5 py-1 text-caption text-text outline-none motion-fast hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring"
              >
                {`{${placeholder}}`}
              </button>
            ))}
          </div>
        </div>
        {unknown.length > 0 ? (
          <p className="text-footnote text-warning">
            {t("templates.unknown", { names: unknown.map((name) => `{${name}}`).join(", ") })}
          </p>
        ) : null}
        <Problem failure={failure} />
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={pending || body.trim() === "" || body === template.body}>
            {tCommon("save")}
          </Button>
          {body !== template.body ? <span className="text-footnote text-text-secondary">{t("templates.unsaved")}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-footnote text-text-secondary">{t("templates.preview")}</span>
        <p
          lang={template.language}
          data-slot="template-preview"
          className="min-h-20 rounded-card border border-border bg-bg-subtle p-4 text-body break-words whitespace-pre-wrap text-text"
        >
          {preview}
        </p>
        <p className="text-footnote text-text-secondary numeric" data-slot="template-count">
          {t("templates.characters", { count: sms ? sms.characters : [...preview].length })}
          {sms ? ` · ${t("templates.smsParts", { count: sms.parts })}` : null}
        </p>
        {sms ? (
          <p className={`text-footnote ${sms.encoding === "unicode" ? "text-warning" : "text-text-secondary"}`} data-sms-encoding={sms.encoding}>
            {sms.encoding === "gsm"
              ? t("templates.smsGsm")
              : t("templates.smsUnicode", { characters: sms.unicodeCharacters.slice(0, 6).join(" ") })}
          </p>
        ) : null}
        {sms ? <p className="text-footnote text-text-secondary">{t("templates.smsConverted")}</p> : null}
      </div>
    </div>
  );
}

/** Owner only: one editor per message type, channel and language. */
export function TemplatesTab({ templates, centreName, today }: { templates: Template[]; centreName: string; today: string }) {
  const t = useTranslations("settings");
  const tMessages = useTranslations("students.messages");
  const tLanguage = useTranslations("language");
  const [key, setKey] = useState<Key>({ type: "payment_due", channel: "telegram", language: "uz" });
  const current = templates.find(
    (template) => template.type === key.type && template.channel === key.channel && template.language === key.language,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
        <Field label={t("templates.type")} htmlFor="template-type">
          <Select value={key.type} onValueChange={(type) => setKey({ ...key, type: type as Key["type"] })}>
            <SelectTrigger id="template-type">
              <SelectValue>{tMessages(`types.${key.type}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {tMessages(`types.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("templates.channel")} htmlFor="template-channel">
          <Select value={key.channel} onValueChange={(channel) => setKey({ ...key, channel: channel as Key["channel"] })}>
            <SelectTrigger id="template-channel">
              <SelectValue>{tMessages(`channels.${key.channel}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {tMessages(`channels.${channel}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("templates.language")} htmlFor="template-language">
          <Select value={key.language} onValueChange={(language) => setKey({ ...key, language: language as Key["language"] })}>
            <SelectTrigger id="template-language">
              <SelectValue>{tLanguage(key.language)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_LANGUAGES.map((language) => (
                <SelectItem key={language} value={language}>
                  {tLanguage(language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {/* A new editor for every template, and after a save: it starts from the stored text. */}
      <Editor
        key={`${key.type}-${key.channel}-${key.language}-${current?.body ?? ""}`}
        template={{ ...key, body: current?.body ?? "" }}
        centreName={centreName}
        today={today}
      />
    </div>
  );
}
