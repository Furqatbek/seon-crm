// The one way a lead comes in from outside. Every channel (the public form
// now; the intake API and Meta lead ads later) calls submitIntake().
// docs/SPEC.md → "Lead forms add-on → Defaults to confirm".
//
// Order: the form must be live → the trap → the answers are checked against
// the form document → the database applies rate limits and duplicate rules and
// writes the lead. Spam gets the same answer as a real lead and a log row.

import type { FormDocument, FormLanguage } from "../forms/document.ts";
import { checkTrap, hashVisitor } from "./trap.ts";
import { checkAnswers, leadFromAnswers, type AnswerError, type LeadFromForm } from "./validator.ts";

export type IntakeChannel = "form" | "api" | "meta";
export type IntakeOutcome = "created" | "merged" | "spam" | "rate_limited" | "invalid" | "test" | "error";

export type IntakeForm = { id: string; status: "draft" | "live" | "closed"; document: FormDocument };

/** What the database is asked to do. The Supabase version is in store.ts. */
export type IntakeStore = {
  submit(input: {
    channel: IntakeChannel;
    formId: string;
    ipHash: string | null;
    lead: LeadFromForm;
    language: FormLanguage;
  }): Promise<{ outcome: IntakeOutcome; leadId: string | null }>;
  reject(input: {
    channel: IntakeChannel;
    formId: string;
    outcome: "spam" | "invalid" | "error";
    detail: string;
    ipHash: string | null;
  }): Promise<void>;
};

export type IntakeInput = {
  channel: IntakeChannel;
  form: IntakeForm;
  /** Raw answers keyed by field id. */
  values: Record<string, unknown>;
  language: FormLanguage;
  /** The hidden field and signed timestamp. Null for channels that have their own key. */
  trap: { honeypot: string | null; token: string | null } | null;
  ip: string | null;
  now: Date;
};

export type IntakeResult =
  /** Shown as success. `outcome` is "spam" when nothing was created. */
  | { status: "accepted"; outcome: "created" | "merged" | "spam"; leadId: string | null }
  | { status: "invalid"; errors: Record<string, AnswerError> }
  | { status: "expired" }
  | { status: "rate_limited" }
  | { status: "closed" }
  | { status: "error" };

export async function submitIntake(input: IntakeInput, deps: { store: IntakeStore; secret: string }): Promise<IntakeResult> {
  const { channel, form, language, now } = input;
  const { store, secret } = deps;
  const ipHash = hashVisitor(secret, input.ip);
  const log = (outcome: "spam" | "invalid" | "error", detail: string) =>
    store.reject({ channel, formId: form.id, outcome, detail, ipHash }).catch(() => undefined);

  if (form.status !== "live") return { status: "closed" };

  if (input.trap) {
    const verdict = checkTrap(input.trap, secret, form.id, now);
    if (verdict === "expired") {
      await log("invalid", "expired");
      return { status: "expired" };
    }
    if (verdict !== "ok") {
      await log("spam", verdict);
      return { status: "accepted", outcome: "spam", leadId: null };
    }
  }

  const checked = checkAnswers(form.document, input.values);
  if (!checked.ok) {
    await log("invalid", Object.entries(checked.errors).map(([field, code]) => `${field}:${code}`).join(" "));
    return { status: "invalid", errors: checked.errors };
  }

  try {
    const lead = leadFromAnswers(form.document, checked.answers, language);
    const { outcome, leadId } = await store.submit({ channel, formId: form.id, ipHash, lead, language });
    if (outcome === "created" || outcome === "merged") return { status: "accepted", outcome, leadId };
    if (outcome === "rate_limited") return { status: "rate_limited" };
    if (outcome === "invalid") return { status: "closed" };
    return { status: "error" };
  } catch (error) {
    await log("error", error instanceof Error ? error.message : "unknown");
    return { status: "error" };
  }
}
