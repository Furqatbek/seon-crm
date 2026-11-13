import { describe, expect, it } from "vitest";

import {
  canConvertLead,
  canMoveLead,
  isFollowUpDue,
  isLostReasonCode,
  nextContactTimestamp,
  normalizePhone,
  sanitizeSearch,
  tashkentDate,
  tashkentDayStart,
} from "./leads";

describe("normalizePhone", () => {
  it.each([
    ["+998901234567", "+998901234567"],
    ["+998 90 123 45 67", "+998901234567"],
    ["998901234567", "+998901234567"],
    ["90 123-45-67", "+998901234567"],
    ["(90) 1234567", "+998901234567"],
    ["  901234567 ", "+998901234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "12345", "+7 912 345 67 89", "90123456789", "phone", "90 123 45 6x", "+998 90 123 45"])(
    "rejects %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("canMoveLead", () => {
  it("moves freely between New, Contacted, Trial and Lost", () => {
    expect(canMoveLead("new", "contacted")).toBe(true);
    expect(canMoveLead("contacted", "trial")).toBe(true);
    expect(canMoveLead("trial", "lost")).toBe(true);
    expect(canMoveLead("lost", "new")).toBe(true);
    expect(canMoveLead("trial", "new")).toBe(true);
  });

  it("does not move to the same stage", () => {
    expect(canMoveLead("new", "new")).toBe(false);
  });

  it("never moves into Won by hand, and a won lead is read-only", () => {
    expect(canMoveLead("trial", "won")).toBe(false);
    expect(canMoveLead("won", "lost")).toBe(false);
    expect(canMoveLead("won", "new")).toBe(false);
  });
});

describe("canConvertLead", () => {
  it("is offered for open leads only", () => {
    expect(["new", "contacted", "trial", "won", "lost"].map((status) => canConvertLead(status as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("Tashkent days", () => {
  it("uses UTC+5 for the calendar day", () => {
    expect(tashkentDate("2026-11-13T18:59:59Z")).toBe("2026-11-13");
    expect(tashkentDate("2026-11-13T19:00:00Z")).toBe("2026-11-14");
    expect(tashkentDate(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });

  it("stores a picked day as 09:00 in Tashkent and reads the same day back", () => {
    expect(nextContactTimestamp("2026-11-20")).toBe("2026-11-20T09:00:00+05:00");
    expect(tashkentDate(nextContactTimestamp("2026-11-20"))).toBe("2026-11-20");
  });

  it("finds the start of a Tashkent day", () => {
    const now = new Date("2026-11-13T20:30:00Z"); // 01:30 on the 14th in Tashkent
    expect(tashkentDayStart(now)).toBe("2026-11-13T19:00:00.000Z");
    expect(tashkentDayStart(now, 1)).toBe("2026-11-14T19:00:00.000Z");
    expect(tashkentDayStart(now, -30)).toBe("2026-10-14T19:00:00.000Z");
  });
});

describe("isFollowUpDue", () => {
  const now = new Date("2026-11-13T06:00:00Z"); // 11:00 in Tashkent

  it("is due today or earlier", () => {
    expect(isFollowUpDue({ status: "new", next_contact_at: "2026-11-13T09:00:00+05:00" }, now)).toBe(true);
    expect(isFollowUpDue({ status: "trial", next_contact_at: "2026-11-01T09:00:00+05:00" }, now)).toBe(true);
    // Later today still counts: it is a date, not a time.
    expect(isFollowUpDue({ status: "contacted", next_contact_at: "2026-11-13T23:00:00+05:00" }, now)).toBe(true);
  });

  it("is not due tomorrow, without a date, or once the lead is closed", () => {
    expect(isFollowUpDue({ status: "new", next_contact_at: "2026-11-14T09:00:00+05:00" }, now)).toBe(false);
    expect(isFollowUpDue({ status: "new", next_contact_at: null }, now)).toBe(false);
    expect(isFollowUpDue({ status: "lost", next_contact_at: "2026-11-01T09:00:00+05:00" }, now)).toBe(false);
    expect(isFollowUpDue({ status: "won", next_contact_at: "2026-11-01T09:00:00+05:00" }, now)).toBe(false);
  });
});

describe("lost reasons and search", () => {
  it("tells a reason code from free text", () => {
    expect(isLostReasonCode("price")).toBe(true);
    expect(isLostReasonCode("Boshqa shaharga koʻchib ketdi")).toBe(false);
    expect(isLostReasonCode(null)).toBe(false);
  });

  it("strips characters that mean something in a filter", () => {
    expect(sanitizeSearch("  Aziza   Karimova ")).toBe("Aziza Karimova");
    expect(sanitizeSearch("a,b)or(id.eq.1")).toBe("a b or id.eq.1");
    expect(sanitizeSearch("100%_*")).toBe("100");
    expect(sanitizeSearch("Oʻg‘il")).toBe("Oʻg‘il");
  });
});
