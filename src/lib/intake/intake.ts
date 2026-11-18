// The one way a lead comes in from outside. Every channel (the public form
// now; the intake API and Meta lead ads later) calls submitIntake().
// docs/SPEC.md → "Lead forms add-on → Defaults to confirm".
//
// Order: (a form must be live → the trap → the answers are checked against
// the form document) or (the channel has mapped and checked the fields) → the
// database applies rate limits and duplicate rules and writes the lead. Spam
// gets the same answer as a real lead and a log row.

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
    /** The form the lead counts in; null for a website source with no funnel. */
    formId: string | null;
    /** The website source (API key) it came through, if any. */
    sourceId: string | null;
    ipHash: string | null;
    lead: LeadFromForm;
    language: FormLanguage | null;
  }): Promise<{ outcome: IntakeOutcome; leadId: string | null }>;
  reject(input: {
    channel: IntakeChannel;
    formId: string | null;
    sourceId: string | null;
    outcome: "spam" | "invalid" | "error" | "test" | "rate_limited";
    detail: string;
    ipHash: string | null;
  }): Promise<void>;
};

/** Answers that were checked: a lead, or what was wrong with which field. */
export type LeadCheck = { ok: true; lead: LeadFromForm } | { ok: false; errors: Record<string, AnswerError> };

type Common = {
  channel: IntakeChannel;
  language: FormLanguage | null;
  /** The visitor's address, when the channel knows it. */
  ip: string | null;
  now: Date;
};

export type IntakeInput = Common &
  (
    | {
        /** A public form: the answers are checked against the form's document. */
        form: IntakeForm;
        /** Raw answers keyed by field id. */
        values: Record<string, unknown>;
        language: FormLanguage;
        /** The hidden field and signed timestamp. */
        trap: { honeypot: string | null; token: string | null } | null;
      }
    | {
        /** The intake API or Meta: the fields were mapped and checked by the channel (field-map.ts). */
        mapped: LeadCheck;
        formId: string | null;
        sourceId: string | null;
      }
  );

export type IntakeResult =
  /** Shown as success. `outcome` is "spam" when nothing was created. */
  | { status: "accepted"; outcome: "created" | "merged" | "spam"; leadId: string | null }
  | { status: "invalid"; errors: Record<string, AnswerError> }
  | { status: "expired" }
  | { status: "rate_limited" }
  | { status: "closed" }
  | { status: "error" };

export async function submitIntake(input: IntakeInput, deps: { store: IntakeStore; secret: string }): Promise<IntakeResult> {
  const { channel, now } = input;
  const { store, secret } = deps;
  const ipHash = hashVisitor(secret, input.ip);
  const formId = "form" in input ? input.form.id : input.formId;
  const sourceId = "form" in input ? null : input.sourceId;
  const log = (outcome: "spam" | "invalid" | "error", detail: string) =>
    store.reject({ channel, formId, sourceId, outcome, detail, ipHash }).catch(() => undefined);

  let checked: LeadCheck;
  if ("form" in input) {
    const { form } = input;
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
    const answers = checkAnswers(form.document, input.values);
    checked = answers.ok ? { ok: true, lead: leadFromAnswers(form.document, answers.answers, input.language) } : answers;
  } else {
    checked = input.mapped;
  }

  if (!checked.ok) {
    await log("invalid", Object.entries(checked.errors).map(([field, code]) => `${field}:${code}`).join(" "));
    return { status: "invalid", errors: checked.errors };
  }

  try {
    const { outcome, leadId } = await store.submit({ channel, formId, sourceId, ipHash, lead: checked.lead, language: input.language });
    if (outcome === "created" || outcome === "merged") return { status: "accepted", outcome, leadId };
    if (outcome === "rate_limited") return { status: "rate_limited" };
    if (outcome === "invalid") return { status: "closed" };
    return { status: "error" };
  } catch (error) {
    await log("error", error instanceof Error ? error.message : "unknown");
    return { status: "error" };
  }
}
