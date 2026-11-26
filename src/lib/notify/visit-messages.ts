import { deliver, type Delivery, type MessageLog } from "./deliver.ts";
import { compose, tashkentNow, type Template } from "./reminders.ts";
import type { ChatLink } from "./rules.ts";
import type { Providers } from "./types.ts";

// The parent's Telegram message when reception scans a student in or out —
// docs/STUDENT_APP_SPEC.md → "Rules → QR check-in". Sent at once, in quiet
// hours too; the owner can switch it off. Telegram only: a parent without a
// linked chat gets nothing.

export type Visit = {
  visitId: string;
  studentId: string;
  studentName: string;
  kind: "arrived" | "left";
  at: Date;
};

export interface VisitMessageDeps {
  /** Settings → Notifications → Arrival and leaving messages to parents. */
  enabled(): Promise<boolean>;
  centreName(): Promise<string>;
  parentChat(studentId: string): Promise<ChatLink | null>;
  templates(): Promise<readonly Template[]>;
  log: MessageLog;
  providers: Providers;
}

export type VisitMessageResult = Delivery | "off" | "no_chat" | "no_template";

/** One visit, one message: scanning the same visit again sends nothing more. */
export const visitDedupeKey = (visitId: string) => `visit:${visitId}`;

export async function sendVisitMessage(deps: VisitMessageDeps, visit: Visit): Promise<VisitMessageResult> {
  if (!(await deps.enabled())) return "off";
  const chat = await deps.parentChat(visit.studentId);
  if (!chat || chat.chatId === "") return "no_chat";
  const type = visit.kind === "arrived" ? "visit_arrived" : "visit_left";
  const body = compose(await deps.templates(), type, "telegram", chat.language, {
    student: visit.studentName,
    time: tashkentNow(visit.at).time,
    centre: await deps.centreName(),
  });
  if (!body) return "no_template";
  return deliver(deps.log, deps.providers, {
    studentId: visit.studentId,
    type,
    channel: "telegram",
    recipient: String(chat.chatId),
    body,
    dedupeKey: visitDedupeKey(visit.visitId),
  });
}
