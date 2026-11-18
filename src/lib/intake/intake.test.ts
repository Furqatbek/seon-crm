// The validator built from a form document, the spam trap, and the intake
// function. docs/SPEC.md → "Lead forms add-on → Defaults to confirm".
// Duplicate rules and rate limits live in Postgres: supabase/tests/lead-forms.test.ts.
import { describe, expect, it } from "vitest";

import { formDocumentSchema, visitorLanguage, type FormDocument } from "../forms/document";
import { FORM_TEMPLATES } from "../forms/templates";
import { submitIntake, type IntakeStore } from "./intake";
import { MAX_FILL_MS, MIN_FILL_MS, checkTrap, hashVisitor, issueToken } from "./trap";
import { buildAnswersSchema, checkAnswers, leadFromAnswers, normalizeIntakePhone } from "./validator";

const template = (key: string): FormDocument =>
  formDocumentSchema.parse(FORM_TEMPLATES.find((item) => item.key === key)!.document);
const course = template("course_signup");
const consultation = template("consultation");
const trial = template("free_trial");

const SECRET = "test-secret";
const FORM_ID = "11111111-1111-4111-8111-111111111111";
const good = { name: " Aziza Karimova ", phone: "90 123 45 67", level: "basic", time: "evening", comment: "Salom", consent: "on" };

describe("the three templates", () => {
  it.each(FORM_TEMPLATES)("$name is a valid form document in uz, ru and en", ({ document, slug }) => {
    const parsed = formDocumentSchema.parse(document);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(parsed.languages).toEqual(["uz", "ru", "en"]);
    for (const language of parsed.languages) {
      expect(parsed.texts.title[language]).toBeTruthy();
      expect(parsed.texts.consent_text[language]).toBeTruthy();
      for (const field of parsed.fields.filter((item) => item.type !== "consent")) expect(field.label[language], field.id).toBeTruthy();
    }
    expect(parsed.fields.some((field) => field.type === "consent" && field.required)).toBe(true);
  });

  it("a form without a name or a phone field is refused", () => {
    const { document } = FORM_TEMPLATES[0];
    const without = (id: string) => ({ ...document, fields: document.fields.filter((field) => field.id !== id) });
    expect(formDocumentSchema.safeParse(without("name")).success).toBe(false);
    expect(formDocumentSchema.safeParse(without("phone")).success).toBe(false);
    expect(formDocumentSchema.safeParse({ ...document, default_language: "en", languages: ["uz"] }).success).toBe(false);
  });
});

describe("the validator builder", () => {
  it("has one entry per field a visitor answers", () => {
    expect(Object.keys(buildAnswersSchema(course).shape)).toEqual(["name", "phone", "level", "time", "comment", "consent"]);
  });

  it("accepts good answers, trimmed and with the phone in full", () => {
    expect(checkAnswers(course, good)).toEqual({
      ok: true,
      answers: { name: "Aziza Karimova", phone: "+998901234567", level: "basic", time: "evening", comment: "Salom", consent: true },
    });
  });

  it("optional fields may be left out or blank", () => {
    const result = checkAnswers(course, { ...good, time: "", comment: undefined });
    expect(result.ok && result.answers.time).toBe(undefined);
    expect(result.ok && result.answers.comment).toBe(undefined);
  });

  it("names the field and the reason for each bad answer", () => {
    expect(checkAnswers(course, { name: "  ", phone: "12345", level: "expert", time: "night", comment: "x".repeat(2001) })).toEqual({
      ok: false,
      errors: { name: "required", phone: "phone", level: "choice", time: "choice", comment: "too_long", consent: "required" },
    });
    expect(checkAnswers(course, {})).toMatchObject({ ok: false, errors: { name: "required", phone: "required", level: "required", consent: "required" } });
  });

  it("checks numbers, dates and emails", () => {
    const base = { name: "A", phone: "+998901234567", time: "morning", consent: "on" };
    expect(checkAnswers(trial, { ...base, age: "17", day: "2026-12-01" }).ok).toBe(true);
    expect(checkAnswers(trial, { ...base, age: "seventeen", day: "01.12.2026" })).toMatchObject({ errors: { age: "number", day: "date" } });
    const withEmail = formDocumentSchema.parse({
      ...FORM_TEMPLATES[0].document,
      fields: [...FORM_TEMPLATES[0].document.fields, { id: "email", type: "email", label: { uz: "Email" }, required: true }],
    });
    expect(checkAnswers(withEmail, { ...good, email: "aziza@example.com" }).ok).toBe(true);
    expect(checkAnswers(withEmail, { ...good, email: "aziza@" })).toMatchObject({ errors: { email: "email" } });
  });

  it("multiple choice takes one value, many or none, and only the form's options", () => {
    const base = { name: "A", phone: "+998901234567", consent: "on" };
    const answers = (topics: unknown) => checkAnswers(consultation, { ...base, topics });
    expect(answers(undefined)).toMatchObject({ ok: true, answers: { topics: [] } });
    expect(answers("courses")).toMatchObject({ ok: true, answers: { topics: ["courses"] } });
    expect(answers(["courses", "exam", "courses"])).toMatchObject({ ok: true, answers: { topics: ["courses", "exam"] } });
    expect(answers(["courses", "free-money"])).toMatchObject({ ok: false, errors: { topics: "choice" } });
  });

  it("takes Uzbek numbers in any spelling and full international numbers", () => {
    expect(normalizeIntakePhone("+998 (90) 123-45-67")).toBe("+998901234567");
    expect(normalizeIntakePhone("901234567")).toBe("+998901234567");
    expect(normalizeIntakePhone("+7 912 345-67-89")).toBe("+79123456789");
    expect(normalizeIntakePhone("+82 10 1234 5678")).toBe("+821012345678");
    for (const bad of ["+998 ", "79123456789", "+0123456789", "+12345", "call me", ""]) expect(normalizeIntakePhone(bad), bad).toBe(null);
  });
});

describe("answers → lead", () => {
  it("mapped answers fill the lead's columns; the rest are kept with the label as it read then", () => {
    const checked = checkAnswers(course, good);
    if (!checked.ok) throw new Error("unexpected");
    expect(leadFromAnswers(course, checked.answers, "ru")).toEqual({
      fullName: "Aziza Karimova",
      phone: "+998901234567",
      subject: null,
      preferredTime: "Вечером",
      notes: "Salom",
      answers: [
        { id: "level", type: "radio", label: "Ваш уровень сейчас", value: "Начальный" },
        { id: "consent", type: "consent", label: "Я согласен(на) на использование моих данных для связи со мной.", value: true },
      ],
    });
    expect(leadFromAnswers(course, checked.answers, "uz").answers[0]).toMatchObject({ label: "Hozirgi darajangiz", value: "Boshlangʻich" });
  });

  it("several choices are joined, hidden values are kept, empty answers are left out", () => {
    const document = formDocumentSchema.parse({
      ...FORM_TEMPLATES[2].document,
      fields: [...FORM_TEMPLATES[2].document.fields, { id: "campaign", type: "hidden", label: { en: "Campaign" }, value: "autumn" }],
    });
    const checked = checkAnswers(document, { name: "A", phone: "+998901234567", topics: ["courses", "exam"], consent: "on" });
    if (!checked.ok) throw new Error("unexpected");
    const lead = leadFromAnswers(document, checked.answers, "en");
    expect(lead.preferredTime).toBe(null);
    expect(lead.answers.map((answer) => [answer.id, answer.value])).toEqual([
      ["topics", "Courses and prices, Exam preparation"],
      ["consent", true],
      ["campaign", "autumn"],
    ]);
  });
});

describe("trap timing", () => {
  const opened = new Date("2026-11-18T10:00:00Z");
  const after = (ms: number) => new Date(opened.getTime() + ms);
  const token = issueToken(SECRET, FORM_ID, opened);
  const verdict = (ms: number, input: { honeypot?: string; token?: string | null } = {}) =>
    checkTrap({ honeypot: input.honeypot ?? "", token: input.token === undefined ? token : input.token }, SECRET, FORM_ID, after(ms));

  it("under 3 seconds is too fast; from 3 seconds to 24 hours is fine; later the page has expired", () => {
    expect(verdict(0)).toBe("too_fast");
    expect(verdict(MIN_FILL_MS - 1)).toBe("too_fast");
    expect(verdict(MIN_FILL_MS)).toBe("ok");
    expect(verdict(MAX_FILL_MS)).toBe("ok");
    expect(verdict(MAX_FILL_MS + 1)).toBe("expired");
  });

  it("a filled hidden field is spam whatever the timing", () => {
    expect(verdict(10_000, { honeypot: "https://spam.example" })).toBe("honeypot");
    expect(verdict(10_000, { honeypot: "   " })).toBe("ok");
  });

  it("a missing, made-up or borrowed timestamp is refused", () => {
    expect(verdict(10_000, { token: null })).toBe("bad_token");
    expect(verdict(10_000, { token: "" })).toBe("bad_token");
    expect(verdict(10_000, { token: `${opened.getTime() - 60_000}.${token.split(".")[1]}` })).toBe("bad_token");
    expect(verdict(10_000, { token: issueToken("another-secret", FORM_ID, opened) })).toBe("bad_token");
    expect(verdict(10_000, { token: issueToken(SECRET, "22222222-2222-4222-8222-222222222222", opened) })).toBe("bad_token");
  });

  it("a visitor's address is stored only as a keyed hash", () => {
    expect(hashVisitor(SECRET, "203.0.113.7")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(hashVisitor(SECRET, "203.0.113.7")).toBe(hashVisitor(SECRET, " 203.0.113.7 "));
    expect(hashVisitor(SECRET, "203.0.113.7")).not.toBe(hashVisitor(SECRET, "203.0.113.8"));
    expect(hashVisitor(SECRET, "203.0.113.7")).not.toBe(hashVisitor("other", "203.0.113.7"));
    expect(hashVisitor(SECRET, null)).toBe(null);
  });
});

describe("the intake function", () => {
  const opened = new Date("2026-11-18T10:00:00Z");
  const now = new Date(opened.getTime() + 20_000);
  const setup = (outcome: "created" | "merged" | "rate_limited" | "invalid" = "created") => {
    const calls: { submits: Parameters<IntakeStore["submit"]>[0][]; rejects: Parameters<IntakeStore["reject"]>[0][] } = { submits: [], rejects: [] };
    const store: IntakeStore = {
      submit: async (input) => {
        calls.submits.push(input);
        return { outcome, leadId: outcome === "created" || outcome === "merged" ? "lead-1" : null };
      },
      reject: async (input) => void calls.rejects.push(input),
    };
    return { calls, deps: { store, secret: SECRET } };
  };
  const input = (over: Partial<Parameters<typeof submitIntake>[0]> = {}) => ({
    channel: "form" as const,
    form: { id: FORM_ID, status: "live" as const, document: course },
    values: good,
    language: "ru" as const,
    trap: { honeypot: "", token: issueToken(SECRET, FORM_ID, opened) },
    ip: "203.0.113.7",
    now,
    ...over,
  });

  it("good answers create a lead with the form, the language and a hashed address", async () => {
    const { calls, deps } = setup();
    expect(await submitIntake(input(), deps)).toEqual({ status: "accepted", outcome: "created", leadId: "lead-1" });
    expect(calls.rejects).toEqual([]);
    expect(calls.submits).toHaveLength(1);
    expect(calls.submits[0]).toMatchObject({ channel: "form", formId: FORM_ID, language: "ru", ipHash: hashVisitor(SECRET, "203.0.113.7") });
    expect(calls.submits[0].lead).toMatchObject({ fullName: "Aziza Karimova", phone: "+998901234567", preferredTime: "Вечером" });
  });

  it("spam gets the same success, creates nothing and is logged", async () => {
    for (const [trap, detail] of [
      [{ honeypot: "buy now", token: issueToken(SECRET, FORM_ID, opened) }, "honeypot"],
      [{ honeypot: "", token: issueToken(SECRET, FORM_ID, new Date(now.getTime() - 1_000)) }, "too_fast"],
      [{ honeypot: "", token: "1.x" }, "bad_token"],
    ] as const) {
      const { calls, deps } = setup();
      expect(await submitIntake(input({ trap }), deps)).toEqual({ status: "accepted", outcome: "spam", leadId: null });
      expect(calls.submits).toEqual([]);
      expect(calls.rejects).toMatchObject([{ outcome: "spam", detail, formId: FORM_ID }]);
    }
  });

  it("bad answers come back with their errors and are logged as invalid", async () => {
    const { calls, deps } = setup();
    expect(await submitIntake(input({ values: { ...good, phone: "123" } }), deps)).toEqual({ status: "invalid", errors: { phone: "phone" } });
    expect(calls.submits).toEqual([]);
    expect(calls.rejects).toMatchObject([{ outcome: "invalid", detail: "phone:phone" }]);
  });

  it("a page open for more than a day asks the visitor to send again", async () => {
    const { calls, deps } = setup();
    const token = issueToken(SECRET, FORM_ID, new Date(now.getTime() - MAX_FILL_MS - 1));
    expect(await submitIntake(input({ trap: { honeypot: "", token } }), deps)).toEqual({ status: "expired" });
    expect(calls.submits).toEqual([]);
  });

  it("passes on what the database decided: merged, rate limited, closed", async () => {
    expect(await submitIntake(input(), setup("merged").deps)).toMatchObject({ status: "accepted", outcome: "merged" });
    expect(await submitIntake(input(), setup("rate_limited").deps)).toEqual({ status: "rate_limited" });
    expect(await submitIntake(input(), setup("invalid").deps)).toEqual({ status: "closed" });
    const closed = setup();
    expect(await submitIntake(input({ form: { id: FORM_ID, status: "closed", document: course } }), closed.deps)).toEqual({ status: "closed" });
    expect(closed.calls.submits).toEqual([]);
  });

  it("a database failure is an error for the visitor and a log row", async () => {
    const { calls, deps } = setup();
    deps.store.submit = async () => {
      throw new Error("connection lost");
    };
    expect(await submitIntake(input(), deps)).toEqual({ status: "error" });
    expect(calls.rejects).toMatchObject([{ outcome: "error", detail: "connection lost" }]);
  });
});

describe("the visitor's language", () => {
  const doc = { languages: ["uz", "ru"] as ("uz" | "ru" | "en")[], default_language: "uz" as const };
  it("is the one chosen, else the browser's, else the form's default", () => {
    expect(visitorLanguage(doc, "ru", "en-US,en;q=0.9")).toBe("ru");
    expect(visitorLanguage(doc, null, "en-US,ru-RU;q=0.8")).toBe("ru");
    expect(visitorLanguage(doc, "en", "en-US")).toBe("uz");
    expect(visitorLanguage(doc, "ko", null)).toBe("uz");
  });
});
