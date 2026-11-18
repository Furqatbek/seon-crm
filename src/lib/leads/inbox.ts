import "server-only";

import { createClient } from "@/lib/supabase/server";

/** A lead waiting in the shared inbox. docs/SPEC.md → "Lead forms add-on → Shared inbox and staff alerts". */
export type InboxItem = {
  id: string;
  fullName: string;
  phone: string;
  formName: string | null;
  /** A one-line summary of the answers, as they were saved. */
  summary: string;
  /** When it entered the inbox (ISO). */
  since: string;
};

/** The first answers in one line: "Level: Basic · Time: Evening". */
export function answerSummary(answers: unknown, limit = 2): string {
  if (!Array.isArray(answers)) return "";
  return (answers as Array<{ label?: unknown; value?: unknown }>)
    .filter((answer) => typeof answer.value === "string" && answer.value.trim() !== "" && typeof answer.label === "string")
    .slice(0, limit)
    .map((answer) => `${answer.label as string}: ${answer.value as string}`)
    .join(" · ");
}

/** Everything in the inbox, oldest first. Empty while the inbox migration is not applied. */
export async function getInbox(): Promise<InboxItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("lead_inbox");
  // A missing function (deploy ahead of its migration) or a teacher: no inbox.
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    formName: row.form_name,
    summary: answerSummary(row.answers),
    since: row.inbox_since,
  }));
}

/** The signed-in person's "sound" switch for new leads. On until they turn it off. */
export async function getAlertSound(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return true;
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return true;
  const { data } = await supabase.from("profiles").select("alert_sound").eq("id", id).maybeSingle();
  return data?.alert_sound ?? true;
}
