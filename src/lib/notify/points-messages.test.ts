import { describe, expect, it } from "vitest";

import { botTexts } from "./bot-texts";
import type { MessageLog, Outgoing } from "./deliver";
import { fakeProviders } from "./fake";
import type { PointsSummary } from "./points-data";
import {
  runPointsMessages,
  tashkentClock,
  type DeductionEvent,
  type LinkedStudent,
  type PointsMessageData,
  type PointsSettings,
  type PointsTemplate,
  type RewardEvent,
} from "./points-messages";
import { runReminders, type DebtCandidate, type LessonCandidate, type ReminderData, type Template } from "./reminders";
import { routesFor, type ChatLink, type Reach } from "./rules";
import type { Language, MessageType } from "./types";

// The points messages and the routing table, with the FakeProvider: nothing
// here reaches Telegram, an SMS gateway or a database.

type Row = Outgoing & { id: string; status: string };
function memoryLog() {
  const rows: Row[] = [];
  const log: MessageLog = {
    async begin(message, status) {
      if (rows.some((row) => row.dedupeKey === message.dedupeKey)) return null;
      rows.push({ ...message, id: String(rows.length + 1), status });
      return String(rows.length);
    },
    async finish(id, result) {
      rows.find((row) => row.id === id)!.status = result.status;
    },
  };
  return { rows, log };
}

const SETTINGS: PointsSettings = {
  centreName: "Seon",
  remindersEnabled: true,
  pointsEnabled: true,
  quietFrom: "21:00",
  quietTo: "09:00",
  weeklyDay: 7,
  weeklyTime: "18:00",
};

const TEMPLATES: PointsTemplate[] = (["uz", "ru", "en"] as const).flatMap((language) => [
  { type: "points_weekly", channel: "telegram", language, body: `[${language}] {student} week {week_points}, total {balance}, {group} #{group_rank}, centre #{centre_rank}. {goal}` },
  { type: "points_deduction", channel: "telegram", language, body: `[${language}] {student} lost {points} in {group}: {reason}. Balance {balance}.` },
  { type: "points_month_result", channel: "telegram", language, body: `[${language}] {month}: {student} {month_points}, {group} #{group_rank}, centre #{centre_rank}. {bonus}` },
  { type: "reward_update", channel: "telegram", language, body: `[${language}] {student}, {reward}: {update}` },
]);

const chat = (chatId: number, language: Language = "uz"): ChatLink => ({ chatId, language });
const summary = (id: string, extra: Partial<PointsSummary> = {}): PointsSummary => ({
  student_id: id,
  name: `Student ${id}`,
  active: true,
  month: "2026-11",
  balance: 92,
  week_points: 14,
  month_points: 44,
  centre_rank: 7,
  groups: [{ name: "English B1", points: 30, rank: 2 }],
  perfect_month_bonus: 0,
  last: [],
  next_reward: { name: "T-shirt", cost: 100, needed: 8 },
  ...extra,
});

function setup(options: {
  students?: LinkedStudent[];
  summaries?: Record<string, PointsSummary>;
  deductions?: Array<DeductionEvent & { at: string }>;
  rewards?: Array<RewardEvent & { at: string }>;
  settings?: Partial<PointsSettings>;
} = {}) {
  const providers = fakeProviders();
  const { rows, log } = memoryLog();
  const asked: Array<{ id: string; month?: string }> = [];
  const data: PointsMessageData = {
    settings: async () => ({ ...SETTINGS, ...options.settings }),
    templates: async () => TEMPLATES,
    linkedStudents: async () => options.students ?? [],
    async summary(id, month) {
      asked.push({ id, month });
      const found = options.summaries?.[id] ?? summary(id);
      return month ? { ...found, month } : found;
    },
    deductions: async (since, until) =>
      (options.deductions ?? []).filter((event) => new Date(event.at) >= since && new Date(event.at) <= until),
    rewardEvents: async (since) => (options.rewards ?? []).filter((event) => new Date(event.at) >= since),
  };
  /** A run at a Tashkent wall-clock time, "YYYY-MM-DDTHH:MM". */
  const run = (tashkent: string) => runPointsMessages(new Date(`${tashkent}:00+05:00`), { data, log, providers, texts: botTexts });
  return { providers, rows, run, asked };
}

// 2026-11-15 is a Sunday; 2026-12-01 a Tuesday.
const SUNDAY_EVENING = "2026-11-15T18:00";

describe("the routing table: who gets what", () => {
  const both: Reach = { studentChat: chat(501, "uz"), parentChat: chat(900, "ru"), parentPhone: "+998901234567", phone: "+998907654321" };
  const onlyParent: Reach = { ...both, studentChat: null };
  const onlyStudent: Reach = { ...both, parentChat: null };
  const noChats: Reach = { ...both, studentChat: null, parentChat: null };
  const to = (type: MessageType, reach: Reach) => routesFor(type, reach).map((route) => `${route.channel}:${route.recipient}`);

  it("payment due and overdue: the parent's chat, never the student's; SMS to the parent's phone if there is no parent chat", () => {
    for (const type of ["payment_due", "payment_overdue"] as const) {
      expect(to(type, both)).toEqual(["telegram:900"]);
      expect(to(type, onlyParent)).toEqual(["telegram:900"]);
      expect(to(type, onlyStudent)).toEqual(["sms:+998901234567"]);
      expect(to(type, noChats)).toEqual(["sms:+998901234567"]);
    }
  });

  it("lesson reminder: the student's chat; the parent's only if the student has none; never SMS", () => {
    expect(to("lesson_reminder", both)).toEqual(["telegram:501"]);
    expect(to("lesson_reminder", onlyStudent)).toEqual(["telegram:501"]);
    expect(to("lesson_reminder", onlyParent)).toEqual(["telegram:900"]);
    expect(to("lesson_reminder", noChats)).toEqual([]);
  });

  it("weekly summary, points taken away, month results and reward updates: both chats, never SMS", () => {
    for (const type of ["points_weekly", "points_deduction", "points_month_result", "reward_update"] as const) {
      expect(to(type, both)).toEqual(["telegram:501", "telegram:900"]);
      expect(to(type, onlyParent)).toEqual(["telegram:900"]);
      expect(to(type, onlyStudent)).toEqual(["telegram:501"]);
      expect(to(type, noChats)).toEqual([]);
    }
  });

  it("each chat is written to in its own language", () => {
    expect(routesFor("points_weekly", both).map((route) => [route.role, route.language])).toEqual([
      ["student", "uz"],
      ["parent", "ru"],
    ]);
  });

  it("the reminders job follows it: a payment message to the parent in the parent chat's language, a lesson reminder to the student", async () => {
    const providers = fakeProviders();
    const { rows, log } = memoryLog();
    const person = { id: "a", fullName: "Aziza", language: "uz" as Language, ...both };
    const templates: Template[] = (["uz", "ru"] as const).flatMap((language) => [
      { type: "payment_due", channel: "telegram", language, body: `[${language}] pay {amount}` },
      { type: "lesson_reminder", channel: "telegram", language, body: `[${language}] lesson {time}` },
    ]);
    const debtor: DebtCandidate = { ...person, debt: 600_000, chargedMonths: ["2026-11"] };
    const lesson: LessonCandidate = { lessonId: "L1", groupName: "B1", lessonDate: "2026-11-01", startTime: "13:00", students: [person] };
    const data: ReminderData = {
      settings: async () => ({ centreName: "Seon", billingDay: 1, dueDay: 5, remindersEnabled: true, lessonReminderHours: 3, quietFrom: "21:00", quietTo: "09:00" }),
      templates: async () => templates,
      debtors: async () => [debtor],
      lessons: async () => [lesson],
    };
    await runReminders(new Date("2026-11-01T10:00:00+05:00"), { data, log, providers });
    expect(providers.telegram.sent).toEqual([
      { recipient: "900", body: "[ru] pay 600 000" },
      { recipient: "501", body: "[uz] lesson 13:00" },
    ]);
    expect(providers.sms.sent).toEqual([]);
    expect(rows.map((row) => row.type)).toEqual(["payment_due", "lesson_reminder"]);
  });
});

describe("weekly summary", () => {
  const student: LinkedStudent = { id: "a", studentChat: chat(501, "uz"), parentChat: chat(900, "en") };

  it("goes on Sunday from 18:00 to the student and the parent, each in their chat's language", async () => {
    const world = setup({ students: [student] });
    expect(await world.run("2026-11-15T17:45")).toEqual({ sent: 0, failed: 0, duplicate: 0 });
    expect(await world.run("2026-11-14T18:00")).toEqual({ sent: 0, failed: 0, duplicate: 0 });
    expect(await world.run(SUNDAY_EVENING)).toEqual({ sent: 2, failed: 0, duplicate: 0 });
    expect(world.providers.telegram.sent).toEqual([
      { recipient: "501", body: "[uz] Student a week 14, total 92, English B1 #2, centre #7. “T-shirt” uchun yana 8 ball kerak." },
      { recipient: "900", body: "[en] Student a week 14, total 92, English B1 #2, centre #7. 8 more points for “T-shirt”." },
    ]);
    expect(world.rows.map((row) => row.dedupeKey)).toEqual(["weekly:a:student:2026-11-09", "weekly:a:parent:2026-11-09"]);
  });

  it("is sent once a week however often the job runs", async () => {
    const world = setup({ students: [student] });
    await world.run(SUNDAY_EVENING);
    expect(await world.run("2026-11-15T18:15")).toEqual({ sent: 0, failed: 0, duplicate: 2 });
    expect(await world.run("2026-11-15T20:45")).toEqual({ sent: 0, failed: 0, duplicate: 2 });
    expect(world.providers.telegram.sent).toHaveLength(2);
    // Next Sunday is a new week.
    expect((await world.run("2026-11-22T18:00")).sent).toBe(2);
  });

  it("a parent with two children gets one summary for each child", async () => {
    const world = setup({
      students: [
        { id: "a", studentChat: null, parentChat: chat(900, "ru") },
        { id: "b", studentChat: chat(502, "uz"), parentChat: chat(900, "ru") },
      ],
    });
    await world.run(SUNDAY_EVENING);
    expect(world.providers.telegram.sent.map((message) => [message.recipient, message.body.slice(0, 14)])).toEqual([
      ["900", "[ru] Student a"],
      ["502", "[uz] Student b"],
      ["900", "[ru] Student b"],
    ]);
  });

  it("is not sent for inactive students, or for a student in no group", async () => {
    const world = setup({
      students: [
        { id: "paused", studentChat: chat(501), parentChat: chat(900) },
        { id: "nogroup", studentChat: chat(502), parentChat: null },
        { id: "ok", studentChat: chat(503), parentChat: null },
      ],
      summaries: { paused: summary("paused", { active: false }), nogroup: summary("nogroup", { groups: [] }) },
    });
    expect(await world.run(SUNDAY_EVENING)).toEqual({ sent: 1, failed: 0, duplicate: 0 });
    expect(world.providers.telegram.sent.map((message) => message.recipient)).toEqual(["503"]);
  });

  it("leaves out the reward sentence when there is nothing left to save for", async () => {
    const world = setup({ students: [{ id: "a", studentChat: chat(501, "en"), parentChat: null }], summaries: { a: summary("a", { next_reward: null }) } });
    await world.run(SUNDAY_EVENING);
    expect(world.providers.telegram.sent[0].body).toBe("[en] Student a week 14, total 92, English B1 #2, centre #7.");
  });

  it("stops with the programme or with reminders switched off, and follows the day and time in Settings", async () => {
    expect(await setup({ students: [student], settings: { pointsEnabled: false } }).run(SUNDAY_EVENING)).toEqual({ sent: 0, failed: 0, duplicate: 0 });
    expect(await setup({ students: [student], settings: { remindersEnabled: false } }).run(SUNDAY_EVENING)).toEqual({ sent: 0, failed: 0, duplicate: 0, idle: "reminders_off" });
    const friday = setup({ students: [student], settings: { weeklyDay: 5, weeklyTime: "16:30" } });
    expect((await friday.run("2026-11-13T16:15")).sent).toBe(0);
    expect((await friday.run("2026-11-13T16:30")).sent).toBe(2);
    expect((await friday.run(SUNDAY_EVENING)).sent).toBe(0);
  });
});

describe("points messages are Telegram only", () => {
  it("a student with no chat gets nothing, not even an SMS", async () => {
    const event: DeductionEvent & { at: string } = {
      ledgerId: "L1", studentId: "a", points: 3, groupName: "B1", reason: "Talking", preset: null,
      studentChat: null, parentChat: null, at: "2026-11-16T12:00:00+05:00",
    };
    const world = setup({ students: [{ id: "a", studentChat: null, parentChat: null }], deductions: [event] });
    await world.run("2026-11-16T12:15");
    await world.run("2026-11-22T18:00");
    expect(world.providers.telegram.sent).toEqual([]);
    expect(world.providers.sms.sent).toEqual([]);
    expect(world.rows).toEqual([]);
  });

  it("a message that fails on Telegram is logged as failed and is not tried by SMS", async () => {
    const world = setup({ students: [{ id: "a", studentChat: chat(501), parentChat: chat(900) }] });
    world.providers.telegram.failFor.set("501", { ok: false, error: "Telegram 403: blocked", permanent: true });
    expect(await world.run(SUNDAY_EVENING)).toEqual({ sent: 1, failed: 1, duplicate: 0 });
    expect(world.providers.sms.sent).toEqual([]);
    expect(world.rows.map((row) => [row.channel, row.recipient, row.status])).toEqual([
      ["telegram", "501", "failed"],
      ["telegram", "900", "sent"],
    ]);
  });
});

describe("points taken away", () => {
  const event = (at: string, extra: Partial<DeductionEvent> = {}): DeductionEvent & { at: string } => ({
    ledgerId: "L1",
    studentId: "a",
    points: 3,
    groupName: "English B1",
    reason: null,
    preset: { uz: "Darsda telefon", ru: "Телефон на уроке", en: "Phone in class" },
    studentChat: chat(501, "uz"),
    parentChat: chat(900, "ru"),
    at,
    ...extra,
  });

  it("goes to both chats at the next run, with the group and the reason in each chat's language", async () => {
    const world = setup({ deductions: [event("2026-11-16T14:05:00+05:00")] });
    expect(await world.run("2026-11-16T14:15")).toEqual({ sent: 2, failed: 0, duplicate: 0 });
    expect(world.providers.telegram.sent).toEqual([
      { recipient: "501", body: "[uz] Student a lost 3 in English B1: Darsda telefon. Balance 92." },
      { recipient: "900", body: "[ru] Student a lost 3 in English B1: Телефон на уроке. Balance 92." },
    ]);
    expect(world.rows.map((row) => row.dedupeKey)).toEqual(["deduction:L1:student", "deduction:L1:parent"]);
    // Later runs find the same event and send nothing more.
    expect(await world.run("2026-11-16T14:30")).toEqual({ sent: 0, failed: 0, duplicate: 2 });
  });

  it("waits for the Undo window to pass", async () => {
    const world = setup({ deductions: [event("2026-11-16T14:14:50+05:00", { reason: "Talking", preset: null })] });
    expect((await world.run("2026-11-16T14:15")).sent).toBe(0);
    expect((await world.run("2026-11-16T14:30")).sent).toBe(2);
    expect(world.providers.telegram.sent[0].body).toContain(": Talking.");
  });

  it("in quiet hours it is held, not sent and not dropped, until they end", async () => {
    const world = setup({ deductions: [event("2026-11-16T20:55:00+05:00")] });
    for (const time of ["2026-11-16T21:00", "2026-11-16T23:45", "2026-11-17T08:45"]) {
      expect(await world.run(time)).toEqual({ sent: 0, failed: 0, duplicate: 0, idle: "quiet_hours" });
    }
    expect(world.rows).toEqual([]);
    expect(await world.run("2026-11-17T09:00")).toEqual({ sent: 2, failed: 0, duplicate: 0 });
    expect(world.providers.telegram.sent.map((message) => message.recipient)).toEqual(["501", "900"]);
  });

  it("an event older than two days is no longer announced", async () => {
    const world = setup({ deductions: [event("2026-11-10T12:00:00+05:00")] });
    expect((await world.run("2026-11-16T12:00")).sent).toBe(0);
  });
});

describe("month results", () => {
  it("go on the 1st from 10:00 for last month, with the perfect-month bonus when it was earned, once", async () => {
    const world = setup({
      students: [
        { id: "a", studentChat: chat(501, "en"), parentChat: null },
        { id: "b", studentChat: null, parentChat: chat(900, "uz") },
      ],
      summaries: { a: summary("a", { perfect_month_bonus: 10 }) },
    });
    expect((await world.run("2026-12-01T09:45")).sent).toBe(0);
    expect(await world.run("2026-12-01T10:00")).toEqual({ sent: 2, failed: 0, duplicate: 0 });
    expect(world.asked.filter((call) => call.month)).toEqual([
      { id: "a", month: "2026-11" },
      { id: "b", month: "2026-11" },
    ]);
    expect(world.providers.telegram.sent).toEqual([
      { recipient: "501", body: "[en] November: Student a 44, English B1 #2, centre #7. Perfect month bonus: +10." },
      { recipient: "900", body: "[uz] noyabr: Student b 44, English B1 #2, centre #7." },
    ]);
    expect(world.rows.map((row) => row.dedupeKey)).toEqual(["month_result:a:student:2026-11", "month_result:b:parent:2026-11"]);
    expect(await world.run("2026-12-01T10:15")).toEqual({ sent: 0, failed: 0, duplicate: 2 });
    expect((await world.run("2026-12-02T10:00")).sent).toBe(0);
  });
});

describe("reward updates", () => {
  const event = (update: RewardEvent["update"], at: string, note: string | null = null): RewardEvent & { at: string } => ({
    redemptionId: "R1", studentId: "a", reward: "T-shirt", cost: 100, update, note, at,
    studentChat: chat(501, "en"), parentChat: chat(900, "ru"),
  });

  it("request received, handed over, and rejected with the reason: one message each per chat", async () => {
    const world = setup({ rewards: [event("requested", "2026-11-16T11:00:00+05:00")] });
    await world.run("2026-11-16T11:15");
    expect(world.providers.telegram.sent).toEqual([
      { recipient: "501", body: "[en] Student a, T-shirt: request received, 100 points are held. Collect it at the front desk." },
      { recipient: "900", body: "[ru] Student a, T-shirt: запрос принят, 100 баллов удержано. Заберите на ресепшене." },
    ]);

    const handled = setup({
      rewards: [event("requested", "2026-11-16T11:00:00+05:00"), event("given", "2026-11-16T15:00:00+05:00")],
    });
    await handled.run("2026-11-16T15:15");
    expect(handled.rows.map((row) => row.dedupeKey)).toEqual([
      "reward:R1:requested:student",
      "reward:R1:requested:parent",
      "reward:R1:given:student",
      "reward:R1:given:parent",
    ]);
    expect(handled.providers.telegram.sent[2].body).toBe("[en] Student a, T-shirt: handed over. Enjoy!");
    expect(await handled.run("2026-11-16T15:30")).toEqual({ sent: 0, failed: 0, duplicate: 4 });

    const rejected = setup({ rewards: [event("rejected", "2026-11-16T15:00:00+05:00", "Wrong size")] });
    await rejected.run("2026-11-16T15:15");
    expect(rejected.providers.telegram.sent[0].body).toBe("[en] Student a, T-shirt: the request was declined (Wrong size). 100 points are back.");
  });
});

describe("tashkentClock", () => {
  it("gives the Tashkent weekday and the Monday of the week", () => {
    expect(tashkentClock(new Date("2026-11-15T18:00:00+05:00"))).toEqual({ day: "2026-11-15", time: "18:00", month: "2026-11", weekday: 7, weekStart: "2026-11-09" });
    // Late on Sunday in UTC is already Monday in Tashkent.
    expect(tashkentClock(new Date("2026-11-15T20:30:00Z"))).toMatchObject({ day: "2026-11-16", weekday: 1, weekStart: "2026-11-16" });
  });
});
