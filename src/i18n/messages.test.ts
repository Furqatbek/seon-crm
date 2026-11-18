import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ko from "../../messages/ko.json";
import ru from "../../messages/ru.json";
import uz from "../../messages/uz.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

const MESSAGES = { en: flatten(en), ru: flatten(ru), uz: flatten(uz), ko: flatten(ko) };

/** The {arguments} a message takes, without the words inside plural branches. */
function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    if (message[i] === "{") {
      if (depth === 0) names.add(/^\{\s*(\w+)/.exec(message.slice(i))?.[1] ?? "");
      depth += 1;
    } else if (message[i] === "}") depth -= 1;
  }
  return [...names].sort();
}

describe("messages", () => {
  it("uz, ru, en and ko have exactly the same keys", () => {
    const keys = Object.keys(MESSAGES.en).sort();
    expect(Object.keys(MESSAGES.ru).sort()).toEqual(keys);
    expect(Object.keys(MESSAGES.uz).sort()).toEqual(keys);
    expect(Object.keys(MESSAGES.ko).sort()).toEqual(keys);
  });

  it("no message is empty", () => {
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      const empty = Object.entries(messages).filter(([, value]) => value.trim() === "").map(([key]) => key);
      expect(empty, locale).toEqual([]);
    }
  });

  it("every message takes the same arguments in every language", () => {
    const different = Object.keys(MESSAGES.en).filter((key) => {
      const expected = argumentsOf(MESSAGES.en[key]).join();
      return (["ru", "uz", "ko"] as const).some((locale) => argumentsOf(MESSAGES[locale][key] ?? "").join() !== expected);
    });
    expect(different).toEqual([]);
  });

  it("Uzbek is Latin: ʻ (U+02BB) in oʻ and gʻ, ʼ (U+02BC) for the glottal stop, never a straight or curly apostrophe", () => {
    const wrong = Object.entries(MESSAGES.uz)
      .filter(
        ([, value]) =>
          /[A-Za-z]['’‘`][A-Za-z]/.test(value) || /[\u0400-\u04FF]/.test(value) || /[oOgG]\u02BC/.test(value),
      )
      // The language's own name for Russian is written in Cyrillic.
      .filter(([key]) => key !== "language.ru")
      .map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it("Korean is written in Korean: every text has Hangul unless it is a name, a unit or only placeholders", () => {
    const untranslated = Object.entries(MESSAGES.ko)
      .filter(([key, value]) => !/[\uAC00-\uD7A3]/.test(value) && value === MESSAGES.en[key] && /[A-Za-z]{4,}/.test(value.replace(/\{[^}]*\}/g, "")))
      .map(([key]) => key)
      // Names that are the same everywhere.
      .filter((key) => !/^(app\.name|language\.|dev\.)|telegram|instagram|eskiz|\.sms$/i.test(key));
    expect(untranslated).toEqual([]);
  });
});
