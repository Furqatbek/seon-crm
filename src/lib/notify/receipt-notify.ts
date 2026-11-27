import { formatMoney } from "../format.ts";
import { notifyAccount, type AppAccount, type AppNotifyDeps, type AppRunSummary, type AppTexts } from "./app-notify.ts";
import type { MessageLog } from "./deliver.ts";
import { isQuiet } from "./rules.ts";
import type { AlertButton, AlertSender, StaffRecipient, StaffTexts } from "./staff-alerts.ts";

// Messages about payment receipts — docs/STUDENT_APP_SPEC.md → "Rules →
// Receipts" and "CRM changes" (new receipts use the live inbox pattern).
//   - A new receipt is announced once on Telegram to each owner and manager
//     who linked it and left alerts on; not in quiet hours, when it waits.
//   - The student gets a push when it is approved or rejected, at once, also
//     in quiet hours: it answers something they did.
// Both are sent right after the event and again offered by the 15-minute job;
// every message has a dedupe key, so nobody is told twice.

export type PendingReceipt = { id: string; studentName: string; groupName: string; amount: number; createdAt: string };

export interface ReceiptAlertData {
  quietHours(): Promise<{ from: string; to: string }>;
  /** Receipts still pending, sent since then. */
  pendingReceipts(since: Date): Promise<PendingReceipt[]>;
  /** Active owners and managers with Telegram linked and alerts on. */
  recipients(): Promise<StaffRecipient[]>;
}

/** A receipt older than this is not announced any more. */
export const RECEIPT_ALERT_WINDOW_HOURS = 72;

const tashkentTime = (instant: Date) => new Date(instant.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(11, 16);

export type ReceiptAlertSummary = { alerts: number; failed: number };

/** Tells staff about receipts waiting for review. Safe to run again. */
export async function runReceiptAlerts(
  now: Date,
  deps: { data: ReceiptAlertData; log: MessageLog; telegram: AlertSender; texts: StaffTexts; appUrl: string | null },
): Promise<ReceiptAlertSummary> {
  const summary: ReceiptAlertSummary = { alerts: 0, failed: 0 };
  const quiet = await deps.data.quietHours();
  if (isQuiet(tashkentTime(now), quiet.from, quiet.to)) return summary;
  const receipts = await deps.data.pendingReceipts(new Date(now.getTime() - RECEIPT_ALERT_WINDOW_HOURS * 60 * 60 * 1000));
  if (receipts.length === 0) return summary;
  const recipients = await deps.data.recipients();
  for (const receipt of receipts) {
    for (const person of recipients) {
      const t = deps.texts(person.language);
      const body = [t("newReceipt"), receipt.studentName, receipt.groupName, formatMoney(receipt.amount, person.language)].join("\n");
      const recipient = String(person.chatId);
      const id = await deps.log.begin(
        { studentId: null, staffId: person.id, type: "staff_new_receipt", channel: "telegram", recipient, body, dedupeKey: `staff_new_receipt:${receipt.id}:${person.id}` },
        "queued",
      );
      if (id === null) continue;
      // Telegram accepts only public https links on a button.
      const buttons: AlertButton[][] = deps.appUrl?.startsWith("https://") ? [[{ text: t("open"), url: `${deps.appUrl}/${person.language}/finance?tab=receipts` }]] : [];
      const result = await deps.telegram.sendWithButtons(recipient, body, buttons);
      await deps.log.finish(id, { status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error, sentAt: result.ok ? now.toISOString() : null });
      summary[result.ok ? "alerts" : "failed"] += 1;
    }
  }
  return summary;
}

export type ReviewedReceipt = { id: string; status: "approved" | "rejected"; amount: number; rejectReason: string | null; account: AppAccount };

export interface ReceiptDecisionData {
  /** Receipts approved or rejected since then, whose sender still has the app account. */
  reviewedSince(since: Date): Promise<ReviewedReceipt[]>;
}

/** A decision older than this is no longer announced. */
export const DECISION_WINDOW_HOURS = 48;

/** The student's push for each decision on their receipts: once per receipt. */
export async function runReceiptDecisions(now: Date, deps: AppNotifyDeps & { data: ReceiptDecisionData; texts: AppTexts }): Promise<AppRunSummary> {
  const summary: AppRunSummary = { pushed: 0, stored: 0, duplicate: 0 };
  for (const receipt of await deps.data.reviewedSince(new Date(now.getTime() - DECISION_WINDOW_HOURS * 60 * 60 * 1000))) {
    const t = deps.texts(receipt.account.language);
    const amount = formatMoney(receipt.amount, receipt.account.language);
    const outcome = await notifyAccount(deps, receipt.account, {
      type: receipt.status === "approved" ? "receipt_approved" : "receipt_rejected",
      title: t(`receipt.${receipt.status}.title`),
      body: receipt.status === "approved" ? t("receipt.approved.body", { amount }) : t("receipt.rejected.body", { amount, reason: receipt.rejectReason ?? "" }),
      // A tap opens Payments, where the balance and My receipts are.
      data: { screen: "payments" },
      dedupeKey: `receipt:${receipt.id}:${receipt.status}`,
    });
    if (outcome !== "none") summary[outcome] += 1;
  }
  return summary;
}
