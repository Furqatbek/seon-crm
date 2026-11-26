// Alerts to staff about leads in the shared inbox — docs/SPEC.md → "Lead forms
// add-on → Shared inbox and staff alerts → On Telegram". Nothing real is sent:
// the FakeProvider remembers what it was asked to send.
import { describe, expect, it } from "vitest";

import { handleUpdate, packId, type BotStore, type TelegramUpdate } from "./bot";
import type { MessageLog, Outgoing } from "./deliver";
import { FakeProvider } from "./fake";
import {
  REMINDER_AFTER_MINUTES,
  alertDueAt,
  runStaffAlerts,
  staffAlertsDue,
  staffDedupeKey,
  takeData,
  type InboxLead,
  type StaffBotStore,
  type StaffRecipient,
  type StaffTexts,
  type TakeResult,
} from "./staff-alerts";

const QUIET = { from: "21:00", to: "09:00" };
/** A Tashkent wall-clock time on 18 November 2026, or another day. */
const at = (time: string, day = "2026-11-18") => new Date(`${day}T${time}:00+05:00`);

const LEAD: InboxLead = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Aziza Karimova",
  phone: "+998901234567",
  formName: "Free trial lesson",
  answers: [
    { label: "Age", value: "17" },
    { label: "Consent", value: true },
    { label: "Time", value: "Evening" },
    { label: "Level", value: "Basic" },
    { label: "Branch", value: "Chilanzar" },
  ],
  inboxSince: at("14:00").toISOString(),
};
const OWNER: StaffRecipient = { id: "owner-1", chatId: 1001, language: "en" };
const MANAGER: StaffRecipient = { id: "manager-1", chatId: 1002, language: "ru" };

// Texts that show their key and values, so the tests read what was asked for.
const texts: StaffTexts = (language) => (key, values) => `${language}:${key}${values ? ` ${JSON.stringify(values)}` : ""}`;

function world(options: { leads?: InboxLead[]; recipients?: StaffRecipient[]; quiet?: { from: string; to: string }; appUrl?: string | null } = {}) {
  const telegram = new FakeProvider("telegram");
  const rows: Array<Outgoing & { status: string; error?: string | null }> = [];
  const log: MessageLog = {
    async begin(message, status) {
      if (rows.some((row) => row.dedupeKey === message.dedupeKey)) return null;
      rows.push({ ...message, status });
      return String(rows.length - 1);
    },
    async finish(id, result) {
      Object.assign(rows[Number(id)], { status: result.status, error: result.error });
    },
  };
  const state = { leads: options.leads ?? [LEAD], recipients: options.recipients ?? [OWNER, MANAGER] };
  const run = (now: Date) =>
    runStaffAlerts(now, {
      data: {
        quietHours: async () => options.quiet ?? QUIET,
        inboxLeads: async (since) => state.leads.filter((lead) => lead.inboxSince >= since.toISOString()),
        recipients: async () => state.recipients,
      },
      log,
      telegram,
      texts,
      appUrl: options.appUrl === undefined ? "https://crm.example.uz" : options.appUrl,
    });
  return { telegram, rows, state, run };
}

describe("an alert for every new lead", () => {
  it("goes to each owner and manager once, in their language, with the top answers and two buttons", async () => {
    const { telegram, rows, run } = world();
    expect(await run(at("14:01"))).toEqual({ alerts: 2, reminders: 0, failed: 0 });
    expect(telegram.sent.map((message) => message.recipient)).toEqual(["1001", "1002"]);
    expect(telegram.sent[0].body.split("\n")).toEqual([
      "en:newLead",
      "Aziza Karimova",
      "+998901234567",
      'en:form {"form":"Free trial lesson"}',
      // Three answers at most; consent is not one of them.
      "Age: 17",
      "Time: Evening",
      "Level: Basic",
    ]);
    expect(telegram.sent[1].body.startsWith("ru:newLead")).toBe(true);
    expect(telegram.sent[0].buttons).toEqual([
      [{ text: "en:open", url: `https://crm.example.uz/en/leads?lead=${LEAD.id}` }],
      [{ text: "en:take", data: takeData(LEAD.id) }],
    ]);
    expect(takeData(LEAD.id)).toBe(`tk:${packId(LEAD.id)}`);
    expect(takeData(LEAD.id).length).toBeLessThanOrEqual(64);

    // Logged in the messages table: for the member of staff, about the lead, under a dedupe key.
    expect(rows).toMatchObject([
      { studentId: null, staffId: "owner-1", leadId: LEAD.id, type: "staff_new_lead", channel: "telegram", recipient: "1001", status: "sent", dedupeKey: staffDedupeKey.newLead(LEAD.id, LEAD.inboxSince, "owner-1") },
      { studentId: null, staffId: "manager-1", leadId: LEAD.id, type: "staff_new_lead", recipient: "1002", status: "sent" },
    ]);
  });

  it("is not sent twice, however often the job runs", async () => {
    const { telegram, run } = world();
    await run(at("14:01"));
    expect(await run(at("14:05"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("14:20"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(telegram.sent).toHaveLength(2);
  });

  it("a lead that comes back to the inbox is announced again", async () => {
    const { telegram, state, run } = world({ recipients: [OWNER] });
    await run(at("14:01"));
    state.leads = [{ ...LEAD, inboxSince: at("16:00").toISOString() }];
    expect(await run(at("16:01"))).toEqual({ alerts: 1, reminders: 0, failed: 0 });
    expect(telegram.sent).toHaveLength(2);
  });

  it("a taken lead, and a person with alerts off or no Telegram, get nothing", async () => {
    const taken = world({ leads: [] });
    expect(await taken.run(at("14:01"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    const nobody = world({ recipients: [] });
    expect(await nobody.run(at("14:01"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(nobody.telegram.sent).toEqual([]);
  });

  it("a failed send is logged as failed and the others still go", async () => {
    const { telegram, rows, run } = world();
    telegram.failFor.set("1001", { ok: false, error: "Telegram 403: bot was blocked", permanent: true });
    expect(await run(at("14:01"))).toEqual({ alerts: 1, reminders: 0, failed: 1 });
    expect(rows.map((row) => [row.staffId, row.status, row.error ?? null])).toEqual([
      ["owner-1", "failed", "Telegram 403: bot was blocked"],
      ["manager-1", "sent", null],
    ]);
  });

  it("the Open in CRM button needs a public https address; Take is always there", async () => {
    for (const appUrl of [null, "http://localhost:3000"]) {
      const { telegram, run } = world({ recipients: [OWNER], appUrl });
      await run(at("14:01"));
      expect(telegram.sent[0].buttons).toEqual([[{ text: "en:take", data: takeData(LEAD.id) }]]);
    }
  });

  it("a lead that has sat in the inbox for more than three days is not announced", async () => {
    const { telegram, run } = world({ leads: [{ ...LEAD, inboxSince: at("14:00", "2026-11-14").toISOString() }] });
    await run(at("14:01"));
    expect(telegram.sent).toEqual([]);
  });
});

describe("one reminder after 30 untaken minutes", () => {
  it("is due 30 minutes after the alert, not before", () => {
    const since = at("14:00");
    expect(REMINDER_AFTER_MINUTES).toBe(30);
    expect(staffAlertsDue(at("14:00"), since, QUIET)).toEqual({ alert: true, reminder: false });
    expect(staffAlertsDue(at("14:29"), since, QUIET)).toEqual({ alert: true, reminder: false });
    expect(staffAlertsDue(at("14:30"), since, QUIET)).toEqual({ alert: true, reminder: true });
  });

  it("goes once to everyone, says how long the lead has waited, and is never repeated", async () => {
    const { telegram, rows, run } = world();
    await run(at("14:01"));
    expect(await run(at("14:29"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("14:31"))).toEqual({ alerts: 0, reminders: 2, failed: 0 });
    expect(telegram.sent[2].body.split("\n").slice(0, 2)).toEqual(['en:reminder {"minutes":31}', "Aziza Karimova"]);
    expect(telegram.sent[2].buttons?.at(-1)).toEqual([{ text: "en:take", data: takeData(LEAD.id) }]);
    expect(rows.filter((row) => row.type === "staff_lead_reminder").map((row) => row.dedupeKey)).toEqual([
      staffDedupeKey.reminder(LEAD.id, LEAD.inboxSince, "owner-1"),
      staffDedupeKey.reminder(LEAD.id, LEAD.inboxSince, "manager-1"),
    ]);
    expect(await run(at("14:45"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("17:00"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(telegram.sent).toHaveLength(4);
  });

  it("is not sent once the lead is taken", async () => {
    const { telegram, state, run } = world();
    await run(at("14:01"));
    state.leads = [];
    expect(await run(at("14:31"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(telegram.sent).toHaveLength(2);
  });

  it("if the job was down for an hour, the alert goes first and the reminder on the next run", async () => {
    const { run } = world({ recipients: [OWNER] });
    expect(await run(at("15:00"))).toEqual({ alerts: 1, reminders: 0, failed: 0 });
    expect(await run(at("15:15"))).toEqual({ alerts: 0, reminders: 1, failed: 0 });
  });

  it("waits for the morning when the 30 minutes end in quiet hours", async () => {
    const { telegram, run } = world({ recipients: [OWNER], leads: [{ ...LEAD, inboxSince: at("20:45").toISOString() }] });
    expect(await run(at("20:46"))).toEqual({ alerts: 1, reminders: 0, failed: 0 });
    expect(await run(at("21:15"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("03:00", "2026-11-19"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("09:00", "2026-11-19"))).toEqual({ alerts: 0, reminders: 1, failed: 0 });
    expect(telegram.sent).toHaveLength(2);
  });
});

describe("leads arriving at night alert at 09:00", () => {
  it("the alert is due when quiet hours end: the same morning, or the next one", () => {
    expect(alertDueAt(at("14:00"), QUIET)).toEqual(at("14:00"));
    expect(alertDueAt(at("20:59"), QUIET)).toEqual(at("20:59"));
    expect(alertDueAt(at("21:00"), QUIET)).toEqual(at("09:00", "2026-11-19"));
    expect(alertDueAt(at("23:30"), QUIET)).toEqual(at("09:00", "2026-11-19"));
    expect(alertDueAt(at("02:10"), QUIET)).toEqual(at("09:00"));
    expect(alertDueAt(at("08:59"), QUIET)).toEqual(at("09:00"));
    expect(alertDueAt(at("09:00"), QUIET)).toEqual(at("09:00"));
    // No quiet hours at all: at once, whenever.
    expect(alertDueAt(at("02:10"), { from: "00:00", to: "00:00" })).toEqual(at("02:10"));
  });

  it("nothing is sent at night; at 09:00 the alert goes, and the reminder 30 minutes after that", async () => {
    const { telegram, run } = world({ recipients: [OWNER], leads: [{ ...LEAD, inboxSince: at("23:30").toISOString() }] });
    expect(await run(at("23:31"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("04:00", "2026-11-19"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("08:45", "2026-11-19"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(telegram.sent).toEqual([]);

    expect(await run(at("09:00", "2026-11-19"))).toEqual({ alerts: 1, reminders: 0, failed: 0 });
    // The 30 minutes count from the alert, not from the night it arrived.
    expect(await run(at("09:15", "2026-11-19"))).toEqual({ alerts: 0, reminders: 0, failed: 0 });
    expect(await run(at("09:30", "2026-11-19"))).toEqual({ alerts: 0, reminders: 1, failed: 0 });
    expect(telegram.sent[1].body.split("\n")[0]).toBe('en:reminder {"minutes":30}');
  });

  it("follows the centre's own quiet hours", async () => {
    const { run } = world({ recipients: [OWNER], quiet: { from: "22:00", to: "08:00" }, leads: [{ ...LEAD, inboxSince: at("21:30").toISOString() }] });
    expect(await run(at("21:31"))).toEqual({ alerts: 1, reminders: 0, failed: 0 });
  });
});

describe("the bot for staff", () => {
  const CODE = "AbCdEfGhIjKlMnOpQrStUv";
  const noStudents = {
    links: async () => [],
    centreName: async () => "SEON TOPIK",
    unlink: async () => 0,
    link: async () => null,
  } as unknown as BotStore;
  const botTexts = (language: string) => (key: string, values?: Record<string, string | number>) => `${language}:${key}${values ? ` ${JSON.stringify(values)}` : ""}`;

  function staffWorld() {
    const linked = new Map<number, { id: string; fullName: string; language: "uz" | "ru" | "en" | "ko" }>();
    const people = { [CODE]: { id: "manager-1", fullName: "Malika Yusupova", language: "ru" as const } };
    let holder: string | null = null;
    const takes: string[] = [];
    const store: StaffBotStore = {
      linkStaff: async (code, chatId) => {
        const person = people[code as keyof typeof people];
        if (!person) return null;
        linked.set(chatId, person);
        return person;
      },
      unlinkStaff: async (chatId) => (linked.delete(chatId) ? 1 : 0),
      staffByChat: async (chatId) => linked.get(chatId) ?? null,
      takeLead: async (leadId, staffId): Promise<TakeResult> => {
        takes.push(`${leadId}:${staffId}`);
        if (leadId !== LEAD.id) return null;
        if (holder) return { taken: false, by: holder };
        holder = staffId === "manager-1" ? "Malika Yusupova" : "Jasur Karimov";
        return { taken: true, lead: { fullName: LEAD.fullName, phone: LEAD.phone } };
      },
    };
    const send = (update: TelegramUpdate) => handleUpdate(update, noStudents, botTexts, { store, texts });
    const message = (text: string, chatId: number): TelegramUpdate => ({ message: { text, chat: { id: chatId, type: "private" }, from: { language_code: "en" } } });
    const press = (data: string, chatId: number): TelegramUpdate => ({
      callback_query: { id: "cb1", data, from: { language_code: "en" }, message: { message_id: 5, chat: { id: chatId, type: "private" } } },
    });
    return { linked, takes, send, message, press, setHolder: (name: string) => (holder = name) };
  }

  it("/start u_<code> links a member of staff and answers in their language", async () => {
    const { linked, send, message } = staffWorld();
    expect(await send(message(`/start u_${CODE}`, 2001))).toMatchObject({ chatId: 2001, text: 'ru:linked {"name":"Malika Yusupova","centre":"SEON TOPIK"}' });
    expect(linked.get(2001)?.id).toBe("manager-1");
    // A wrong code links nobody, and a student's code is not a staff code.
    expect(await send(message("/start u_Wrong00000000000000000", 2002))).toMatchObject({ text: 'en:unknownCode {"centre":"SEON TOPIK"}' });
    expect(await send(message("/start u_short", 2002))).toMatchObject({ text: 'en:unknownCode {"centre":"SEON TOPIK"}' });
    expect(linked.has(2002)).toBe(false);
  });

  it("Take makes the lead theirs and says so", async () => {
    const { send, message, press, takes } = staffWorld();
    await send(message(`/start u_${CODE}`, 2001));
    expect(await send(press(takeData(LEAD.id), 2001))).toEqual({
      chatId: 2001,
      text: 'ru:taken {"name":"Aziza Karimova","phone":"+998901234567"}',
      buttons: undefined,
      callbackId: "cb1",
    });
    expect(takes).toEqual([`${LEAD.id}:manager-1`]);
  });

  it("when someone was faster, the bot replies with who took it", async () => {
    const { send, message, press, setHolder } = staffWorld();
    await send(message(`/start u_${CODE}`, 2001));
    setHolder("Jasur Karimov");
    expect(await send(press(takeData(LEAD.id), 2001))).toMatchObject({ text: 'ru:takenBy {"name":"Jasur Karimov"}' });
  });

  it("a chat that is not a linked member of staff cannot take anything", async () => {
    const { send, press, takes } = staffWorld();
    expect(await send(press(takeData(LEAD.id), 3003))).toMatchObject({ text: 'en:notLinked {"centre":"SEON TOPIK"}' });
    expect(takes).toEqual([]);
  });

  it("a lead that is gone, and a broken button, are answered without a Take", async () => {
    const { send, message, press, takes } = staffWorld();
    await send(message(`/start u_${CODE}`, 2001));
    expect(await send(press(takeData("22222222-2222-4222-8222-222222222222"), 2001))).toMatchObject({ text: "ru:gone" });
    expect(await send(press("tk:not-an-id", 2001))).toMatchObject({ text: 'en:notLinked {"centre":"SEON TOPIK"}' });
    expect(takes).toHaveLength(1);
  });

  it("/stop unlinks a member of staff", async () => {
    const { linked, send, message } = staffWorld();
    await send(message(`/start u_${CODE}`, 2001));
    expect(await send(message("/stop", 2001))).toMatchObject({ text: 'en:stopped {"centre":"SEON TOPIK"}' });
    expect(linked.has(2001)).toBe(false);
    expect(await send(message("/stop", 2001))).toMatchObject({ text: "en:nothingLinked" });
  });
});
