"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { FORM_CSS } from "@/components/forms/form-css";
import { FormRenderer, fieldName, type FormRendererState, type FormUiTexts } from "@/components/forms/form-renderer";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEVICE_HEIGHT, DEVICE_WIDTH, useEditor } from "@/lib/forms/editor-store";
import { FONT_FAMILY } from "@/lib/forms/fonts";
import { checkAnswers, isAnswered } from "@/lib/intake/validator";

/** Space kept around the frame on the canvas. */
const MARGIN = 32;

/**
 * The real form on a light grey canvas, in a frame of the chosen width. It
 * renders the draft in memory with the same FormRenderer visitors get. It can
 * be typed into and sent: the answers are checked and nothing is saved.
 */
export function FormPreview({ uiTexts }: { uiTexts: Record<"uz" | "ru" | "en", FormUiTexts> }) {
  const t = useTranslations("forms");
  const document = useEditor((state) => state.draft.document);
  const assets = useEditor((state) => state.assets);
  const language = useEditor((state) => state.previewLanguage);
  const device = useEditor((state) => state.device);
  const showThanks = useEditor((state) => state.showThanks);
  const setShowThanks = useEditor((state) => state.setShowThanks);
  const setLanguage = useEditor((state) => state.setPreviewLanguage);

  // What was typed into the preview and found wrong, until the next try.
  const [checked, setChecked] = useState<Extract<FormRendererState, { kind: "form" }>>({ kind: "form" });
  const state: FormRendererState = showThanks ? { kind: "thanks" } : checked;

  const canvas = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = DEVICE_WIDTH[device];
  const scale = room ? Math.min(1, Math.max(0.2, (room.width - MARGIN * 2) / width)) : 1;
  // The frame is as tall as the device, or as the canvas allows when that is more.
  const height = Math.max(DEVICE_HEIGHT[device], room ? Math.floor((room.height - MARGIN * 2 - 40) / scale) : 0);
  const percent = Math.round(scale * 100);

  const frameStyle = useMemo(
    () => ({ width, height, transform: `scale(${scale})`, transformOrigin: "top left", "--lf-min-h": `${height}px` }) as React.CSSProperties,
    [width, height, scale],
  );

  return (
    <section aria-label={t("preview.title")} className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-subtle">
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 px-6">
        <p className="text-footnote text-text-secondary tabular-nums" data-preview-scale>
          {t("preview.size", { width, percent })}
        </p>
        <div className="flex items-center gap-2">
          <Switch
            id="preview-thanks"
            checked={showThanks}
            onCheckedChange={(on) => {
              setShowThanks(on);
              if (!on) setChecked({ kind: "form" });
            }}
          />
          <Label htmlFor="preview-thanks">{t("preview.showThanks")}</Label>
        </div>
      </div>

      <div ref={canvas} className="min-h-0 flex-1 overflow-hidden px-8 pb-8">
        <style>{FORM_CSS}</style>
        {room ? (
          <div className="mx-auto" style={{ width: width * scale, height: height * scale }}>
            <div
              data-preview-frame={device}
              className="overflow-x-hidden overflow-y-auto rounded-card border border-border-strong bg-bg shadow-float"
              style={frameStyle}
              // The form's own submit and language links are handled here: nothing leaves the editor.
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.target as HTMLFormElement);
                const values: Record<string, string | string[]> = {};
                for (const field of document.fields) {
                  if (!isAnswered(field)) continue;
                  const sent = data.getAll(fieldName(field.id)).filter((value): value is string => typeof value === "string");
                  if (field.type === "multiple_choice") values[field.id] = sent;
                  else if (sent.length > 0) values[field.id] = sent[0];
                }
                const result = checkAnswers(document, values);
                if (result.ok) setShowThanks(true);
                else setChecked({ kind: "form", values, errors: result.errors });
              }}
              onClickCapture={(event) => {
                const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(".lf-langs a");
                if (!link) return;
                event.preventDefault();
                const code = link.lang;
                if (code === "uz" || code === "ru" || code === "en") setLanguage(code);
              }}
            >
              <FormRenderer
                document={document}
                language={language}
                assets={assets}
                ui={uiTexts[language]}
                state={state}
                action=""
                token=""
                languageHref={() => "#"}
                fontFamilies={FONT_FAMILY}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
