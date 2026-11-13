import { describe, expect, it } from "vitest";
import { formatMoney, formatPhone } from "./format";

describe("formatMoney", () => {
  it("formats Uzbek with spaces and soʻm (U+02BB)", () => {
    expect(formatMoney(1_250_000, "uz")).toBe("1 250 000 soʻm");
    expect(formatMoney(1_250_000, "uz")).toContain("ʻ");
  });

  it("formats Russian with spaces and сум", () => {
    expect(formatMoney(1_250_000, "ru")).toBe("1 250 000 сум");
  });

  it("formats English with UZS and commas", () => {
    expect(formatMoney(1_250_000, "en")).toBe("UZS 1,250,000");
  });

  it("accepts bigint beyond the safe integer range", () => {
    expect(formatMoney(BigInt("9007199254740993000"), "en")).toBe(
      "UZS 9,007,199,254,740,993,000",
    );
  });

  it("does not group amounts under 1,000 and handles zero", () => {
    expect(formatMoney(0, "uz")).toBe("0 soʻm");
    expect(formatMoney(999, "ru")).toBe("999 сум");
    expect(formatMoney(1000, "en")).toBe("UZS 1,000");
  });

  it("shows debt with a minus sign in front", () => {
    expect(formatMoney(-350_000, "uz")).toBe("−350 000 soʻm");
    expect(formatMoney(BigInt(-350_000), "ru")).toBe("−350 000 сум");
    expect(formatMoney(-350_000, "en")).toBe("−UZS 350,000");
  });

  it("refuses floats", () => {
    expect(() => formatMoney(1250.5, "uz")).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN, "uz")).toThrow(RangeError);
  });
});

describe("formatPhone", () => {
  it("formats a stored Uzbek number", () => {
    expect(formatPhone("+998901234567")).toBe("+998 90 123 45 67");
  });

  it("is stable on an already formatted number", () => {
    expect(formatPhone("+998 90 123 45 67")).toBe("+998 90 123 45 67");
  });

  it("returns anything else unchanged", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("901234567")).toBe("901234567");
    expect(formatPhone("+7 912 345 67 89")).toBe("+7 912 345 67 89");
  });
});
