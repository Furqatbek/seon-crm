"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { darken } from "@/lib/forms/contrast";
import { FORM_FONTS, type FormDocument } from "@/lib/forms/document";
import { useEditor } from "@/lib/forms/editor-store";
import { FONT_FAMILY } from "@/lib/forms/fonts";
import { cn } from "@/lib/utils";

import { AssetUpload } from "./asset-upload";
import { ColourField } from "./colour-field";

type Design = FormDocument["design"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5 last:border-b-0">
      <h3 className="text-headline text-text">{title}</h3>
      {children}
    </section>
  );
}

/** Design: logo, background, colours, font, corners and layout. Every change shows at once. */
export function DesignTab() {
  const t = useTranslations("forms");
  const design = useEditor((state) => state.draft.document.design);
  const change = useEditor((state) => state.change);
  const formId = useEditor((state) => state.id);
  const assets = useEditor((state) => state.assets);
  const overlayId = useId();

  const set = (patch: Partial<Design>, key?: string) => change((doc) => ({ ...doc, design: { ...doc.design, ...patch } }), key ? `design.${key}` : undefined);
  const setColour = (name: keyof Design["colors"]) => (value: string) => set({ colors: { ...design.colors, [name]: value } }, `colors.${name}`);
  const backgroundImage = design.background.asset ? assets[design.background.asset] : undefined;
  // With a picture behind it the text's background is unknown; with a colour it is that colour.
  const pageBackground = backgroundImage ? null : darken(design.background.color, 0);

  return (
    <div className="flex flex-col gap-5">
      <Section title={t("design.logo")}>
        <AssetUpload
          formId={formId}
          kind="logo"
          label={t("design.logoFile")}
          asset={design.logo.asset ? assets[design.logo.asset] : undefined}
          onChange={(asset) => set({ logo: { ...design.logo, asset } })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-text-secondary">{t("design.logoPosition")}</span>
          <SegmentedControl
            aria-label={t("design.logoPosition")}
            fullWidth
            value={design.logo.position}
            onValueChange={(position) => set({ logo: { ...design.logo, position } })}
            options={[
              { value: "top", label: t("design.positionTop") },
              { value: "left", label: t("design.positionLeft") },
            ]}
          />
        </div>
      </Section>

      <Section title={t("design.background")}>
        <ColourField label={t("design.backgroundColour")} value={design.background.color} onChange={(color) => set({ background: { ...design.background, color } }, "background.color")} />
        <AssetUpload
          formId={formId}
          kind="background"
          label={t("design.backgroundImage")}
          asset={backgroundImage}
          onChange={(asset) => set({ background: { ...design.background, asset } })}
        />
        {backgroundImage ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={overlayId}>{t("design.overlay", { percent: design.background.overlay })}</Label>
            <input
              id={overlayId}
              type="range"
              min={0}
              max={80}
              step={5}
              value={design.background.overlay}
              onChange={(event) => set({ background: { ...design.background, overlay: Number(event.target.value) } }, "background.overlay")}
              className="w-full accent-brand"
            />
          </div>
        ) : null}
      </Section>

      <Section title={t("design.colours")}>
        <ColourField
          label={t("design.text")}
          value={design.colors.text}
          onChange={setColour("text")}
          against={pageBackground ? { text: design.colors.text, background: pageBackground } : undefined}
        />
        <ColourField label={t("design.card")} value={design.colors.card} onChange={setColour("card")} />
        <ColourField
          label={t("design.cardText")}
          value={design.colors.card_text}
          onChange={setColour("card_text")}
          against={{ text: design.colors.card_text, background: design.colors.card }}
        />
        <ColourField label={t("design.button")} value={design.colors.button} onChange={setColour("button")} />
        <ColourField
          label={t("design.buttonText")}
          value={design.colors.button_text}
          onChange={setColour("button_text")}
          against={{ text: design.colors.button_text, background: design.colors.button }}
        />
      </Section>

      <Section title={t("design.font")}>
        <div role="radiogroup" aria-label={t("design.font")} className="grid grid-cols-2 gap-2">
          {FORM_FONTS.map((font) => (
            <button
              key={font}
              type="button"
              role="radio"
              aria-checked={design.font === font}
              data-font={font}
              onClick={() => set({ font })}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left outline-none motion-fast focus-visible:ring-3 focus-visible:ring-focus-ring",
                design.font === font ? "border-brand bg-brand-tint" : "border-border hover:border-border-strong hover:bg-bg-subtle",
              )}
            >
              <span className="text-footnote text-text-secondary">{font}</span>
              {/* The sample is set in the font itself. */}
              <span className="text-headline text-text" style={{ fontFamily: FONT_FAMILY[font] }}>
                {t("design.fontSample")}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("design.shape")}>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-text-secondary">{t("design.corners")}</span>
          <SegmentedControl
            aria-label={t("design.corners")}
            fullWidth
            value={design.corners}
            onValueChange={(corners) => set({ corners })}
            options={[
              { value: "square", label: t("design.square") },
              { value: "rounded", label: t("design.rounded") },
              { value: "pill", label: t("design.pill") },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-text-secondary">{t("design.layout")}</span>
          <SegmentedControl
            aria-label={t("design.layout")}
            fullWidth
            value={design.layout}
            onValueChange={(layout) => set({ layout })}
            options={[
              { value: "card", label: t("design.layoutCard") },
              { value: "split", label: t("design.layoutSplit") },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
