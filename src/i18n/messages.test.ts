import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import uz from "../../messages/uz.json";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  );
}

function values(tree: Tree): string[] {
  return Object.values(tree).flatMap((value) =>
    typeof value === "string" ? [value] : values(value),
  );
}

describe("messages", () => {
  it("has the same keys in uz, ru and en", () => {
    expect(keys(uz).sort()).toEqual(keys(en).sort());
    expect(keys(ru).sort()).toEqual(keys(en).sort());
  });

  it("has no empty strings", () => {
    for (const tree of [uz, ru, en]) {
      expect(values(tree).filter((value) => value.trim() === "")).toEqual([]);
    }
  });

  it("writes Uzbek oʻ and gʻ with U+02BB, never an apostrophe or quote", () => {
    const wrong = values(uz).filter((value) => /[og]['’‘`]/i.test(value));
    expect(wrong).toEqual([]);
  });
});
