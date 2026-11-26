import { describe, expect, it } from "vitest";

import type { MessageLog, Outgoing } from "./deliver.ts";
import { fakeProviders } from "./fake.ts";
import type { ChatLink } from "./rules.ts";
import { sendVisitMessage, type Visit, type VisitMessageDeps } from "./visit-messages.ts";

// docs/STUDENT_APP_SPEC.md → "Rules → QR check-in": the parent's Telegram chat
// gets the arrival or leaving message at once, even in quiet hours.

const templates = [
  { type: "visit_arrived" as const, channel: "telegram" as const, language: "uz" as const, body: "{student} markazga keldi. Vaqt: {time}." },
  { type: "visit_arrived" as const, channel: "telegram" as const, language: "ru" as const, body: "{student} пришёл(а) в центр в {time}." },
  { type: "visit_left" as const, channel: "telegram" as const, language: "uz" as const, body: "{student} {centre}dan chiqdi. Vaqt: {time}." },
];

function world(options: { enabled?: boolean; chat?: ChatLink | null } = {}) {
  const rows: Outgoing[] = [];
  const log: MessageLog = {
    begin: async (message) => (rows.some((row) => row.dedupeKey === message.dedupeKey) ? null : (rows.push(message), String(rows.length))),
    finish: async () => {},
  };
  const providers = fakeProviders();
  const deps: VisitMessageDeps = {
    enabled: async () => options.enabled ?? true,
    centreName: async () => "Seon",
    parentChat: async () => (options.chat === undefined ? { chatId: 201, language: "uz" } : options.chat),
    templates: async () => templates,
    log,
    providers,
  };
  return { deps, rows, providers };
}

// 23:30 in Tashkent: deep in quiet hours.
const visit: Visit = { visitId: "visit-1", studentId: "student-1", studentName: "Aziza Karimova", kind: "arrived", at: new Date("2026-11-26T18:30:00Z") };

describe("visit messages to parents", () => {
  it("tells the parent's chat at once, with the Tashkent time, in quiet hours too", async () => {
    const { deps, rows, providers } = world();
    expect(await sendVisitMessage(deps, visit)).toBe("sent");
    expect(providers.telegram.sent).toEqual([{ recipient: "201", body: "Aziza Karimova markazga keldi. Vaqt: 23:30." }]);
    expect(rows).toEqual([expect.objectContaining({ studentId: "student-1", type: "visit_arrived", channel: "telegram", dedupeKey: "visit:visit-1" })]);
    expect(providers.sms.sent).toEqual([]);
  });

  it("writes in the chat's own language, and says Left for a leaving", async () => {
    const russian = world({ chat: { chatId: 202, language: "ru" } });
    await sendVisitMessage(russian.deps, visit);
    expect(russian.providers.telegram.sent[0].body).toBe("Aziza Karimova пришёл(а) в центр в 23:30.");

    const leaving = world();
    await sendVisitMessage(leaving.deps, { ...visit, visitId: "visit-2", kind: "left" });
    expect(leaving.providers.telegram.sent[0].body).toBe("Aziza Karimova Seondan chiqdi. Vaqt: 23:30.");
    expect(leaving.rows[0].type).toBe("visit_left");
  });

  it("one visit is one message: a repeated scan of it sends nothing more", async () => {
    const { deps, providers } = world();
    await sendVisitMessage(deps, visit);
    expect(await sendVisitMessage(deps, visit)).toBe("duplicate");
    expect(providers.telegram.sent).toHaveLength(1);
  });

  it("sends nothing when the owner has switched it off, or the parent has no chat", async () => {
    const off = world({ enabled: false });
    expect(await sendVisitMessage(off.deps, visit)).toBe("off");
    const noChat = world({ chat: null });
    expect(await sendVisitMessage(noChat.deps, visit)).toBe("no_chat");
    for (const each of [off, noChat]) {
      expect(each.providers.telegram.sent).toEqual([]);
      expect(each.providers.sms.sent).toEqual([]);
      expect(each.rows).toEqual([]);
    }
  });

  it("a failed send is logged as failed and is not retried by SMS", async () => {
    const { deps, providers } = world();
    providers.telegram.failFor.set("201", { ok: false, error: "blocked", permanent: true });
    expect(await sendVisitMessage(deps, visit)).toBe("failed");
    expect(providers.sms.sent).toEqual([]);
  });
});
