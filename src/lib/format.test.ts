import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDay,
  formatMoney,
  formatMonth,
  formatPhone,
} from "./format";

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

describe("formatDate", () => {
  const instant = "2026-11-10T04:00:00Z"; // 09:00 in Tashkent

  it("writes the day in each language", () => {
    expect(formatDate(instant, "en")).toBe("Nov 10");
    expect(formatDate(instant, "ru")).toBe("10 нояб.");
    expect(formatDate(instant, "uz")).toBe("10-noy");
  });

  it("adds the year and long month names when asked", () => {
    expect(formatDate(instant, "en", { year: true })).toBe("Nov 10, 2026");
    expect(formatDate(instant, "ru", { year: true, month: "long" })).toBe("10 ноября 2026");
    expect(formatDate(instant, "uz", { month: "long" })).toBe("10-noyabr");
  });

  it("uses the Tashkent day, not the UTC day", () => {
    expect(formatDate("2026-12-31T19:30:00Z", "en", { year: true })).toBe("Jan 1, 2027");
    expect(formatDate(new Date("2026-03-08T18:59:00Z"), "uz")).toBe("8-mar");
  });

  it("formats a day with a 24-hour time", () => {
    expect(formatDateTime("2026-11-13T10:09:00Z", "en")).toBe("Nov 13, 15:09");
    expect(formatDateTime("2026-11-13T19:05:00Z", "uz")).toBe("14-noy, 00:05");
  });

  it("formats a date column", () => {
    expect(formatDay("2026-11-20", "ru", { month: "long" })).toBe("20 ноября");
    expect(formatDay("2026-01-01", "en")).toBe("Jan 1");
  });
});

describe("formatMonth", () => {
  it("names a billing month", () => {
    expect(formatMonth("2026-11-01", "en")).toBe("November 2026");
    expect(formatMonth("2026-11-01", "ru")).toBe("ноябрь 2026");
    expect(formatMonth("2026-11", "uz")).toBe("noyabr 2026");
    expect(formatMonth("2027-01-01", "ru")).toBe("январь 2027");
  });
});
