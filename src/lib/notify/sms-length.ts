// How many SMS a text takes. A message in the basic GSM alphabet fits 160
// characters (153 per part when it is split); anything else — Cyrillic, ʻ,
// curly quotes — switches it to Unicode, which fits 70 (67 per part).

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** These are in the alphabet but take two characters each. */
const GSM_EXTENDED = "^{}\\[~]|€";

export type SmsLength = {
  encoding: "gsm" | "unicode";
  /** Characters as the network counts them. */
  characters: number;
  parts: number;
  /** Characters that fit in one message with this encoding. */
  single: number;
  /** The characters that forced Unicode, each once, in order of appearance. */
  unicodeCharacters: string[];
};

export function smsLength(text: string): SmsLength {
  let gsmUnits = 0;
  const outside: string[] = [];
  for (const character of text) {
    if (GSM_BASIC.includes(character)) gsmUnits += 1;
    else if (GSM_EXTENDED.includes(character)) gsmUnits += 2;
    else if (!outside.includes(character)) outside.push(character);
  }

  if (outside.length === 0) {
    return {
      encoding: "gsm",
      characters: gsmUnits,
      parts: gsmUnits === 0 ? 0 : gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153),
      single: 160,
      unicodeCharacters: [],
    };
  }
  // Unicode is counted in UTF-16 units, which is what a string's length is.
  const units = text.length;
  return {
    encoding: "unicode",
    characters: units,
    parts: units <= 70 ? 1 : Math.ceil(units / 67),
    single: 70,
    unicodeCharacters: outside,
  };
}
