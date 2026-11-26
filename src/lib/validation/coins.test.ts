import { describe, expect, it } from "vitest";

import { giveCoinsSchema, signedAmount, staffCoinsSchema } from "./coins";

const ids = { group_id: "00000003-0000-4000-8000-000000000001", student_id: "00000004-0000-4000-8000-000000000001" };
const issue = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error!.issues[0].message;

describe("a teacher gives coins", () => {
  it("1 to 10 whole coins, with or without a reason", () => {
    expect(giveCoinsSchema.parse({ ...ids, amount: "5", reason: "  " })).toEqual({ ...ids, amount: 5, reason: null });
    expect(giveCoinsSchema.parse({ ...ids, amount: 10, reason: " Homework " }).reason).toBe("Homework");
    expect(giveCoinsSchema.safeParse({ ...ids, amount: 1, reason: "" }).success).toBe(true);
  });

  it("not zero, not negative, not a fraction, not more than 10", () => {
    for (const amount of [0, -1, 1.5, 11, "abc", ""]) {
      expect(issue(giveCoinsSchema.safeParse({ ...ids, amount, reason: "" }))).toBe("amountInvalid");
    }
  });
});

describe("staff give and spend coins", () => {
  it("gives up to 1000 without a reason", () => {
    expect(staffCoinsSchema.safeParse({ ...ids, kind: "give", amount: 1000, reason: "" }).success).toBe(true);
    expect(issue(staffCoinsSchema.safeParse({ ...ids, kind: "give", amount: 1001, reason: "" }))).toBe("amountInvalid");
  });

  it("spending needs a reason and cannot be more than the student has", () => {
    expect(issue(staffCoinsSchema.safeParse({ ...ids, kind: "spend", amount: 5, reason: " ", balance: 9 }))).toBe("reasonRequired");
    expect(issue(staffCoinsSchema.safeParse({ ...ids, kind: "spend", amount: 10, reason: "Prize", balance: 9 }))).toBe("notEnough");
    expect(staffCoinsSchema.safeParse({ ...ids, kind: "spend", amount: 9, reason: "Prize", balance: 9 }).success).toBe(true);
  });

  it("spending is stored as a negative amount", () => {
    expect(signedAmount("give", 7)).toBe(7);
    expect(signedAmount("spend", 7)).toBe(-7);
  });
});
