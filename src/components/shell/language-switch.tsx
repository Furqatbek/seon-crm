"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useSwitchLocale } from "./use-switch-locale";

/** Language switch for pages outside the app shell (sign-in). */
export function LanguageSwitch() {
  const t = useTranslations("language");
  const { locale, locales, switchLocale } = useSwitchLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={t("label")}>
          <Globe className="text-text-secondary" aria-hidden />
          {t(locale)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={switchLocale}>
          {locales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {t(code)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
