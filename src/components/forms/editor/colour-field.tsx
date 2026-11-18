"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contrastRatio, hasEnoughContrast, isHexColour } from "@/lib/forms/contrast";
import { cn } from "@/lib/utils";

/**
 * Colours offered as swatches. They are the form's own palette (data a form
 * stores), not interface colours: the first is the brand colour.
 */
export const SWATCHES = ["#F7941D", "#1D1D1F", "#FFFFFF", "#F5F5F7", "#FFF4E5", "#0A7A3E", "#1F5FBF", "#B3261E"] as const;

/** A hex input with a system colour picker and swatches. */
export function ColourField({
  label,
  value,
  onChange,
  against,
}: {
  label: string;
  value: string;
  onChange: (colour: string) => void;
  /** The colour this one is read on (or that is read on it): a warning shows when the pair is below 4.5:1. */
  against?: { text: string; background: string };
}) {
  const t = useTranslations("forms");
  const id = useId();
  // What is being typed, until it is a whole colour.
  const [typing, setTyping] = useState<string | null>(null);
  const commit = (text: string) => {
    const colour = text.startsWith("#") ? text : `#${text}`;
    if (isHexColour(colour)) {
      setTyping(null);
      onChange(colour.toUpperCase());
    } else {
      setTyping(text);
    }
  };
  const low = against && !hasEnoughContrast(against.text, against.background);

  return (
    <div className="flex flex-col gap-1.5" data-colour={label}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t("design.pickColour", { name: label })}
          value={value}
          onChange={(event) => commit(event.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-control border border-border-strong bg-bg p-0.5"
        />
        <Input
          id={id}
          value={typing ?? value}
          onChange={(event) => commit(event.target.value.trim())}
          onBlur={() => setTyping(null)}
          maxLength={7}
          spellCheck={false}
          aria-invalid={typing !== null || undefined}
          className="w-28 font-mono uppercase"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("design.swatches", { name: label })}>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              title={swatch}
              aria-label={swatch}
              aria-pressed={swatch === value}
              onClick={() => commit(swatch)}
              style={{ backgroundColor: swatch }}
              className={cn(
                "size-5 rounded-full border border-border-strong outline-none focus-visible:ring-3 focus-visible:ring-focus-ring",
                swatch === value && "ring-2 ring-brand ring-offset-1 ring-offset-bg",
              )}
            />
          ))}
        </div>
      </div>
      {low && against ? (
        <p role="status" className="flex items-start gap-1.5 text-footnote text-warning" data-contrast-warning>
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("design.lowContrast", { ratio: contrastRatio(against.text, against.background).toFixed(1) })}
        </p>
      ) : null}
    </div>
  );
}
