import { describe, expect, it } from "vitest";

import { isRealDay, monthInstants, paymentInstant, suggestedPayment } from "./payments";

describe("paymentInstant", () => {
  const now = new Date("2026-11-13T10:30:00Z"); // 15:30 in Tashkent

  it("a payment taken today is stamped now", () => {
    expect(paymentInstant("2026-11-13", now)).toBe("2026-11-13T10:30:00.000Z");
  });

  it("a payment entered for an earlier day is stamped at noon in Tashkent that day", () => {
    expect(paymentInstant("2026-11-10", now)).toBe("2026-11-10T07:00:00.000Z");
    expect(paymentInstant("2026-10-31", now)).toBe("2026-10-31T07:00:00.000Z");
  });

  it("a day in the future is refused", () => {
    expect(paymentInstant("2026-11-14", now)).toBeNull();
    expect(paymentInstant("2027-01-01", now)).toBeNull();
  });

  it("uses the Tashkent day, not the UTC day", () => {
    // 20:00 UTC on the 13th is already the 14th in Tashkent.
    const late = new Date("2026-11-13T20:00:00Z");
    expect(paymentInstant("2026-11-14", late)).toBe("2026-11-13T20:00:00.000Z");
    expect(paymentInstant("2026-11-13", late)).toBe("2026-11-13T07:00:00.000Z");
  });
});

describe("isRealDay", () => {
  it("accepts days on the calendar and refuses the rest", () => {
    expect(isRealDay("2026-11-13")).toBe(true);
    expect(isRealDay("2028-02-29")).toBe(true);
    expect(isRealDay("2026-02-29")).toBe(false);
    expect(isRealDay("2026-02-31")).toBe(false);
    expect(isRealDay("2026-13-01")).toBe(false);
    expect(isRealDay("2026-11-00")).toBe(false);
    expect(isRealDay("13.11.2026")).toBe(false);
    expect(isRealDay("")).toBe(false);
  });

  it("a day that is not on the calendar gives no payment instant", () => {
    const now = new Date("2026-11-13T10:30:00Z");
    expect(paymentInstant("2026-02-31", now)).toBeNull();
    expect(paymentInstant("not a date", now)).toBeNull();
  });
});

describe("suggestedPayment", () => {
  it("suggests the debt when the student has one group", () => {
    expect(suggestedPayment(-600_000, 1)).toBe(600_000);
  });

  it("suggests nothing when the debt may belong to more than one group", () => {
    expect(suggestedPayment(-1_100_000, 2)).toBeNull();
    expect(suggestedPayment(-1_100_000, 3)).toBeNull();
  });

  it("suggests nothing without a debt or without a group", () => {
    expect(suggestedPayment(0, 1)).toBeNull();
    expect(suggestedPayment(250_000, 1)).toBeNull();
    expect(suggestedPayment(-600_000, 0)).toBeNull();
  });
});

describe("monthInstants", () => {
  it("a Tashkent month starts and ends at 19:00 UTC the day before", () => {
    expect(monthInstants("2026-11")).toEqual({
      start: "2026-10-31T19:00:00.000Z",
      end: "2026-11-30T19:00:00.000Z",
    });
    expect(monthInstants("2026-12")).toEqual({
      start: "2026-11-30T19:00:00.000Z",
      end: "2026-12-31T19:00:00.000Z",
    });
  });
});
