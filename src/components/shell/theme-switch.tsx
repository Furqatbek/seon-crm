"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEMES, type Theme } from "@/lib/theme/theme";
import { useTheme } from "@/lib/theme/use-theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** System / Light / Dark, as radio items inside a menu. */
export function ThemeRadioGroup() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
      {THEMES.map((value) => (
        <DropdownMenuRadioItem key={value} value={value} data-theme-option={value}>
          {t(value)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** Theme switch for pages outside the app shell (sign-in). */
export function ThemeSwitch() {
  const t = useTranslations("theme");
  const { theme } = useTheme();
  const Icon = ICONS[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")} title={t("label")} data-slot="theme-switch">
          <Icon className="text-text-secondary" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioGroup />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
