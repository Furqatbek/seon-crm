"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { SignedInUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { BLOCKS, SETTINGS_BLOCK, TEACHER_BLOCKS, type Block } from "./blocks";
import { UserMenu } from "./user-menu";

function NavLink({
  block,
  active,
  onNavigate,
}: {
  block: Block;
  active: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const Icon = block.icon;
  return (
    <Link
      href={block.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-control items-center gap-3 rounded-control px-3 text-body outline-none motion-fast pointer-coarse:h-control-touch focus-visible:ring-3 focus-visible:ring-focus-ring",
        active
          ? "bg-purple-tint font-medium text-purple"
          : "text-text hover:bg-border [&>svg]:text-text-secondary",
      )}
    >
      <Icon aria-hidden />
      <span className="truncate">{t(block.key)}</span>
    </Link>
  );
}

function SidebarContent({
  user,
  centreName,
  onNavigate,
}: {
  user: SignedInUser;
  centreName: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const isActive = (block: Block) =>
    pathname === block.href || pathname.startsWith(`${block.href}/`);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-5">
        <span className="truncate text-headline text-text" data-slot="centre-name">
          {centreName}
        </span>
      </div>
      <nav
        aria-label={t("nav.label")}
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2"
      >
        {(user.role === "teacher" ? TEACHER_BLOCKS : BLOCKS).map((block) => (
          <NavLink
            key={block.key}
            block={block}
            active={isActive(block)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-2">
        {user.role === "owner" ? (
          <NavLink
            block={SETTINGS_BLOCK}
            active={isActive(SETTINGS_BLOCK)}
            onNavigate={onNavigate}
          />
        ) : null}
        <UserMenu user={user} />
      </div>
    </div>
  );
}

const TEACHER_HOME = ["/my-groups", "/settings"];

/**
 * Frosted 240 px sidebar on the left; below 900 px it becomes a slide-over
 * opened from a menu button.
 */
export function AppShell({
  user,
  centreName,
  children,
}: {
  user: SignedInUser;
  /** From Settings → Centre. */
  centreName: string;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // A teacher has their groups and their profile. Any other address shows
  // them nothing (the pages and the database both refuse), so take them home.
  const lost =
    user.role === "teacher" && !TEACHER_HOME.some((home) => pathname === home || pathname.startsWith(`${home}/`));
  useEffect(() => {
    if (lost) router.replace("/my-groups");
  }, [lost, router]);

  return (
    <div className="min-h-dvh bg-bg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar border-r border-border bg-bg-subtle/80 backdrop-blur-frost shell:block">
        <SidebarContent user={user} centreName={centreName} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg-subtle/80 px-2 backdrop-blur-frost shell:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("nav.openMenu")}
          onClick={() => setMenuOpen(true)}
        >
          <Menu aria-hidden />
        </Button>
        <span className="truncate text-headline text-text">{centreName}</span>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          aria-describedby={undefined}
          className="bg-bg-subtle shell:hidden"
        >
          <SheetTitle className="sr-only">{t("nav.label")}</SheetTitle>
          <SheetDescription className="sr-only">{centreName}</SheetDescription>
          <SidebarContent user={user} centreName={centreName} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="shell:pl-sidebar">
        <div className="mx-auto max-w-content p-4 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
