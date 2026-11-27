import { describe, expect, it } from "vitest";

import type { AppAccount, AppNotification, AppNotifyStore } from "./app-notify";
import type { MessageLog, Outgoing } from "./deliver";
import type { PushMessage, PushSender } from "./fcm";
import { runReceiptAlerts, runReceiptDecisions, type PendingReceipt, type ReceiptAlertData, type ReviewedReceipt } from "./receipt-notify";
import type { AlertButton, StaffRecipient } from "./staff-alerts";

// Messages about receipts — docs/STUDENT_APP_SPEC.md → "Rules → Receipts".

const at = (day: string, time: string) => new Date(`${day}T${time}:00+05:00`);
const receipt = (overrides: Partial<PendingReceipt> = {}): PendingReceipt => ({ id: "r-1", studentName: "Aziza Karimova", groupName: "TOPIK II · Kechki", amount: 600_000, createdAt: at("2026-11-27", "14:00").toISOString(), ...overrides });
const staff: StaffRecipient[] = [
  { id: "owner", chatId: 111, language: "uz" },
  { id: "manager", chatId: 222, language: "en" },
];

function alertFakes(receipts: PendingReceipt[]) {
  const logged: Outgoing[] = [];
  const sent: Array<{ recipient: string; body: string; buttons: AlertButton[][] }> = [];
  const log: MessageLog = {
    begin: async (message) => {
      if (logged.some((row) => row.dedupeKey === message.dedupeKey)) return null;
      logged.push(message);
      return `m-${logged.length}`;
    },
    finish: async () => undefined,
  };
  const data: ReceiptAlertData = {
    quietHours: async () => ({ from: "21:00", to: "09:00" }),
    pendingReceipts: async (since) => receipts.filter((row) => Date.parse(row.createdAt) >= since.getTime()),
    recipients: async () => staff,
  };
  const deps = {
    data,
    log,
    telegram: { sendWithButtons: async (recipient: string, body: string, buttons: AlertButton[][] = []) => (sent.push({ recipient, body, buttons }), { ok: true as const }) },
    texts: (language: string) => (key: string) => `${language}:${key}`,
    appUrl: "https://crm.example.uz",
  };
  return { deps, logged, sent };
}

describe("staff alerts about new receipts", () => {
  it("each owner and manager with alerts on is told once, in their language, with a link to the list", async () => {
    const { deps, logged, sent } = alertFakes([receipt()]);
    expect(await runReceiptAlerts(at("2026-11-27", "14:01"), deps)).toEqual({ alerts: 2, failed: 0 });
    expect(await runReceiptAlerts(at("2026-11-27", "14:16"), deps)).toEqual({ alerts: 0, failed: 0 });
    expect(sent.map((message) => [message.recipient, message.body])).toEqual([
      ["111", "uz:newReceipt\nAziza Karimova\nTOPIK II · Kechki\n600 000 soʻm"],
      ["222", "en:newReceipt\nAziza Karimova\nTOPIK II · Kechki\nUZS 600,000"],
    ]);
    expect(sent[1].buttons).toEqual([[{ text: "en:open", url: "https://crm.example.uz/en/finance?tab=receipts" }]]);
    expect(logged.map((row) => [row.type, row.staffId, row.dedupeKey])).toEqual([
      ["staff_new_receipt", "owner", "staff_new_receipt:r-1:owner"],
      ["staff_new_receipt", "manager", "staff_new_receipt:r-1:manager"],
    ]);
  });

  it("a receipt sent at night is announced when quiet hours end; an old one is not announced", async () => {
    const { deps, sent } = alertFakes([receipt({ createdAt: at("2026-11-27", "23:30").toISOString() }), receipt({ id: "old", createdAt: at("2026-11-20", "10:00").toISOString() })]);
    expect(await runReceiptAlerts(at("2026-11-27", "23:31"), deps)).toEqual({ alerts: 0, failed: 0 });
    expect(await runReceiptAlerts(at("2026-11-28", "09:00"), deps)).toEqual({ alerts: 2, failed: 0 });
    expect(sent.every((message) => message.body.includes("Aziza"))).toBe(true);
  });
});

function pushFakes() {
  const rows: Array<{ profileId: string } & AppNotification> = [];
  const sent: Array<{ token: string } & PushMessage> = [];
  const store: AppNotifyStore = {
    accountOfStudent: async () => null,
    insert: async (profileId, notification) => {
      if (rows.some((row) => row.profileId === profileId && row.dedupeKey === notification.dedupeKey)) return false;
      rows.push({ profileId, ...notification });
      return true;
    },
    dropToken: async () => undefined,
  };
  const push: PushSender = { send: async (token, message) => (sent.push({ token, ...message }), { ok: true }) };
  return { store, push, rows, sent };
}
const account = (profileId: string, language: AppAccount["language"]): AppAccount => ({ profileId, language, messageLanguage: language === "ko" ? "uz" : language, tokens: [`token-${profileId}`] });
const texts = (language: string) => (key: string, values?: Record<string, string | number>) => `${language}:${key}:${Object.values(values ?? {}).join("|")}`;

describe("the student's push on each decision", () => {
  const reviewed: ReviewedReceipt[] = [
    { id: "r-1", status: "approved", amount: 600_000, rejectReason: null, account: account("p-1", "uz") },
    { id: "r-2", status: "rejected", amount: 550_000, rejectReason: "Summa toʻliq emas", account: account("p-2", "ko") },
  ];

  it("approved and rejected, once each, at once even at night, leading to Payments", async () => {
    const { store, push, rows, sent } = pushFakes();
    const deps = { store, push, texts, data: { reviewedSince: async () => reviewed } };
    // 23:40 in Tashkent: a decision is not a reminder, it does not wait.
    expect(await runReceiptDecisions(at("2026-11-27", "23:40"), deps)).toEqual({ pushed: 2, stored: 0, duplicate: 0 });
    expect(await runReceiptDecisions(at("2026-11-27", "23:55"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 2 });
    expect(rows.map((row) => [row.profileId, row.type, row.title, row.body, row.dedupeKey])).toEqual([
      ["p-1", "receipt_approved", "uz:receipt.approved.title:", "uz:receipt.approved.body:600 000 soʻm", "receipt:r-1:approved"],
      ["p-2", "receipt_rejected", "ko:receipt.rejected.title:", "ko:receipt.rejected.body:550,000숨|Summa toʻliq emas", "receipt:r-2:rejected"],
    ]);
    expect(sent[0].data).toEqual({ type: "receipt_approved", screen: "payments" });
  });
});
