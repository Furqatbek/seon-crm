import { createVerify, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  notifyAccount,
  notifyStudent,
  runAppNotifications,
  studentPush,
  type AppAccount,
  type AppNotification,
  type AppNotifyStore,
} from "./app-notify";
import type { MessageLog, Outgoing } from "./deliver";
import { fakeProviders } from "./fake";
import { FcmSender, readServiceAccount, type PushMessage, type PushResult, type PushSender } from "./fcm";
import { runPointsMessages, type PointsMessageData } from "./points-messages";
import { runReminders, type ReminderData } from "./reminders";
import type { Fetch } from "./types";

// Student app notifications — docs/STUDENT_APP_SPEC.md → "Rules → Notifications".

const account = (overrides: Partial<AppAccount> = {}): AppAccount => ({
  profileId: "profile-1",
  language: "uz",
  messageLanguage: "uz",
  tokens: ["token-a"],
  ...overrides,
});

function fakeStore(accounts: Record<string, AppAccount> = {}) {
  const rows: Array<{ profileId: string } & AppNotification> = [];
  const dropped: string[] = [];
  const store: AppNotifyStore = {
    accountOfStudent: async (studentId) => accounts[studentId] ?? null,
    insert: async (profileId, notification) => {
      if (rows.some((row) => row.profileId === profileId && row.dedupeKey === notification.dedupeKey)) return false;
      rows.push({ profileId, ...notification });
      return true;
    },
    dropToken: async (token) => void dropped.push(token),
  };
  return { store, rows, dropped };
}

function fakePush(results: Record<string, PushResult> = {}) {
  const sent: Array<{ token: string } & PushMessage> = [];
  const push: PushSender = {
    send: async (token, message) => {
      const result = results[token] ?? { ok: true };
      if (result.ok) sent.push({ token, ...message });
      return result;
    },
  };
  return { push, sent };
}

const note: AppNotification = { type: "points_deduction", title: "Seon", body: "2 tanga olindi", data: { screen: "coins" }, dedupeKey: "deduction:1:student" };

function memoryLog() {
  const rows: Outgoing[] = [];
  const log: MessageLog = {
    begin: async (message) => (rows.some((row) => row.dedupeKey === message.dedupeKey) ? null : (rows.push(message), String(rows.length))),
    finish: async () => {},
  };
  return { log, rows };
}

describe("notify service", () => {
  it("writes a notifications row and pushes to every phone", async () => {
    const { store, rows } = fakeStore();
    const { push, sent } = fakePush();
    const outcome = await notifyAccount({ store, push }, account({ tokens: ["token-a", "token-b"] }), note);
    expect(outcome).toBe("pushed");
    expect(rows).toEqual([{ profileId: "profile-1", ...note }]);
    expect(sent).toEqual([
      { token: "token-a", title: "Seon", body: "2 tanga olindi", data: { type: "points_deduction", screen: "coins" } },
      { token: "token-b", title: "Seon", body: "2 tanga olindi", data: { type: "points_deduction", screen: "coins" } },
    ]);
  });

  it("with no device token the row is still written, and the caller is told to use Telegram", async () => {
    const { store, rows } = fakeStore();
    const { push, sent } = fakePush();
    expect(await notifyAccount({ store, push }, account({ tokens: [] }), note)).toBe("stored");
    expect(rows).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it("tells nobody twice: the same key is a duplicate and is not pushed again", async () => {
    const { store, rows } = fakeStore();
    const { push, sent } = fakePush();
    await notifyAccount({ store, push }, account(), note);
    expect(await notifyAccount({ store, push }, account(), note)).toBe("duplicate");
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("forgets a token Firebase no longer knows, and falls back when no phone took the push", async () => {
    const { store, dropped } = fakeStore();
    const { push } = fakePush({ gone: { ok: false, error: "FCM 404", unregistered: true }, flaky: { ok: false, error: "FCM 503" } });
    expect(await notifyAccount({ store, push }, account({ tokens: ["gone", "flaky"] }), note)).toBe("stored");
    expect(dropped).toEqual(["gone"]);
    // One phone that works is enough.
    expect(await notifyAccount({ store, push }, account({ tokens: ["gone", "token-a"] }), { ...note, dedupeKey: "other" })).toBe("pushed");
  });

  it("a student without an app account gets nothing here: Telegram is used", async () => {
    const { store, rows } = fakeStore();
    const { push } = fakePush();
    expect(await notifyStudent({ store, push }, "student-1", () => note)).toBe("none");
    expect(rows).toEqual([]);
  });

  it("an error in the app never stops the Telegram message", async () => {
    const { push } = fakePush();
    const store: AppNotifyStore = {
      accountOfStudent: async () => {
        throw new Error("database is down");
      },
      insert: async () => true,
      dropToken: async () => {},
    };
    const app = studentPush({ store, push }, async () => "Seon");
    expect(await app("student-1", "lesson_reminder", "key", () => "text")).toBe("none");
  });

  it("announces a linked account once, in the app's language, Korean included", async () => {
    const { store, rows } = fakeStore();
    const { push, sent } = fakePush();
    const linked = [
      { account: account({ profileId: "p-ko", language: "ko", tokens: ["ko-phone"] }), linkedAt: "2026-11-26T09:00:00Z" },
      { account: account({ profileId: "p-uz", tokens: [] }), linkedAt: "2026-11-26T09:05:00Z" },
    ];
    const texts = (language: string) => (key: string, values?: Record<string, string | number>) => `${language}:${key}:${values?.centre ?? ""}`;
    const deps = { store, push, texts, data: { centreName: async () => "Seon", linkedSince: async () => linked } };
    const now = new Date("2026-11-26T09:15:00Z");
    expect(await runAppNotifications(now, deps)).toEqual({ pushed: 1, stored: 1, duplicate: 0 });
    expect(await runAppNotifications(now, deps)).toEqual({ pushed: 0, stored: 0, duplicate: 2 });
    expect(rows.map((row) => [row.profileId, row.type, row.title, row.body])).toEqual([
      ["p-ko", "account_linked", "ko:account_linked.title:", "ko:account_linked.body:Seon"],
      ["p-uz", "account_linked", "uz:account_linked.title:", "uz:account_linked.body:Seon"],
    ]);
    expect(sent).toHaveLength(1);
  });
});

describe("student messages: push when the app is installed, otherwise Telegram", () => {
  const templates = [
    { type: "lesson_reminder" as const, channel: "telegram" as const, language: "uz" as const, body: "{student}: {group} darsi {time} da" },
    { type: "lesson_reminder" as const, channel: "telegram" as const, language: "ru" as const, body: "{student}: урок {group} в {time}" },
    { type: "points_deduction" as const, channel: "telegram" as const, language: "uz" as const, body: "{student}dan {points} tanga olindi" },
  ];
  const settings = { centreName: "Seon", billingDay: 1, dueDay: 5, remindersEnabled: true, lessonReminderHours: 3, quietFrom: "21:00", quietTo: "09:00" };
  // 12:00 in Tashkent; the lesson is at 15:00.
  const now = new Date("2026-11-26T07:00:00Z");
  const chat = (chatId: number) => ({ chatId, language: "uz" as const });
  const student = (id: string, studentChat: number | null, parentChat: number | null) => ({
    id,
    fullName: `Student ${id}`,
    language: "uz" as const,
    studentChat: studentChat ? chat(studentChat) : null,
    parentChat: parentChat ? chat(parentChat) : null,
    parentPhone: null,
    phone: null,
  });
  const reminderData = (students: ReturnType<typeof student>[]): ReminderData => ({
    settings: async () => settings,
    templates: async () => templates,
    debtors: async () => [],
    lessons: async () => [{ lessonId: "lesson-1", groupName: "TOPIK I", lessonDate: "2026-11-26", startTime: "15:00", students }],
  });

  it("a lesson reminder goes by push to a student with the app, and to Telegram for the others", async () => {
    const { store, rows } = fakeStore({
      withApp: account({ profileId: "p-app", messageLanguage: "ru" }),
      noPhone: account({ profileId: "p-no-phone", tokens: [] }),
    });
    const { push, sent } = fakePush();
    const providers = fakeProviders();
    const { log, rows: messages } = memoryLog();
    const data = reminderData([student("withApp", 101, 201), student("noPhone", 102, null), student("telegramOnly", 103, null), student("appOnly", null, null)]);
    const app = studentPush({ store, push }, async () => "Seon");

    const summary = await runReminders(now, { data, log, providers, app });
    expect(summary).toMatchObject({ sent: 3, failed: 0 });
    // The app account is written to in its own message language, under the centre's name.
    expect(sent).toEqual([{ token: "token-a", title: "Seon", body: "Student withApp: урок TOPIK I в 15:00", data: { type: "lesson_reminder" } }]);
    // No device token: the row is written and the reminder goes to the student's Telegram.
    expect(rows.map((row) => row.profileId)).toEqual(["p-app", "p-no-phone"]);
    expect(providers.telegram.sent.map((message) => message.recipient)).toEqual(["102", "103"]);
    expect(messages.map((message) => message.studentId)).toEqual(["noPhone", "telegramOnly"]);

    // A second run sends nothing again, on either road.
    const again = await runReminders(now, { data, log, providers, app });
    expect(again).toMatchObject({ sent: 0, duplicate: 3 });
    expect(sent).toHaveLength(1);
    expect(providers.telegram.sent).toHaveLength(2);
  });

  it("a reminder that would land in quiet hours is not pushed either", async () => {
    const { store, rows } = fakeStore({ withApp: account() });
    const { push, sent } = fakePush();
    const providers = fakeProviders();
    const { log } = memoryLog();
    // 06:30 in Tashkent for a lesson at 09:30.
    const early = new Date("2026-11-26T01:30:00Z");
    const data: ReminderData = { ...reminderData([student("withApp", 101, null)]), lessons: async () => [{ lessonId: "lesson-1", groupName: "TOPIK I", lessonDate: "2026-11-26", startTime: "09:30", students: [student("withApp", 101, null)] }] };
    const summary = await runReminders(early, { data, log, providers, app: studentPush({ store, push }, async () => "Seon") });
    expect(summary).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("coins taken away: the student is pushed, the parent keeps Telegram", async () => {
    const { store } = fakeStore({ "student-1": account() });
    const { push, sent } = fakePush();
    const providers = fakeProviders();
    const { log } = memoryLog();
    const chats = { studentChat: chat(101), parentChat: chat(201) };
    const data: PointsMessageData = {
      settings: async () => ({ centreName: "Seon", remindersEnabled: true, pointsEnabled: true, quietFrom: "21:00", quietTo: "09:00", weeklyDay: 7, weeklyTime: "18:00" }),
      templates: async () => templates,
      linkedStudents: async () => [],
      summary: async () => ({ student_id: "student-1", name: "Akmal", active: true, month: "2026-11", balance: 8, week_points: 0, month_points: 0, centre_rank: null, groups: [], perfect_month_bonus: 0, last: [], next_reward: null }),
      deductions: async () => [{ ledgerId: "ledger-1", studentId: "student-1", points: 2, groupName: "TOPIK I", reason: "late", preset: null, ...chats }],
      rewardEvents: async () => [],
    };
    const texts = () => (key: string) => key;
    const result = await runPointsMessages(now, { data, log, providers, texts, app: studentPush({ store, push }, async () => "Seon") });
    expect(result).toMatchObject({ sent: 2, failed: 0 });
    expect(sent.map((message) => message.body)).toEqual(["Akmaldan 2 tanga olindi"]);
    // Only the parent's chat got the Telegram message.
    expect(providers.telegram.sent.map((message) => message.recipient)).toEqual(["201"]);
  });

  it("an order marked Ready sends the student exactly one push", async () => {
    const { store, rows } = fakeStore({ "student-1": account() });
    const { push, sent } = fakePush();
    const providers = fakeProviders();
    const { log } = memoryLog();
    const chats = { studentChat: chat(101), parentChat: chat(201) };
    const order = { redemptionId: "order-1", studentId: "student-1", reward: "T-shirt", cost: 100, note: null, ...chats };
    let events: PointsMessageData["rewardEvents"] = async () => [{ ...order, update: "requested" }, { ...order, update: "ready" }];
    const data: PointsMessageData = {
      settings: async () => ({ centreName: "Seon", remindersEnabled: true, pointsEnabled: true, quietFrom: "21:00", quietTo: "09:00", weeklyDay: 7, weeklyTime: "18:00" }),
      templates: async () => [{ type: "reward_update" as const, channel: "telegram" as const, language: "uz" as const, body: "{reward}: {update}" }],
      linkedStudents: async () => [],
      summary: async () => ({ student_id: "student-1", name: "Akmal", active: true, month: "2026-11", balance: 28, week_points: 0, month_points: 0, centre_rank: null, groups: [], perfect_month_bonus: 0, last: [], next_reward: null }),
      deductions: async () => [],
      rewardEvents: (since) => events(since),
    };
    const texts = () => (key: string) => key;
    const deps = { data, log, providers, texts, app: studentPush({ store, push }, async () => "Seon") };
    const ready = () => sent.filter((message) => message.body === "T-shirt: reward.ready");

    // Mark ready sends at once; the job that runs every few minutes sees the same order again.
    await runPointsMessages(now, deps);
    await runPointsMessages(now, deps);
    expect(ready()).toHaveLength(1);
    expect(ready()[0]).toMatchObject({ token: "token-a", title: "Seon", data: { type: "reward_update" } });
    expect(rows.filter((row) => row.body === "T-shirt: reward.ready")).toHaveLength(1);
    // The parent hears on Telegram, once; the student's own chat is not written to as well.
    expect(providers.telegram.sent.filter((message) => message.body.includes("reward.ready")).map((message) => message.recipient)).toEqual(["201"]);

    // Given later is its own message and does not repeat Ready.
    events = async () => [{ ...order, update: "ready" }, { ...order, update: "given" }];
    await runPointsMessages(now, deps);
    expect(ready()).toHaveLength(1);
    expect(sent.map((message) => message.body)).toEqual(["T-shirt: reward.requested", "T-shirt: reward.ready", "T-shirt: reward.given"]);
  });
});

describe("Firebase push (FCM HTTP v1)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { project_id: "seon-app", client_email: "push@seon-app.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  const now = new Date("2026-11-26T07:00:00Z");
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  function server(reply: (url: string, call: number) => Response) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: Fetch = async (url, init) => {
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") return json(200, { access_token: `access-${calls.filter((call) => call.url === url).length}`, expires_in: 3600 });
      return reply(url, calls.filter((call) => call.url === url).length);
    };
    return { calls, fetch };
  }

  it("reads the service account as JSON, as base64, and with escaped line breaks", () => {
    const raw = JSON.stringify(key);
    expect(readServiceAccount(raw)).toEqual(key);
    expect(readServiceAccount(Buffer.from(raw).toString("base64"))).toEqual(key);
    expect(readServiceAccount(JSON.stringify({ ...key, private_key: key.private_key.replace(/\n/g, "\\n") }))).toEqual(key);
    expect(readServiceAccount(undefined)).toBeNull();
    expect(readServiceAccount("not a key")).toBeNull();
    expect(readServiceAccount(JSON.stringify({ project_id: "x" }))).toBeNull();
  });

  it("signs in with the service account once and sends each message with the token", async () => {
    const { calls, fetch } = server(() => json(200, { name: "projects/seon-app/messages/1" }));
    const sender = new FcmSender({ account: key, fetch, now: () => now });
    expect(await sender.send("device-1", { title: "Seon", body: "Dars 15:00 da", data: { screen: "home" } })).toEqual({ ok: true });
    expect(await sender.send("device-2", { title: "Seon", body: "Dars 15:00 da" })).toEqual({ ok: true });

    const tokenCalls = calls.filter((call) => call.url === "https://oauth2.googleapis.com/token");
    expect(tokenCalls).toHaveLength(1);
    const assertion = new URLSearchParams(String(tokenCalls[0].init?.body)).get("assertion")!;
    const [header, claims, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now.getTime() / 1000,
      exp: now.getTime() / 1000 + 3600,
    });
    expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);

    const sends = calls.filter((call) => call.url === "https://fcm.googleapis.com/v1/projects/seon-app/messages:send");
    expect(sends).toHaveLength(2);
    expect((sends[0].init?.headers as Record<string, string>).authorization).toBe("Bearer access-1");
    expect(JSON.parse(String(sends[0].init?.body))).toEqual({
      message: { token: "device-1", notification: { title: "Seon", body: "Dars 15:00 da" }, data: { screen: "home" } },
    });
    expect(JSON.parse(String(sends[1].init?.body)).message).not.toHaveProperty("data");
  });

  it("says when a token is no longer registered, so it can be forgotten", async () => {
    const { fetch } = server(() => json(404, { error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }));
    const result = await new FcmSender({ account: key, fetch, now: () => now }).send("device-1", { title: "t", body: "b" });
    expect(result).toEqual({ ok: false, error: "FCM 404: Requested entity was not found.", unregistered: true });
  });

  it("a message Firebase refuses for its content does not cost the phone its token", async () => {
    const { fetch } = server(() => json(400, { error: { message: "Message too big", status: "INVALID_ARGUMENT", details: [{ errorCode: "INVALID_ARGUMENT" }] } }));
    expect(await new FcmSender({ account: key, fetch, now: () => now }).send("d", { title: "t", body: "b" })).toEqual({ ok: false, error: "FCM 400: Message too big" });
  });

  it("a server error is a failure, not a dead token; an expired access token is renewed once", async () => {
    const down = server(() => json(503, { error: { message: "Unavailable", status: "UNAVAILABLE" } }));
    expect(await new FcmSender({ account: key, fetch: down.fetch, now: () => now }).send("d", { title: "t", body: "b" })).toEqual({ ok: false, error: "FCM 503: Unavailable" });

    const expired = server((_url, call) => (call === 1 ? json(401, { error: { message: "Expired", status: "UNAUTHENTICATED" } }) : json(200, {})));
    expect(await new FcmSender({ account: key, fetch: expired.fetch, now: () => now }).send("d", { title: "t", body: "b" })).toEqual({ ok: true });
    expect(expired.calls.filter((call) => call.url.includes("oauth2")).length).toBe(2);
  });

  it("fails every push, without calling anything, while the service account is not set", async () => {
    const { calls, fetch } = server(() => json(200, {}));
    const sender = new FcmSender({ account: null, fetch });
    expect(sender.configured).toBe(false);
    expect(await sender.send("d", { title: "t", body: "b" })).toEqual({ ok: false, error: "Push is not configured" });
    expect(calls).toEqual([]);
  });
});
