import { describe, expect, it } from "vitest";

import { payRateFormSchema, teacherFormSchema } from "./teachers";

const rate = (pay_type: string, value: string) =>
  payRateFormSchema.safeParse({ pay_type, value, effective_from: "2026-12-01" });
const errorOf = (result: ReturnType<typeof rate>) =>
  result.success ? null : result.error.issues[0]?.message;

describe("payRateFormSchema", () => {
  it("fixed monthly and per lesson take an amount above 0", () => {
    expect(rate("fixed_monthly", "5 000 000").data).toEqual({
      pay_type: "fixed_monthly",
      amount: 5_000_000,
      percent: null,
      effective_from: "2026-12-01",
    });
    expect(rate("per_lesson", "120000").data?.amount).toBe(120_000);
    expect(errorOf(rate("fixed_monthly", "0"))).toBe("amountInvalid");
    expect(errorOf(rate("per_lesson", ""))).toBe("amountInvalid");
    expect(errorOf(rate("per_lesson", "-100"))).toBe("amountInvalid");
    expect(errorOf(rate("fixed_monthly", "1500.5"))).toBe("amountInvalid");
  });

  it("percent of revenue must be 1–100", () => {
    expect(rate("percent_of_revenue", "40").data).toEqual({
      pay_type: "percent_of_revenue",
      amount: null,
      percent: 40,
      effective_from: "2026-12-01",
    });
    expect(rate("percent_of_revenue", "1").success).toBe(true);
    expect(rate("percent_of_revenue", "100").success).toBe(true);
    expect(rate("percent_of_revenue", "12,5").data?.percent).toBe(12.5);
    expect(errorOf(rate("percent_of_revenue", "0"))).toBe("percentInvalid");
    expect(errorOf(rate("percent_of_revenue", "0.5"))).toBe("percentInvalid");
    expect(errorOf(rate("percent_of_revenue", "101"))).toBe("percentInvalid");
    expect(errorOf(rate("percent_of_revenue", "150"))).toBe("percentInvalid");
    expect(errorOf(rate("percent_of_revenue", ""))).toBe("percentInvalid");
  });

  it("needs a pay type and a real date", () => {
    expect(errorOf(rate("hourly", "100"))).toBe("payTypeRequired");
    expect(
      payRateFormSchema.safeParse({ pay_type: "per_lesson", value: "100", effective_from: "soon" }).success,
    ).toBe(false);
  });
});

describe("teacherFormSchema", () => {
  const base = { full_name: " Dilshod Rahimov ", phone: "90 111 22 01", subjects: "", hired_on: "", is_active: true, notes: "" };

  it("normalises the phone, trims the name and empties blanks", () => {
    expect(teacherFormSchema.parse(base)).toEqual({
      full_name: "Dilshod Rahimov",
      phone: "+998901112201",
      subjects: [],
      hired_on: null,
      is_active: true,
      notes: null,
    });
  });

  it("splits subjects on commas and drops repeats and blanks", () => {
    expect(teacherFormSchema.parse({ ...base, subjects: "Ingliz tili, IELTS,, IELTS " }).subjects).toEqual([
      "Ingliz tili",
      "IELTS",
    ]);
  });

  it("refuses a missing name or a bad phone", () => {
    expect(teacherFormSchema.safeParse({ ...base, full_name: "  " }).success).toBe(false);
    expect(teacherFormSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });
});
