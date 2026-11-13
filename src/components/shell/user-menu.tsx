"use client";

import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import type { CurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";

import { useSwitchLocale } from "./use-switch-locale";

export function UserMenu({ user }: { user: CurrentUser }) {
  const t = useTranslations("userMenu");
  const tLanguage = useTranslations("language");
  const { locale, locales, switchLocale } = useSwitchLocale({ remember: true });
  const [, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="user-menu"
        aria-label={t("label")}
        className="flex w-full items-center gap-3 rounded-control p-2 text-left outline-none motion-fast hover:bg-border focus-visible:ring-3 focus-visible:ring-focus-ring data-[state=open]:bg-border"
      >
        <Avatar name={user.fullName} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-medium text-text">{user.fullName}</span>
          <span className="truncate text-footnote text-text-secondary">
            {t(`roles.${user.role}`)}
          </span>
        </span>
        <ChevronsUpDown className="text-text-secondary" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tLanguage("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={switchLocale}>
          {locales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {tLanguage(code)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* Name, language and password: for everyone, also a manager who has no Settings in the sidebar. */}
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=profile">
            <UserRound aria-hidden />
            {t("profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => startTransition(() => signOut(locale))}>
          <LogOut aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
