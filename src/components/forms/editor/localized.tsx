"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormLanguage, Localized } from "@/lib/forms/document";
import { cn } from "@/lib/utils";

const LanguageContext = createContext<FormLanguage>("uz");

/**
 * uz / ru / en tabs around a group of texts. A dot marks a language in which
 * one of the group's texts is still missing.
 */
export function LanguageTabs({
  languages,
  missing,
  children,
  initial,
}: {
  languages: readonly FormLanguage[];
  missing: readonly FormLanguage[];
  children: React.ReactNode;
  initial: FormLanguage;
}) {
  const t = useTranslations("forms");
  const [chosen, setChosen] = useState<FormLanguage>(initial);
  const language = languages.includes(chosen) ? chosen : languages[0];

  return (
    <LanguageContext.Provider value={language}>
      <div className="flex flex-col gap-3">
        {languages.length > 1 ? (
          <div role="tablist" aria-label={t("editor.textLanguage")} className="flex gap-1">
            {languages.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={code === language}
                onClick={() => setChosen(code)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-inner px-2.5 text-footnote font-medium uppercase outline-none motion-fast focus-visible:ring-3 focus-visible:ring-focus-ring",
                  code === language ? "bg-brand-tint text-brand-ink" : "text-text-secondary hover:bg-bg-subtle hover:text-text",
                )}
              >
                {code}
                {missing.includes(code) ? (
                  <span className="size-1.5 rounded-full bg-warning" data-missing={code}>
                    <span className="sr-only">{t("editor.missingTranslation")}</span>
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

/** One text of the form in the language of the surrounding tabs. */
export function LocalizedField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: Localized | undefined;
  onChange: (next: Localized) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const language = useContext(LanguageContext);
  const id = useId();
  const text = value?.[language] ?? "";
  const set = (next: string) => onChange({ ...value, [language]: next });
  const shared = { id, value: text, placeholder, lang: language, "data-language": language } as const;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea {...shared} rows={3} onChange={(event) => set(event.target.value)} />
      ) : (
        <Input {...shared} onChange={(event) => set(event.target.value)} />
      )}
    </div>
  );
}

export const useTabLanguage = () => useContext(LanguageContext);
