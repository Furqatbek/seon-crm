// Contrast between a text colour and its background, as WCAG 2 defines it.
// docs/SPEC.md → "Lead forms add-on → Form builder → Design settings":
// a warning appears under any pair below 4.5:1.

/** The least contrast normal text needs (WCAG AA). */
export const MIN_CONTRAST = 4.5;

const HEX = /^#([0-9a-fA-F]{6})$/;

export function isHexColour(value: string): boolean {
  return HEX.test(value);
}

/** Relative luminance of "#RRGGBB": 0 for black, 1 for white. */
export function luminance(colour: string): number {
  const match = HEX.exec(colour);
  if (!match) throw new RangeError(`Not a #RRGGBB colour: ${colour}`);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = parseInt(match[1].slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** From 1 (the same colour) to 21 (black on white). The order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Whether text in one colour on the other is readable. Unfinished colours are not judged. */
export function hasEnoughContrast(text: string, background: string): boolean {
  if (!isHexColour(text) || !isHexColour(background)) return true;
  // Compared as shown: to two decimals, so 4.5 passes and 4.49 does not.
  return Math.round(contrastRatio(text, background) * 100) / 100 >= MIN_CONTRAST;
}

/** A colour seen through a black overlay of 0–100 %: what a darkened background becomes. */
export function darken(colour: string, overlayPercent: number): string {
  const match = HEX.exec(colour);
  if (!match) throw new RangeError(`Not a #RRGGBB colour: ${colour}`);
  const keep = 1 - Math.min(100, Math.max(0, overlayPercent)) / 100;
  return `#${[0, 2, 4]
    .map((at) => Math.round(parseInt(match[1].slice(at, at + 2), 16) * keep).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}
