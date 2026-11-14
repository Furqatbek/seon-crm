import { describe, expect, it } from "vitest";

import { smsLength } from "./sms-length";
import { toSmsText } from "./templates";

describe("smsLength", () => {
  it("plain Latin fits 160 characters in one SMS, then 153 per part", () => {
    expect(smsLength("")).toMatchObject({ encoding: "gsm", characters: 0, parts: 0 });
    expect(smsLength("a".repeat(160))).toMatchObject({ encoding: "gsm", characters: 160, parts: 1, single: 160 });
    expect(smsLength("a".repeat(161))).toMatchObject({ parts: 2 });
    expect(smsLength("a".repeat(306))).toMatchObject({ parts: 2 });
    expect(smsLength("a".repeat(307))).toMatchObject({ parts: 3 });
  });

  it("Cyrillic or ʻ switches to Unicode: 70 characters, then 67 per part", () => {
    expect(smsLength("Здравствуйте")).toMatchObject({ encoding: "unicode", characters: 12, parts: 1, single: 70 });
    expect(smsLength("я".repeat(70)).parts).toBe(1);
    expect(smsLength("я".repeat(71)).parts).toBe(2);
    expect(smsLength("я".repeat(134)).parts).toBe(2);
    expect(smsLength("я".repeat(135)).parts).toBe(3);
    // One ʻ in an otherwise Latin text is enough.
    const uzbek = "Assalomu alaykum! Toʻlov muddati keldi." + "a".repeat(60);
    expect(smsLength(uzbek)).toMatchObject({ encoding: "unicode", parts: 2, unicodeCharacters: ["ʻ"] });
    expect(smsLength(toSmsText(uzbek))).toMatchObject({ encoding: "gsm", parts: 1 });
  });

  it("counts the alphabet's extended characters twice", () => {
    expect(smsLength("{student}")).toMatchObject({ encoding: "gsm", characters: 11 });
    expect(smsLength("€")).toMatchObject({ encoding: "gsm", characters: 2 });
  });

  it("names each character that forced Unicode once", () => {
    expect(smsLength("“Oʻquv” – oʻqish").unicodeCharacters).toEqual(["“", "ʻ", "”", "–"]);
    // An emoji is two units long.
    expect(smsLength("ok 👍")).toMatchObject({ encoding: "unicode", characters: 5 });
  });

  it("the seeded uz payment text is one SMS in plain Latin", () => {
    const text = "Assalomu alaykum! Aziza Karimova uchun noyabr oyi to'lovi: 600 000 so'm. Iltimos, 5-noyabr gacha to'lang. Ziyo o'quv markazi";
    expect(smsLength(text)).toMatchObject({ encoding: "gsm", parts: 1 });
  });
});
