"use client";

import { History as HistoryIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/i18n/routing";
import { formatDateTime } from "@/lib/format";
import { getFormVersions, type FormVersion } from "@/lib/forms/actions";
import { useEditor } from "@/lib/forms/editor-store";

/** Every publish, with who and when. Restore loads that version into the draft; it is not published until Publish is pressed. */
export function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("forms");
  const locale = useLocale() as Locale;
  const formId = useEditor((state) => state.id);
  const current = useEditor((state) => state.version);
  const change = useEditor((state) => state.change);
  const [versions, setVersions] = useState<FormVersion[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getFormVersions({ id: formId }).then((result) => {
      if (!cancelled) setVersions(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
      setVersions(null);
    };
  }, [open, formId, current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("history.title")}</DialogTitle>
          <DialogDescription>{t("history.hint")}</DialogDescription>
        </DialogHeader>
        {versions === null ? (
          <p className="text-body text-text-secondary">{t("history.loading")}</p>
        ) : versions.length === 0 ? (
          <p className="flex items-center gap-2 text-body text-text-secondary">
            <HistoryIcon className="size-4" aria-hidden />
            {t("history.empty")}
          </p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
            {versions.map((version) => (
              <li key={version.version} className="flex items-center justify-between gap-3 py-2.5" data-version={version.version}>
                <div className="min-w-0">
                  <p className="text-body font-medium text-text">
                    {t("history.version", { n: version.version })}
                    {version.version === current ? <span className="ml-2 text-footnote font-normal text-text-secondary">{t("history.live")}</span> : null}
                  </p>
                  <p className="truncate text-footnote text-text-secondary">
                    {version.publishedBy ? `${version.publishedBy} · ` : ""}
                    <time dateTime={version.publishedAt}>{formatDateTime(version.publishedAt, locale)}</time>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={!version.content}
                  onClick={() => {
                    const content = version.content;
                    if (!content) return;
                    change(() => content);
                    toast.success(t("history.restored", { n: version.version }));
                    onOpenChange(false);
                  }}
                >
                  {t("history.restore")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
