import type { PointPreset } from "@/lib/points/queries";

/** A preset's label in the interface language. */
export function presetLabel(preset: Pick<PointPreset, "label_uz" | "label_ru" | "label_en">, locale: string): string {
  return locale === "ru" ? preset.label_ru : locale === "en" ? preset.label_en : preset.label_uz;
}
