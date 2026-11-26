"use client";

import { ArrowLeft, Copy, ExternalLink, History as HistoryIcon, Lock, LockOpen, MoreHorizontal, Redo2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import { DEVICE_WIDTH, selectCanRedo, selectCanUndo, selectHasChanges, useEditor, type Device, type FormStatus } from "@/lib/forms/editor-store";

export const STATUS_TONE: Record<FormStatus, "neutral" | "success" | "warning"> = { draft: "neutral", live: "success", closed: "warning" };

export function TopBar({
  baseUrl,
  publishing,
  onPublish,
  onHistory,
  onToggleClosed,
  onDuplicate,
}: {
  baseUrl: string | null;
  publishing: boolean;
  onPublish: () => void;
  onHistory: () => void;
  onToggleClosed: () => void;
  onDuplicate: () => void;
}) {
  const t = useTranslations("forms");
  const name = useEditor((state) => state.draft.name);
  const setMeta = useEditor((state) => state.setMeta);
  const status = useEditor((state) => state.status);
  const slug = useEditor((state) => state.slug);
  const saveState = useEditor((state) => state.saveState);
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const hasChanges = useEditor(selectHasChanges);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const languages = useEditor((state) => state.draft.document.languages);
  const language = useEditor((state) => state.previewLanguage);
  const setLanguage = useEditor((state) => state.setPreviewLanguage);
  const device = useEditor((state) => state.device);
  const setDevice = useEditor((state) => state.setDevice);
  const [renaming, setRenaming] = useState(false);
  const published = status !== "draft";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg px-3" data-editor-top-bar>
      <Button asChild variant="ghost" size="icon">
        <Link href="/leads/forms" aria-label={t("editor.back")}>
          <ArrowLeft aria-hidden />
        </Link>
      </Button>

      {renaming ? (
        <Input
          autoFocus
          aria-label={t("settings.name")}
          value={name}
          maxLength={120}
          className="w-56"
          onChange={(event) => setMeta({ name: event.target.value }, "name")}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          title={t("editor.rename")}
          onClick={() => setRenaming(true)}
          className="max-w-56 truncate rounded-control px-2 py-1 text-headline text-text outline-none hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring"
          data-form-name
        >
          {name || t("editor.untitled")}
        </button>
      )}

      <StatusPill tone={STATUS_TONE[status]}>{t(`status.${status}`)}</StatusPill>
      <p role="status" className="min-w-16 text-footnote text-text-secondary" data-save-state={saveState}>
        {t(`editor.save.${saveState}`)}
      </p>

      <div className="flex items-center">
        <Button variant="ghost" size="icon" aria-label={t("editor.undo")} title={t("editor.undo")} disabled={!canUndo} onClick={undo}>
          <Undo2 aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t("editor.redo")} title={t("editor.redo")} disabled={!canRedo} onClick={redo}>
          <Redo2 aria-hidden />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {languages.length > 1 ? (
          <SegmentedControl
            aria-label={t("editor.previewLanguage")}
            value={language}
            onValueChange={setLanguage}
            options={languages.map((code) => ({ value: code, label: code.toUpperCase() }))}
            className="[&_button]:min-w-10"
          />
        ) : null}
        <SegmentedControl<Device>
          aria-label={t("editor.screenSize")}
          value={device}
          onValueChange={setDevice}
          options={(["phone", "tablet", "desktop"] as const).map((item) => ({
            value: item,
            label: t(`editor.device.${item}`, { width: DEVICE_WIDTH[item] }),
          }))}
        />

        {published && baseUrl ? (
          <Button asChild variant="ghost">
            <a href={`${baseUrl}/${slug}`} target="_blank" rel="noreferrer" data-open-live>
              <ExternalLink aria-hidden />
              {t("editor.openLive")}
            </a>
          </Button>
        ) : (
          <Button variant="ghost" disabled title={t(published ? "editor.noFormsHost" : "editor.notPublished")}>
            <ExternalLink aria-hidden />
            {t("editor.openLive")}
          </Button>
        )}

        <Button variant="primary" disabled={publishing || !hasChanges} onClick={onPublish} data-publish>
          {publishing ? t("editor.publishing") : published && hasChanges ? t("editor.publishChanges") : t("editor.publish")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("editor.more")}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onHistory}>
              <HistoryIcon aria-hidden />
              {t("history.title")}
            </DropdownMenuItem>
            {published ? (
              <DropdownMenuItem onSelect={onToggleClosed}>
                {status === "closed" ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
                {t(status === "closed" ? "editor.reopen" : "editor.close")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy aria-hidden />
              {t("list.duplicate")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
