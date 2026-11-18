"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changeSlug } from "@/lib/forms/actions";
import { FORM_LANGUAGES, LANGUAGE_NAMES, isHttpUrl, type FormDocument, type FormLanguage } from "@/lib/forms/document";
import { useEditor } from "@/lib/forms/editor-store";
import { missingIn } from "@/lib/forms/fields";
import { embedSnippet, slugProblem } from "@/lib/forms/url";

import { AssetUpload } from "./asset-upload";
import { LanguageTabs, LocalizedField } from "./localized";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5 last:border-b-0">
      <div>
        <h3 className="text-headline text-text">{title}</h3>
        {hint ? <p className="mt-0.5 text-footnote text-text-secondary">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Settings: name, address, subject, source tag, languages, after submit, closed text, sharing, embed code. */
export function SettingsTab({ baseUrl }: { baseUrl: string | null }) {
  const t = useTranslations("forms");
  const id = useId();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  const setMeta = useEditor((state) => state.setMeta);
  const formId = useEditor((state) => state.id);
  const assets = useEditor((state) => state.assets);
  const language = useEditor((state) => state.previewLanguage);
  const { document } = draft;
  const setText = (key: keyof FormDocument["texts"]) => (value: FormDocument["texts"]["title"]) =>
    change((doc) => ({ ...doc, texts: { ...doc.texts, [key]: value } }), `texts.${key}`);
  const setShare = (patch: Partial<FormDocument["share"]>, key?: string) =>
    change((doc) => ({ ...doc, share: { ...doc.share, ...patch } }), key ? `share.${key}` : undefined);

  const toggleLanguage = (code: FormLanguage, on: boolean) =>
    change((doc) => {
      const languages = FORM_LANGUAGES.filter((item) => (item === code ? on : doc.languages.includes(item)));
      if (languages.length === 0) return doc;
      return { ...doc, languages, default_language: languages.includes(doc.default_language) ? doc.default_language : languages[0] };
    });

  const redirect = document.after_submit.mode === "redirect";
  const badUrl = redirect && document.after_submit.url !== "" && !isHttpUrl(document.after_submit.url);

  return (
    <div className="flex flex-col gap-5">
      <Section title={t("settings.general")}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-name`}>{t("settings.name")}</Label>
          <Input id={`${id}-name`} value={draft.name} maxLength={120} onChange={(event) => setMeta({ name: event.target.value }, "name")} />
        </div>
        <SlugField baseUrl={baseUrl} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-subject`}>{t("settings.subject")}</Label>
          <Input id={`${id}-subject`} value={draft.subject} maxLength={120} onChange={(event) => setMeta({ subject: event.target.value }, "subject")} />
          <p className="text-footnote text-text-secondary">{t("settings.subjectHint")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-tag`}>{t("settings.sourceTag")}</Label>
          <Input id={`${id}-tag`} value={draft.sourceTag} maxLength={60} onChange={(event) => setMeta({ sourceTag: event.target.value }, "sourceTag")} />
          <p className="text-footnote text-text-secondary">{t("settings.sourceTagHint")}</p>
        </div>
      </Section>

      <Section title={t("settings.languages")} hint={t("settings.languagesHint")}>
        <div className="flex flex-col gap-2">
          {FORM_LANGUAGES.map((code) => (
            <div key={code} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-lang-${code}`}
                checked={document.languages.includes(code)}
                disabled={document.languages.length === 1 && document.languages[0] === code}
                onCheckedChange={(on) => toggleLanguage(code, on === true)}
              />
              <Label htmlFor={`${id}-lang-${code}`}>{LANGUAGE_NAMES[code]}</Label>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-default`}>{t("settings.defaultLanguage")}</Label>
          <Select value={document.default_language} onValueChange={(value) => change((doc) => ({ ...doc, default_language: value as FormLanguage }))}>
            <SelectTrigger id={`${id}-default`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {document.languages.map((code) => (
                <SelectItem key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title={t("settings.afterSubmit")}>
        <SegmentedControl
          aria-label={t("settings.afterSubmit")}
          fullWidth
          value={document.after_submit.mode}
          onValueChange={(mode) => change((doc) => ({ ...doc, after_submit: { ...doc.after_submit, mode } }))}
          options={[
            { value: "message", label: t("settings.showMessage") },
            { value: "redirect", label: t("settings.redirect") },
          ]}
        />
        {redirect ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-url`}>{t("settings.redirectUrl")}</Label>
            <Input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={document.after_submit.url}
              aria-invalid={badUrl || undefined}
              onChange={(event) => change((doc) => ({ ...doc, after_submit: { ...doc.after_submit, url: event.target.value.trim() } }), "after_submit.url")}
            />
            {badUrl ? <p className="text-footnote text-danger">{t("settings.redirectInvalid")}</p> : null}
          </div>
        ) : (
          <LanguageTabs languages={document.languages} missing={missingIn([document.texts.thank_you_title], document.languages)} initial={language}>
            <LocalizedField label={t("settings.thankYouTitle")} value={document.texts.thank_you_title} onChange={setText("thank_you_title")} />
            <LocalizedField label={t("settings.thankYouText")} value={document.texts.thank_you_text} onChange={setText("thank_you_text")} multiline />
          </LanguageTabs>
        )}
      </Section>

      <Section title={t("settings.closed")} hint={t("settings.closedHint")}>
        <LanguageTabs languages={document.languages} missing={missingIn([document.texts.closed_text], document.languages)} initial={language}>
          <LocalizedField label={t("settings.closedText")} value={document.texts.closed_text} onChange={setText("closed_text")} multiline />
        </LanguageTabs>
      </Section>

      <Section title={t("settings.share")} hint={t("settings.shareHint")}>
        <LanguageTabs languages={document.languages} missing={[]} initial={language}>
          <LocalizedField label={t("settings.pageTitle")} value={document.share.page_title} onChange={(value) => setShare({ page_title: value }, "page_title")} />
          <LocalizedField label={t("settings.description")} value={document.share.description} onChange={(value) => setShare({ description: value }, "description")} multiline />
        </LanguageTabs>
        <AssetUpload
          formId={formId}
          kind="share"
          label={t("settings.shareImage")}
          asset={document.share.image_asset ? assets[document.share.image_asset] : undefined}
          onChange={(asset) => setShare({ image_asset: asset })}
        />
      </Section>

      <Section title={t("settings.embed")} hint={t("settings.embedHint")}>
        <EmbedCode baseUrl={baseUrl} />
      </Section>
    </div>
  );
}

/** The address is saved on its own, with its button: a live form's links break when it changes. */
function SlugField({ baseUrl }: { baseUrl: string | null }) {
  const t = useTranslations("forms");
  const id = useId();
  const formId = useEditor((state) => state.id);
  const slug = useEditor((state) => state.slug);
  const status = useEditor((state) => state.status);
  const setSlug = useEditor((state) => state.setSlug);
  const [typed, setTyped] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = typed !== slug;
  const problem = changed ? slugProblem(typed) : null;
  const message = problem ? t(problem === "reserved" ? "errors.slugReserved" : "errors.slugFormat") : error;

  const save = async () => {
    setBusy(true);
    const result = await changeSlug({ id: formId, slug: typed }).catch(() => ({ ok: false as const, error: "generic" as const }));
    setBusy(false);
    if (!result.ok) {
      setError(t(`errors.${result.error}`));
      return;
    }
    setSlug(result.data.slug);
    setError(null);
    toast.success(t("settings.addressSaved"));
  };

  return (
    <div className="flex flex-col gap-1.5" data-slug-field>
      <Label htmlFor={id}>{t("settings.address")}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={typed}
          maxLength={60}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={message ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setTyped(event.target.value.toLowerCase().replace(/\s+/g, "-"));
            setError(null);
          }}
        />
        <Button variant="secondary" disabled={!changed || Boolean(problem) || busy} onClick={save}>
          {t("settings.saveAddress")}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-footnote break-all text-text-secondary">
        {baseUrl ? `${baseUrl}/${typed}` : t("settings.addressHint")}
      </p>
      {message ? (
        <p role="alert" className="text-footnote text-danger">
          {message}
        </p>
      ) : null}
      {changed && !problem && status !== "draft" ? (
        <p role="status" className="flex items-start gap-1.5 text-footnote text-warning" data-slug-warning>
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("settings.addressWarning")}
        </p>
      ) : null}
    </div>
  );
}

function EmbedCode({ baseUrl }: { baseUrl: string | null }) {
  const t = useTranslations("forms");
  const slug = useEditor((state) => state.slug);
  const name = useEditor((state) => state.draft.name);
  const [copied, setCopied] = useState(false);
  if (!baseUrl) return <p className="text-footnote text-text-secondary">{t("settings.embedUnavailable")}</p>;
  const code = embedSnippet(baseUrl, slug, name);

  return (
    <div className="flex flex-col gap-2">
      <Textarea readOnly rows={6} value={code} aria-label={t("settings.embed")} className="font-mono text-footnote" onFocus={(event) => event.target.select()} />
      <Button
        variant="secondary"
        className="self-start"
        onClick={async () => {
          await navigator.clipboard.writeText(code).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("list.copied") : t("settings.copyCode")}
      </Button>
    </div>
  );
}
