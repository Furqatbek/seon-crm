import { describe, expect, it } from "vitest";

import { deliver, type MessageLog, type Outgoing } from "./deliver";
import { EskizProvider } from "./eskiz";
import { fakeProviders } from "./fake";
import {
  runReminders,
  tashkentNow,
  type DebtCandidate,
  type LessonCandidate,
  type NotifySettings,
  type Recipient,
  type ReminderData,
  type Template,
} from "./reminders";
import {
  chooseChannel,
  dedupeKey,
  isQuiet,
  lessonReminderDue,
  overdueDays,
  overdueNumber,
  paymentMessageDue,
  smsRecipient,
} from "./rules";
import { TelegramProvider } from "./telegram";
import { amountValue, dateValue, monthValue, renderTemplate, toSmsText } from "./templates";
import type { Fetch } from "./types";

// ── Fixtures: nothing here reaches a network ──

type Row = Outgoing & { id: string; status: "queued" | "sent" | "failed" | "skipped"; error: string | null };

/** The messages table in memory, with its unique dedupe key. */
function memoryLog() {
  const rows: Row[] = [];
  const log: MessageLog = {
    async begin(message, status) {
      if (rows.some((row) => row.dedupeKey === message.dedupeKey)) return null;
      rows.push({ ...message, id: String(rows.length + 1), status, error: null });
      return String(rows.length);
    },
    async finish(id, result) {
      const row = rows.find((entry) => entry.id === id)!;
      row.status = result.status;
      row.error = result.error;
    },
  };
  return { rows, log };
}

const SETTINGS: NotifySettings = {
  centreName: "Seon",
  billingDay: 1,
  dueDay: 5,
  remindersEnabled: true,
  lessonReminderHours: 3,
  quietFrom: "21:00",
  quietTo: "09:00",
};

const TEMPLATES: Template[] = (["telegram", "sms"] as const).flatMap((channel) => [
  { type: "payment_due", channel, language: "uz", body: "{student} uchun {month} oyi to'lovi: {amount} so'm. {due_date} gacha. {centre}" },
  { type: "payment_due", channel, language: "ru", body: "Оплата за {month} для {student}: {amount} сум до {due_date}. {centre}" },
  { type: "payment_due", channel, language: "en", body: "The {month} fee for {student} is {amount} UZS. Pay by {due_date}. {centre}" },
  { type: "payment_overdue", channel, language: "uz", body: "{student}: {month} oyi to'lovi kechikdi. Qarz: {amount} so'm. {centre}" },
  { type: "payment_overdue", channel, language: "ru", body: "{student}: оплата за {month} просрочена. Долг: {amount} сум. {centre}" },
  { type: "payment_overdue", channel, language: "en", body: "{student}: the {month} fee is overdue. Owed: {amount} UZS. {centre}" },
  { type: "lesson_reminder", channel, language: "uz", body: "{student}, bugun soat {time} da {group} darsi bor. {centre}" },
  { type: "lesson_reminder", channel, language: "ru", body: "{student}, сегодня в {time} занятие {group}. {centre}" },
  { type: "lesson_reminder", channel, language: "en", body: "{student} has a {group} lesson today at {time}. {centre}" },
] satisfies Template[]);

const person = (id: string, extra: Partial<Recipient> = {}): Recipient => ({
  id,
  fullName: `Student ${id}`,
  language: "en",
  telegramChatId: null,
  parentPhone: null,
  phone: "+998901110000",
  ...extra,
});
const debtor = (id: string, extra: Partial<DebtCandidate> = {}): DebtCandidate => ({
  ...person(id),
  debt: 600_000,
  chargedMonths: ["2026-10", "2026-11"],
  ...extra,
});

function setup(options: { debtors?: DebtCandidate[]; lessons?: LessonCandidate[]; settings?: Partial<NotifySettings> } = {}) {
  const providers = fakeProviders();
  const { rows, log } = memoryLog();
  const state = { debtors: options.debtors ?? [], lessons: options.lessons ?? [] };
  const data: ReminderData = {
    settings: async () => ({ ...SETTINGS, ...options.settings }),
    templates: async () => TEMPLATES,
    debtors: async () => state.debtors,
    lessons: async (days) => state.lessons.filter((lesson) => days.includes(lesson.lessonDate)),
  };
  const run = (tashkent: string) => runReminders(new Date(`${tashkent}:00+05:00`), { data, log, providers });
  return { providers, rows, log, state, run };
}

// ── Channel choice ──

describe("channel choice", () => {
  const linked = { telegramChatId: 777, parentPhone: "+998901234567", phone: "+998907654321" };
  const unlinked = { ...linked, telegramChatId: null };

  it("payment messages go by Telegram when it is linked, else by SMS", () => {
    for (const type of ["payment_due", "payment_overdue"] as const) {
      expect(chooseChannel(type, linked)).toEqual({ channel: "telegram", recipient: "777" });
      expect(chooseChannel(type, unlinked)).toEqual({ channel: "sms", recipient: "+998901234567" });
    }
  });

  it("SMS goes to the parent's phone when there is one, otherwise the student's", () => {
    expect(smsRecipient(unlinked)).toBe("+998901234567");
    expect(smsRecipient({ ...unlinked, parentPhone: null })).toBe("+998907654321");
    expect(smsRecipient({ ...unlinked, parentPhone: "" })).toBe("+998907654321");
    expect(chooseChannel("payment_due", { telegramChatId: null, parentPhone: null, phone: null })).toBeNull();
  });

  it("lesson reminders are Telegram only", () => {
    expect(chooseChannel("lesson_reminder", linked)).toEqual({ channel: "telegram", recipient: "777" });
    expect(chooseChannel("lesson_reminder", unlinked)).toBeNull();
  });

  it("a custom message goes on the channel staff chose, if the student can be reached on it", () => {
    expect(chooseChannel("custom", linked, "sms")).toEqual({ channel: "sms", recipient: "+998901234567" });
    expect(chooseChannel("custom", linked, "telegram")).toEqual({ channel: "telegram", recipient: "777" });
    expect(chooseChannel("custom", unlinked, "telegram")).toBeNull();
  });
});

// ── Quiet hours ──

describe("quiet hours", () => {
  it("nothing is sent between 21:00 and 09:00", () => {
    expect(isQuiet("20:59", "21:00", "09:00")).toBe(false);
    expect(isQuiet("21:00", "21:00", "09:00")).toBe(true);
    expect(isQuiet("23:30", "21:00", "09:00")).toBe(true);
    expect(isQuiet("00:00", "21:00", "09:00")).toBe(true);
    expect(isQuiet("08:59", "21:00", "09:00")).toBe(true);
    expect(isQuiet("09:00", "21:00", "09:00")).toBe(false);
    expect(isQuiet("14:00", "21:00", "09:00")).toBe(false);
  });

  it("works for hours that do not cross midnight, and for none at all", () => {
    expect(isQuiet("13:30", "13:00", "14:00")).toBe(true);
    expect(isQuiet("14:00", "13:00", "14:00")).toBe(false);
    expect(isQuiet("03:00", "09:00", "09:00")).toBe(false);
    // Stored times come with seconds.
    expect(isQuiet("22:15", "21:00:00", "09:00:00")).toBe(true);
  });

  it("payment messages go from 10:00 on their day and wait for quiet hours to end", () => {
    const quiet = { from: "21:00", to: "09:00" };
    const on = (time: string) => paymentMessageDue({ day: "2026-11-01", time }, "2026-11-01", quiet);
    expect(on("09:45")).toBe(false);
    expect(on("10:00")).toBe(true);
    expect(on("20:45")).toBe(true);
    expect(on("21:00")).toBe(false);
    expect(paymentMessageDue({ day: "2026-11-02", time: "10:00" }, "2026-11-01", quiet)).toBe(false);
    // A centre whose quiet hours run to 11:00: the message waits until then.
    const late = { from: "21:00", to: "11:00" };
    expect(paymentMessageDue({ day: "2026-11-01", time: "10:30" }, "2026-11-01", late)).toBe(false);
    expect(paymentMessageDue({ day: "2026-11-01", time: "11:00" }, "2026-11-01", late)).toBe(true);
  });

  it("a lesson reminder that would land in quiet hours is skipped, not sent later", async () => {
    const student = person("a", { telegramChatId: 501 });
    const lesson: LessonCandidate = { lessonId: "L1", groupName: "English B1", lessonDate: "2026-11-14", startTime: "11:30", students: [student] };
    // Three hours before 11:30 is 08:30, inside quiet hours.
    const world = setup({ lessons: [lesson] });
    expect(await world.run("2026-11-14T08:30")).toMatchObject({ skipped: 1, sent: 0 });
    expect(world.providers.telegram.sent).toEqual([]);
    expect(world.rows).toMatchObject([{ status: "skipped", type: "lesson_reminder", dedupeKey: "lesson_reminder:L1:a" }]);
    // Quiet hours end, the lesson is closer: still nothing goes out.
    expect(await world.run("2026-11-14T09:00")).toMatchObject({ skipped: 0, sent: 0 });
    expect(world.providers.telegram.sent).toEqual([]);
  });

  it("payment messages wait until 09:00 has passed and then go once", async () => {
    // Quiet hours cover 10:00, so the due message waits for them to end.
    const world = setup({ debtors: [debtor("a")], settings: { quietFrom: "21:00", quietTo: "11:00" } });
    expect(await world.run("2026-11-01T10:15")).toMatchObject({ sent: 0 });
    expect(await world.run("2026-11-01T11:00")).toMatchObject({ sent: 1 });
    expect(await world.run("2026-11-01T11:15")).toMatchObject({ sent: 0, duplicate: 1 });
    expect(world.providers.sms.sent).toHaveLength(1);
  });
});

// ── Overdue schedule ──

describe("overdue schedule", () => {
  it("is the day after the due day, +7, +14, and then stops", () => {
    expect(overdueDays("2026-11", 5)).toEqual(["2026-11-06", "2026-11-13", "2026-11-20"]);
    expect(overdueNumber("2026-11-05", "2026-11", 5)).toBeNull();
    expect(overdueNumber("2026-11-06", "2026-11", 5)).toBe(1);
    expect(overdueNumber("2026-11-07", "2026-11", 5)).toBeNull();
    expect(overdueNumber("2026-11-13", "2026-11", 5)).toBe(2);
    expect(overdueNumber("2026-11-20", "2026-11", 5)).toBe(3);
    expect(overdueNumber("2026-11-27", "2026-11", 5)).toBeNull();
    expect(overdueNumber("2026-12-04", "2026-11", 5)).toBeNull();
  });

  it("runs into the next month when the due day is late", () => {
    expect(overdueDays("2026-11", 28)).toEqual(["2026-11-29", "2026-12-06", "2026-12-13"]);
    expect(overdueDays("2028-02", 28)).toEqual(["2028-02-29", "2028-03-07", "2028-03-14"]);
  });

  it("a debtor gets exactly three overdue messages over a month of runs, one per day planned", async () => {
    const world = setup({ debtors: [debtor("a", { telegramChatId: 501 })] });
    // Every 15 minutes is too slow for a test: 10:00 and 14:00 each day of November.
    for (let day = 2; day <= 30; day += 1) {
      for (const time of ["10:00", "14:00"]) await world.run(`2026-11-${String(day).padStart(2, "0")}T${time}`);
    }
    expect(world.rows.map((row) => row.dedupeKey)).toEqual([
      "payment_overdue:a:2026-11:1",
      "payment_overdue:a:2026-11:2",
      "payment_overdue:a:2026-11:3",
    ]);
    expect(world.providers.telegram.sent).toHaveLength(3);
    expect(world.providers.telegram.sent[0].body).toBe("Student a: the November fee is overdue. Owed: 600 000 UZS. Seon");
    // December comes: nothing more for November.
    for (let day = 1; day <= 4; day += 1) await world.run(`2026-12-0${day}T10:00`);
    expect(world.providers.telegram.sent).toHaveLength(3);
  });

  it("stops as soon as the balance is no longer below zero", async () => {
    const world = setup({ debtors: [debtor("a")] });
    await world.run("2026-11-06T10:00");
    expect(world.providers.sms.sent).toHaveLength(1);
    world.state.debtors = [];
    await world.run("2026-11-13T10:00");
    await world.run("2026-11-20T10:00");
    expect(world.providers.sms.sent).toHaveLength(1);
  });

  it("is only for a month the student was charged for, and not before 10:00", async () => {
    const world = setup({ debtors: [debtor("a", { chargedMonths: ["2026-10"] })] });
    expect(await world.run("2026-11-06T10:00")).toMatchObject({ sent: 0 });
    const early = setup({ debtors: [debtor("a")] });
    expect(await early.run("2026-11-06T09:45")).toMatchObject({ sent: 0 });
    expect(await early.run("2026-11-06T10:00")).toMatchObject({ sent: 1 });
  });
});

// ── Payment due ──

describe("payment due", () => {
  it("goes at 10:00 on the billing day to students charged for this month who owe money", async () => {
    const world = setup({
      debtors: [
        debtor("a", { telegramChatId: 501, language: "uz", fullName: "Aziza Yoʻldosheva" }),
        debtor("b", { language: "ru", parentPhone: "+998901234567", debt: 340_000 }),
        debtor("c", { chargedMonths: ["2026-10"] }), // owes from October, not billed for November
      ],
    });
    expect(await world.run("2026-11-01T10:00")).toMatchObject({ sent: 2, failed: 0 });
    expect(world.providers.telegram.sent).toEqual([
      { recipient: "501", body: "Aziza Yoʻldosheva uchun noyabr oyi to'lovi: 600 000 so'm. 5-noyabr gacha. Seon" },
    ]);
    expect(world.providers.sms.sent).toEqual([
      { recipient: "+998901234567", body: "Оплата за ноябрь для Student b: 340 000 сум до 5 ноября. Seon" },
    ]);
    // Not on any other day.
    expect(await world.run("2026-11-02T10:00")).toMatchObject({ sent: 0 });
  });

  it("does nothing when reminders are switched off", async () => {
    const world = setup({ debtors: [debtor("a")], settings: { remindersEnabled: false } });
    expect(await world.run("2026-11-01T10:00")).toMatchObject({ sent: 0, idle: "reminders_off" });
    expect(world.rows).toEqual([]);
  });
});

// ── Dedupe ──

describe("dedupe", () => {
  it("every kind of message has its own key", () => {
    expect(dedupeKey.paymentDue("s", "2026-11")).toBe("payment_due:s:2026-11");
    expect(dedupeKey.paymentOverdue("s", "2026-11", 2)).toBe("payment_overdue:s:2026-11:2");
    expect(dedupeKey.lesson("l", "s")).toBe("lesson_reminder:l:s");
    expect(dedupeKey.remind("s", "2026-11-14")).toBe("remind:s:2026-11-14");
    expect(dedupeKey.remind("s", "2026-11-15")).not.toBe(dedupeKey.remind("s", "2026-11-14"));
    expect(dedupeKey.custom("u1")).not.toBe(dedupeKey.custom("u2"));
  });

  it("the same reminder is never sent twice, however often the job runs", async () => {
    const world = setup({ debtors: [debtor("a"), debtor("b", { telegramChatId: 502 })] });
    expect(await world.run("2026-11-01T10:00")).toMatchObject({ sent: 2, duplicate: 0 });
    for (const time of ["10:15", "10:30", "15:00", "20:45"]) {
      expect(await world.run(`2026-11-01T${time}`)).toMatchObject({ sent: 0, duplicate: 2 });
    }
    expect(world.providers.sms.sent).toHaveLength(1);
    expect(world.providers.telegram.sent).toHaveLength(1);
    expect(world.rows).toHaveLength(2);
  });

  it("a message with a key that exists is not sent at all", async () => {
    const { log, rows } = memoryLog();
    const providers = fakeProviders();
    const message: Outgoing = { studentId: "s", type: "payment_overdue", channel: "sms", recipient: "+998901110000", body: "Hello", dedupeKey: dedupeKey.remind("s", "2026-11-14") };
    expect(await deliver(log, providers, message)).toBe("sent");
    expect(await deliver(log, providers, message)).toBe("duplicate");
    expect(await deliver(log, providers, { ...message, body: "Different text" })).toBe("duplicate");
    expect(providers.sms.sent).toHaveLength(1);
    expect(rows).toHaveLength(1);
    // The next day is a new key.
    expect(await deliver(log, providers, { ...message, dedupeKey: dedupeKey.remind("s", "2026-11-15") })).toBe("sent");
  });

  it("a failed message is logged with its error and not retried", async () => {
    const world = setup({ debtors: [debtor("a")] });
    world.providers.sms.failFor.set("+998901110000", { ok: false, error: "Eskiz 500: down" });
    expect(await world.run("2026-11-01T10:00")).toMatchObject({ sent: 0, failed: 1 });
    expect(world.rows).toMatchObject([{ status: "failed", error: "Eskiz 500: down" }]);
    world.providers.sms.failFor.clear();
    expect(await world.run("2026-11-01T10:15")).toMatchObject({ sent: 0, duplicate: 1 });
    expect(world.providers.sms.sent).toEqual([]);
  });
});

// ── Telegram first, SMS fallback ──

describe("Telegram first with SMS fallback", () => {
  it("a payment message that fails on Telegram goes by SMS, and both are logged", async () => {
    const world = setup({ debtors: [debtor("a", { telegramChatId: 501, parentPhone: "+998901234567", language: "uz", fullName: "Oʻgʻiloy" })] });
    world.providers.telegram.failFor.set("501", { ok: false, error: "Telegram 403: bot was blocked by the user", permanent: true });
    expect(await world.run("2026-11-01T10:00")).toMatchObject({ sent: 1, failed: 0 });
    expect(world.rows).toMatchObject([
      { channel: "telegram", status: "failed", error: "Telegram 403: bot was blocked by the user", dedupeKey: "payment_due:a:2026-11" },
      { channel: "sms", status: "sent", recipient: "+998901234567", dedupeKey: "payment_due:a:2026-11:sms" },
    ]);
    // The SMS is plain Latin: a straight apostrophe, never ʻ.
    expect(world.providers.sms.sent[0].body).toBe("O'g'iloy uchun noyabr oyi to'lovi: 600 000 so'm. 5-noyabr gacha. Seon");
    expect(await world.run("2026-11-01T10:15")).toMatchObject({ sent: 0, duplicate: 1 });
    expect(world.providers.sms.sent).toHaveLength(1);
  });

  it("a lesson reminder that fails on Telegram is not sent by SMS", async () => {
    const student = person("a", { telegramChatId: 501 });
    const world = setup({ lessons: [{ lessonId: "L1", groupName: "English B1", lessonDate: "2026-11-14", startTime: "18:00", students: [student] }] });
    world.providers.telegram.failFor.set("501", { ok: false, error: "Telegram 403: blocked", permanent: true });
    expect(await world.run("2026-11-14T15:00")).toMatchObject({ sent: 0, failed: 1 });
    expect(world.providers.sms.sent).toEqual([]);
    expect(world.rows).toHaveLength(1);
  });
});

// ── Lesson reminders ──

describe("lesson reminders", () => {
  it("are due N hours before the lesson, within the job's window", () => {
    expect(lessonReminderDue(181, 3)).toBe(false);
    expect(lessonReminderDue(180, 3)).toBe(true);
    expect(lessonReminderDue(166, 3)).toBe(true);
    expect(lessonReminderDue(151, 3)).toBe(true);
    expect(lessonReminderDue(150, 3)).toBe(false);
    expect(lessonReminderDue(20, 3)).toBe(false);
    expect(lessonReminderDue(60, 1)).toBe(true);
  });

  it("go once, by Telegram, to students with Telegram linked", async () => {
    const lesson: LessonCandidate = {
      lessonId: "L1",
      groupName: "English B1",
      lessonDate: "2026-11-14",
      startTime: "18:00",
      students: [person("a", { telegramChatId: 501 }), person("b"), person("c", { telegramChatId: 503, language: "ru" })],
    };
    const world = setup({ lessons: [lesson] });
    expect(await world.run("2026-11-14T14:45")).toMatchObject({ sent: 0 });
    expect(await world.run("2026-11-14T15:00")).toMatchObject({ sent: 2 });
    expect(await world.run("2026-11-14T15:15")).toMatchObject({ sent: 0, duplicate: 2 });
    expect(await world.run("2026-11-14T15:45")).toMatchObject({ sent: 0, duplicate: 0 });
    expect(world.providers.telegram.sent).toEqual([
      { recipient: "501", body: "Student a has a English B1 lesson today at 18:00. Seon" },
      { recipient: "503", body: "Student c, сегодня в 18:00 занятие English B1. Seon" },
    ]);
    expect(world.providers.sms.sent).toEqual([]);
  });

  it("a lesson just after midnight is found from the evening before", async () => {
    const lesson: LessonCandidate = { lessonId: "L2", groupName: "Night", lessonDate: "2026-11-15", startTime: "00:30", students: [person("a", { telegramChatId: 501 })] };
    const world = setup({ lessons: [lesson], settings: { lessonReminderHours: 4 } });
    expect(await world.run("2026-11-14T20:30")).toMatchObject({ sent: 1 });
  });
});

// ── Templates ──

describe("templates", () => {
  it("fills the placeholders and leaves other braces alone", () => {
    expect(renderTemplate("Hello! {student}, {amount} UZS by {due_date}. {centre}", { student: "Ali", amount: "600 000", due_date: "November 5", centre: "Seon" })).toBe(
      "Hello! Ali, 600 000 UZS by November 5. Seon",
    );
    expect(renderTemplate("{student} {unknown} {group}", { student: "Ali" })).toBe("Ali {unknown}");
    expect(renderTemplate("Group {group} , at {time} .", {})).toBe("Group, at.");
  });

  it("writes values in the recipient's language", () => {
    expect(monthValue("2026-11", "uz")).toBe("noyabr");
    expect(monthValue("2026-11-01", "ru")).toBe("ноябрь");
    expect(monthValue("2026-05", "en")).toBe("May");
    expect(dateValue("2026-11-05", "uz")).toBe("5-noyabr");
    expect(dateValue("2026-11-05", "ru")).toBe("5 ноября");
    expect(dateValue("2026-11-05", "en")).toBe("November 5");
    expect(amountValue(1_250_000)).toBe("1 250 000");
    expect(() => amountValue(1.5)).toThrow(RangeError);
  });

  it("an SMS keeps to plain Latin: straight apostrophes, no ʻ", () => {
    expect(toSmsText("Oʻquvchi Gʻayrat – toʻlov “kechikdi”")).toBe("O'quvchi G'ayrat - to'lov \"kechikdi\"");
    expect(toSmsText("O’quvchi")).toBe("O'quvchi");
    expect(/^[\x20-\x7E]*$/.test(toSmsText("Assalomu alaykum! Oʻgʻiloy uchun noyabr oyi toʻlovi: 600 000 soʻm."))).toBe(true);
    expect(toSmsText("Оплата за ноябрь")).toBe("Оплата за ноябрь");
  });

  it("knows the Tashkent day and time of an instant", () => {
    expect(tashkentNow(new Date("2026-10-31T19:30:00Z"))).toEqual({ day: "2026-11-01", time: "00:30", month: "2026-11" });
  });
});

// ── Providers, against a fetch that never leaves the test ──

function fakeFetch(handler: (url: string, init: RequestInit | undefined, call: number) => Response) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { fetch, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const field = (init: RequestInit | undefined, name: string) => (init?.body as FormData).get(name);

describe("EskizProvider", () => {
  it("logs in once, caches the token and sends with it", async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.endsWith("/auth/login") ? json({ data: { token: "T1" } }) : json({ status: "waiting", id: "1" }),
    );
    const eskiz = new EskizProvider({ email: "a@b.uz", password: "secret", sender: "Seon", fetch });
    expect(await eskiz.send("+998901234567", "Salom")).toEqual({ ok: true });
    expect(await eskiz.send("+998907654321", "Yana salom")).toEqual({ ok: true });
    expect(calls.map((call) => call.url.replace("https://notify.eskiz.uz/api", ""))).toEqual([
      "/auth/login",
      "/message/sms/send",
      "/message/sms/send",
    ]);
    expect(field(calls[0].init, "email")).toBe("a@b.uz");
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer T1");
    // Eskiz takes the number without the plus.
    expect(field(calls[1].init, "mobile_phone")).toBe("998901234567");
    expect(field(calls[1].init, "message")).toBe("Salom");
    expect(field(calls[1].init, "from")).toBe("Seon");
  });

  it("refreshes the token on a 401 and sends again, once", async () => {
    let logins = 0;
    const { fetch, calls } = fakeFetch((url, init) => {
      if (url.endsWith("/auth/login")) return json({ data: { token: `T${(logins += 1)}` } });
      const token = (init?.headers as Record<string, string>).authorization;
      return token === "Bearer T1" ? json({ message: "Expired" }, 401) : json({ status: "waiting" });
    });
    const eskiz = new EskizProvider({ email: "a@b.uz", password: "secret", fetch });
    expect(await eskiz.send("+998901234567", "Salom")).toEqual({ ok: true });
    expect(calls.map((call) => call.url.split("/api")[1])).toEqual(["/auth/login", "/message/sms/send", "/auth/login", "/message/sms/send"]);
    // The new token is the cached one now.
    expect(await eskiz.send("+998901234567", "Salom")).toEqual({ ok: true });
    expect(logins).toBe(2);
    expect(field(calls[1].init, "from")).toBe("4546");
  });

  it("reports a failure instead of throwing, and does not loop on a 401", async () => {
    const always401 = fakeFetch((url) => (url.endsWith("/auth/login") ? json({ data: { token: "T" } }) : json({ message: "Unauthorized" }, 401)));
    expect(await new EskizProvider({ email: "a", password: "b", fetch: always401.fetch }).send("+998901234567", "x")).toEqual({
      ok: false,
      error: "Eskiz 401: Unauthorized",
    });
    expect(always401.calls).toHaveLength(4);

    const badLogin = fakeFetch(() => json({ message: "Wrong password" }, 401));
    expect(await new EskizProvider({ email: "a", password: "b", fetch: badLogin.fetch }).send("+998901234567", "x")).toEqual({
      ok: false,
      error: "Eskiz login 401: Wrong password",
    });

    const down = fakeFetch(() => {
      throw new Error("network down");
    });
    expect(await new EskizProvider({ email: "a", password: "b", fetch: down.fetch }).send("+998901234567", "x")).toEqual({ ok: false, error: "network down" });
  });

  it("sends nothing when it is not configured", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    expect(await new EskizProvider({ email: undefined, password: undefined, fetch }).send("+998901234567", "x")).toEqual({ ok: false, error: "SMS is not configured" });
    expect(calls).toEqual([]);
  });
});

describe("TelegramProvider", () => {
  it("posts the text to the chat", async () => {
    const { fetch, calls } = fakeFetch(() => json({ ok: true, result: {} }));
    expect(await new TelegramProvider({ token: "123:ABC", fetch }).send("501", "Salom")).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ chat_id: "501", text: "Salom" });
  });

  it("reports a blocked bot as a permanent failure, and never throws", async () => {
    const blocked = fakeFetch(() => json({ ok: false, description: "Forbidden: bot was blocked by the user" }, 403));
    expect(await new TelegramProvider({ token: "t", fetch: blocked.fetch }).send("501", "x")).toEqual({
      ok: false,
      error: "Telegram 403: Forbidden: bot was blocked by the user",
      permanent: true,
    });
    const down = fakeFetch(() => {
      throw new Error("network down");
    });
    expect(await new TelegramProvider({ token: "t", fetch: down.fetch }).send("501", "x")).toEqual({ ok: false, error: "Telegram: network down" });
    const none = fakeFetch(() => json({}));
    expect(await new TelegramProvider({ token: undefined, fetch: none.fetch }).send("501", "x")).toEqual({ ok: false, error: "Telegram is not configured" });
    expect(none.calls).toEqual([]);
  });
});
