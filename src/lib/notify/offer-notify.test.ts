import { describe, expect, it } from "vitest";

import type { AppAccount, AppNotification, AppNotifyStore } from "./app-notify";
import type { PushMessage, PushSender } from "./fcm";
import { lessonReminderDue, runOfferNotifications, type BookedLesson, type ExpiringVoucher, type OfferEventData } from "./offer-notify";

// Pushes about the voucher and the open lesson — docs/STUDENT_APP_SPEC.md →
// "Rules → Vouchers" and "Rules → Free open lessons".

const account = (profileId: string, language: AppAccount["language"] = "uz"): AppAccount => ({ profileId, language, messageLanguage: language === "ko" ? "uz" : language, tokens: [`token-${profileId}`] });

function fakes() {
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

const texts = (language: string) => (key: string, values?: Record<string, string | number>) => `${language}:${key}:${Object.values(values ?? {}).join("|")}`;
const data = (vouchers: ExpiringVoucher[], lessons: BookedLesson[]): OfferEventData => ({
  quietHours: async () => ({ from: "21:00", to: "09:00" }),
  expiringVouchers: async (now, until) => vouchers.filter((voucher) => Date.parse(voucher.expiresAt) > now.getTime() && Date.parse(voucher.expiresAt) <= until.getTime()),
  bookedLessons: async (days) => lessons.filter((lesson) => days.includes(lesson.sessionDate)),
});
// Saturday 28 November 2026, 11:00 in Tashkent.
const lesson = (overrides: Partial<BookedLesson> = {}): BookedLesson => ({ bookingId: "b-1", title: "Ochiq dars", sessionDate: "2026-11-28", startTime: "11:00", account: account("p-1"), ...overrides });
/** A Tashkent wall-clock time as an instant. */
const at = (day: string, time: string) => new Date(`${day}T${time}:00+05:00`);

describe("open lesson reminders", () => {
  it("the evening one is due from 18:00 the day before, the other in the last two hours", () => {
    const due = (day: string, time: string) => lessonReminderDue(at(day, time), lesson());
    expect(due("2026-11-27", "17:59")).toBeNull();
    expect(due("2026-11-27", "18:00")).toBe("evening");
    expect(due("2026-11-27", "23:45")).toBe("evening");
    // Past midnight it is the day itself: no evening reminder any more.
    expect(due("2026-11-28", "00:15")).toBeNull();
    expect(due("2026-11-28", "08:59")).toBeNull();
    expect(due("2026-11-28", "09:00")).toBe("soon");
    expect(due("2026-11-28", "10:59")).toBe("soon");
    expect(due("2026-11-28", "11:00")).toBeNull();
    // Two days before, even in the evening: not yet.
    expect(due("2026-11-26", "19:00")).toBeNull();
  });

  it("each is pushed once, in the person's language, and leads to the open lessons", async () => {
    const { store, push, rows, sent } = fakes();
    const deps = { store, push, texts, data: data([], [lesson(), lesson({ bookingId: "b-2", account: account("p-2", "ko"), startTime: "15:00" })]) };
    expect(await runOfferNotifications(at("2026-11-27", "18:05"), deps)).toEqual({ pushed: 2, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-11-27", "18:20"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 2 });
    expect(rows.map((row) => [row.profileId, row.type, row.body, row.dedupeKey])).toEqual([
      ["p-1", "open_lesson_reminder", "uz:open_lesson.evening:11:00|Ochiq dars", "open_lesson:b-1:evening"],
      ["p-2", "open_lesson_reminder", "ko:open_lesson.evening:15:00|Ochiq dars", "open_lesson:b-2:evening"],
    ]);
    expect(sent[0].data).toEqual({ type: "open_lesson_reminder", screen: "open_lessons" });
    // The next day: two hours before each start.
    expect(await runOfferNotifications(at("2026-11-28", "09:10"), deps)).toEqual({ pushed: 1, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-11-28", "13:05"), deps)).toEqual({ pushed: 1, stored: 0, duplicate: 0 });
    expect(rows.slice(2).map((row) => row.dedupeKey)).toEqual(["open_lesson:b-1:soon", "open_lesson:b-2:soon"]);
  });

  it("a reminder that falls in quiet hours is not sent", async () => {
    const { store, push, rows } = fakes();
    // A 10:00 lesson: two hours before is 08:00, still quiet; from 09:00 it goes.
    const deps = { store, push, texts, data: data([], [lesson({ startTime: "10:00" })]) };
    expect(await runOfferNotifications(at("2026-11-28", "08:15"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-11-27", "21:30"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-11-28", "09:00"), deps)).toEqual({ pushed: 1, stored: 0, duplicate: 0 });
    expect(rows.map((row) => row.dedupeKey)).toEqual(["open_lesson:b-1:soon"]);
  });
});

describe("the voucher reminder", () => {
  const voucher: ExpiringVoucher = { id: "v-1", code: "KOR-7F3K9", expiresAt: at("2026-12-07", "14:00").toISOString(), account: account("p-1", "en") };

  it("goes once, three days before the voucher expires, with its code and date", async () => {
    const { store, push, rows, sent } = fakes();
    const deps = { store, push, texts, data: data([voucher], []) };
    // More than three days left: nothing yet.
    expect(await runOfferNotifications(at("2026-12-04", "13:45"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-12-04", "14:00"), deps)).toEqual({ pushed: 1, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-12-05", "10:00"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "voucher_expiring", title: "en:voucher_expiring.title:", body: "en:voucher_expiring.body:KOR-7F3K9|December 7", dedupeKey: "voucher_expiring:v-1" });
    expect(sent[0].data).toEqual({ type: "voucher_expiring", screen: "voucher" });
    // Expired: no longer mentioned.
    expect(await runOfferNotifications(at("2026-12-07", "15:00"), { ...deps, store: fakes().store })).toEqual({ pushed: 0, stored: 0, duplicate: 0 });
  });

  it("waits for the morning when the three days begin at night", async () => {
    const { store, push, rows } = fakes();
    const late = { ...voucher, expiresAt: at("2026-12-07", "23:00").toISOString() };
    const deps = { store, push, texts, data: data([late], []) };
    expect(await runOfferNotifications(at("2026-12-04", "23:10"), deps)).toEqual({ pushed: 0, stored: 0, duplicate: 0 });
    expect(await runOfferNotifications(at("2026-12-05", "09:00"), deps)).toEqual({ pushed: 1, stored: 0, duplicate: 0 });
    expect(rows).toHaveLength(1);
  });
});
