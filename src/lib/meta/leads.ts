// Leads from Facebook and Instagram lead ads — docs/SPEC.md → "Lead forms
// add-on → Public intake URL and Meta lead ads".
//
//   Webhook:  each notification names a lead; it is fetched by its leadgen
//             id, mapped, and handed to the shared intake function.
//   Backfill: once an hour the recent leads of every listed Meta form are
//             read, and any the webhook missed go the same way.
// Meta's id of a lead is its external id: a lead is never taken twice. When a
// Page's token stops working the connection is marked "needs reconnect" and
// the owner is told once.

import { mapLead } from "../intake/field-map.ts";
import { submitIntake, type IntakeStore } from "../intake/intake.ts";
import { MetaError, type MetaClient, type MetaLead } from "./graph.ts";
import type { LeadgenEvent } from "./webhook.ts";

/** How far back the hourly catch-up reads. */
export const BACKFILL_HOURS = 48;

export type MetaConnection = { pageId: string; pageName: string; status: "connected" | "needs_reconnect"; token: string | null };

export interface MetaStore {
  connection(pageId: string): Promise<MetaConnection | null>;
  /** Every connected Page (not the ones waiting to be reconnected). */
  connections(): Promise<MetaConnection[]>;
  /** The Page's lead forms as listed in Settings, each with its funnel. */
  forms(pageId: string): Promise<Array<{ metaFormId: string; funnelId: string | null }>>;
  /** The funnel of a Meta form; a form not listed yet is added with no funnel. */
  funnelOf(pageId: string, metaFormId: string): Promise<string | null>;
  /** Which of these leadgen ids have already been dealt with. */
  known(leadgenIds: string[]): Promise<Set<string>>;
  /** Marks the connection "needs reconnect". True the first time. */
  markReconnect(pageId: string, detail: string): Promise<boolean>;
  /** A lead arrived through this Page. */
  touch(pageId: string, at: Date): Promise<void>;
}

export type MetaDeps = {
  client: MetaClient;
  store: MetaStore;
  intake: IntakeStore;
  secret: string;
  /** Tells the owner a Page must be connected again. */
  alertOwner: (page: { pageId: string; pageName: string }, detail: string) => Promise<void>;
  /** Called when a lead was created or came back to the inbox. */
  onLead?: () => void;
  now?: () => Date;
};

export type LeadOutcome = "created" | "merged" | "known" | "test" | "invalid" | "rate_limited" | "error";

const TEST_VALUE = /<test lead: dummy data/i;

/** "what_course_do_you_want?" → "What course do you want?": a question's key, readable. */
export function questionLabel(name: string): string {
  const text = name.replace(/_+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : name;
}

/**
 * A lead's field_data as a request body for the field mapper: full_name,
 * first_name and last_name make the name, phone_number the phone; email and
 * every custom question are kept as answers.
 */
export function leadFields(lead: MetaLead): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of lead.field_data ?? []) {
    if (!field?.name || !Array.isArray(field.values)) continue;
    const values = field.values.filter((value) => typeof value === "string" && value.trim() !== "");
    if (values.length > 0) fields[questionLabel(field.name)] = values.length === 1 ? values[0] : values;
  }
  return fields;
}

/** Whether this is the made-up lead of Meta's Lead Ads Testing Tool. */
export function isTestLead(lead: MetaLead): boolean {
  return (lead.field_data ?? []).some((field) => field.values?.some((value) => TEST_VALUE.test(value)));
}

/** One fetched lead → the shared intake function. */
export async function takeLead(lead: MetaLead, context: { pageId: string; metaFormId: string }, deps: MetaDeps): Promise<LeadOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const funnelId = await deps.store.funnelOf(context.pageId, context.metaFormId);
  const mapped = mapLead(leadFields(lead), {});

  // The testing tool sends placeholders instead of a phone: it proves the connection works, and makes no lead.
  if (!mapped.check.ok && isTestLead(lead)) {
    await deps.intake
      .reject({ channel: "meta", formId: funnelId, sourceId: null, outcome: "test", detail: "Meta test lead", ipHash: null, externalId: lead.id })
      .catch(() => undefined);
    await deps.store.touch(context.pageId, now);
    return "test";
  }

  const result = await submitIntake(
    { channel: "meta", mapped: mapped.check, formId: funnelId, sourceId: null, externalId: lead.id, language: mapped.language, ip: null, now },
    { store: deps.intake, secret: deps.secret },
  );
  if (result.status === "accepted" && result.outcome !== "spam") {
    await deps.store.touch(context.pageId, now);
    deps.onLead?.();
    return result.outcome;
  }
  if (result.status === "invalid") return "invalid";
  if (result.status === "rate_limited") return "rate_limited";
  return "error";
}

/** The token stopped working: mark the connection, and tell the owner the first time. */
async function tokenFailed(connection: MetaConnection, error: MetaError, deps: MetaDeps): Promise<void> {
  const first = await deps.store.markReconnect(connection.pageId, error.message);
  if (first) await deps.alertOwner({ pageId: connection.pageId, pageName: connection.pageName }, error.message).catch(() => undefined);
}

export type WebhookSummary = Record<LeadOutcome | "skipped", number>;
const emptySummary = (): WebhookSummary => ({ created: 0, merged: 0, known: 0, test: 0, invalid: 0, rate_limited: 0, error: 0, skipped: 0 });

/**
 * The notifications of one webhook delivery. Meta delivers at least once, so
 * the same lead may be named twice, in one delivery or in two: it is taken once.
 */
export async function handleLeadgenEvents(events: LeadgenEvent[], deps: MetaDeps): Promise<WebhookSummary> {
  const summary = emptySummary();
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.leadgenId)) {
      summary.known += 1;
      continue;
    }
    seen.add(event.leadgenId);
    try {
      const connection = await deps.store.connection(event.pageId);
      // A Page that was never connected here, or is waiting to be reconnected: nothing can be fetched.
      if (!connection?.token || connection.status !== "connected") {
        summary.skipped += 1;
        continue;
      }
      if ((await deps.store.known([event.leadgenId])).has(event.leadgenId)) {
        summary.known += 1;
        continue;
      }
      let lead: MetaLead;
      try {
        lead = await deps.client.lead(event.leadgenId, connection.token);
      } catch (error) {
        if (error instanceof MetaError && error.reconnect) await tokenFailed(connection, error, deps);
        // The hourly catch-up will find it once the Page is connected again.
        summary.error += 1;
        continue;
      }
      summary[await takeLead({ ...lead, id: lead.id ?? event.leadgenId }, { pageId: event.pageId, metaFormId: event.formId }, deps)] += 1;
    } catch {
      summary.error += 1;
    }
  }
  return summary;
}

/**
 * The hourly catch-up: for every connected Page and each of its listed forms,
 * the leads of the last 48 hours; the ones already known are skipped.
 */
export async function runBackfill(deps: MetaDeps): Promise<WebhookSummary> {
  const summary = emptySummary();
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - BACKFILL_HOURS * 60 * 60 * 1000);

  for (const connection of await deps.store.connections()) {
    if (!connection.token) continue;
    for (const form of await deps.store.forms(connection.pageId)) {
      let leads: MetaLead[];
      try {
        leads = await deps.client.formLeads(form.metaFormId, connection.token, since);
      } catch (error) {
        summary.error += 1;
        if (error instanceof MetaError && error.reconnect) {
          await tokenFailed(connection, error, deps);
          // The same token will fail for the Page's other forms too.
          break;
        }
        continue;
      }
      const ids = leads.map((lead) => lead.id).filter(Boolean);
      const known = ids.length > 0 ? await deps.store.known(ids) : new Set<string>();
      // Oldest first, as they were submitted.
      for (const lead of [...leads].reverse()) {
        if (!lead.id) continue;
        if (known.has(lead.id)) {
          summary.known += 1;
          continue;
        }
        known.add(lead.id);
        try {
          summary[await takeLead(lead, { pageId: connection.pageId, metaFormId: form.metaFormId }, deps)] += 1;
        } catch {
          summary.error += 1;
        }
      }
    }
  }
  return summary;
}
