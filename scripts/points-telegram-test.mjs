#!/usr/bin/env node
// Links YOUR Telegram to a test student and sends one of each new points
// message through the same code the app uses:
//   weekly summary · points taken away · month results ·
//   reward update × 3 (request received, handed over, rejected)
//
//   node scripts/points-telegram-test.mjs                  (link by opening the bot)
//   node scripts/points-telegram-test.mjs --role parent    (link as the parent)
//   node scripts/points-telegram-test.mjs --chat 123456789 (link this chat id directly)
//   node scripts/points-telegram-test.mjs --language ru    (uz, ru or en; default uz)
//   node scripts/points-telegram-test.mjs --cleanup        (unlink and archive the test student)
//
// What it changes in the database named in .env.local:
//   - adds one student called "Telegram Test" (once), and links your chat to it;
//   - nothing else: the six messages are sent, not written to the message log,
//     so the script can be run again and again.
// --cleanup removes the link and archives the test student.
//
// Linking by opening the bot needs the app deployed with its webhook connected
// (Settings → Notifications → Connect webhook). Without that, pass --chat.
//
// Needs Node 22.18 or newer (it loads the TypeScript modules directly).

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { values } = parseArgs({
  options: {
    chat: { type: "string" },
    role: { type: "string", default: "student" },
    language: { type: "string", default: "uz" },
    cleanup: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 23).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const role = values.role;
const language = values.language;
if (role !== "student" && role !== "parent") fail("--role must be student or parent");
if (!["uz", "ru", "en"].includes(language)) fail("--language must be uz, ru or en");
if (values.chat && !/^-?\d+$/.test(values.chat)) fail("--chat must be a Telegram chat id (a number)");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
if (!token && !values.cleanup) fail("TELEGRAM_BOT_TOKEN is not set in .env.local");

const { createClient } = await import("@supabase/supabase-js");
const { createTranslator } = await import("use-intl/core");
const { runPointsMessages } = await import("../src/lib/notify/points-messages.ts");
const { TelegramProvider } = await import("../src/lib/notify/telegram.ts");

const db = createClient(url, key, { auth: { persistSession: false } });
const check = (result, what) => {
  if (result.error) fail(`${what}: ${result.error.message}`);
  return result.data;
};
console.log(`Database: ${new URL(url).host}`);

// ── The test student ──
const NAME = "Telegram Test";
let student = check(
  await db.from("students").select("id, full_name, language, student_link_code, parent_link_code").eq("full_name", NAME).is("archived_at", null).limit(1).maybeSingle(),
  "Reading the test student (has the telegram_links migration been applied?)",
);

if (values.cleanup) {
  if (!student) {
    console.log("Nothing to clean up: there is no test student.");
    process.exit(0);
  }
  check(await db.from("telegram_links").delete().eq("student_id", student.id), "Removing the link");
  check(await db.from("students").update({ archived_at: new Date().toISOString() }).eq("id", student.id), "Archiving the test student");
  console.log(`✓ Unlinked and archived "${NAME}".`);
  process.exit(0);
}

if (!student) {
  student = check(
    await db.from("students").insert({ full_name: NAME, phone: "+998900000000", language }).select("id, full_name, language, student_link_code, parent_link_code").single(),
    "Adding the test student",
  );
  console.log(`✓ Added the test student "${NAME}".`);
} else {
  console.log(`  Using the test student "${NAME}".`);
}

// ── Link your Telegram ──
const readLink = async () =>
  check(await db.from("telegram_links").select("chat_id, language").eq("student_id", student.id).eq("role", role).maybeSingle(), "Reading the link");

let link = await readLink();
if (values.chat) {
  check(
    await db.from("telegram_links").upsert(
      { student_id: student.id, role, chat_id: Number(values.chat), language, linked_at: new Date().toISOString() },
      { onConflict: "student_id,role" },
    ),
    "Linking the chat",
  );
  link = await readLink();
  console.log(`✓ Linked chat ${values.chat} as the ${role}.`);
} else if (link) {
  console.log(`  Chat ${link.chat_id} is already linked as the ${role}.`);
} else {
  const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json().catch(() => null);
  if (!me?.ok) fail(`Telegram did not accept the bot token: ${me?.description ?? "no answer"}`);
  const code = role === "student" ? `s_${student.student_link_code}` : `p_${student.parent_link_code}`;
  console.log(`\nOpen this link on your phone and press Start:\n\n  https://t.me/${me.result.username}?start=${code}\n`);
  process.stdout.write("Waiting for the bot to link you (up to 3 minutes) ");
  for (let attempt = 0; attempt < 90 && !link; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    process.stdout.write(".");
    link = await readLink();
  }
  console.log("");
  if (!link) {
    fail(
      "No link appeared. The app must be deployed with its webhook connected (Settings → Notifications → Connect webhook).\n" +
        "  Or link directly: node scripts/points-telegram-test.mjs --chat <your chat id>",
    );
  }
  console.log(`✓ Linked chat ${link.chat_id} as the ${role}.`);
}
if (link.language !== language) {
  check(await db.from("telegram_links").update({ language }).eq("student_id", student.id).eq("role", role), "Setting the chat's language");
}

// ── One of each new message ──
const templates = check(await db.from("message_templates").select("type, channel, language, body"), "Reading the templates");
const centre = check(await db.from("centre_settings").select("centre_name").single(), "Reading the centre");
const messages = JSON.parse(readFileSync(new URL(`../messages/${language}.json`, import.meta.url), "utf8"));
const translate = createTranslator({ locale: language, messages: { bot: messages.bot }, namespace: "bot" });
const texts = () => (name, args) => translate(name, args);

// The 1st of this month at 10:00 Tashkent time: month results are due then, and
// the weekly summary is set to that weekday, so one run sends both.
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
const now = new Date(`${today.slice(0, 7)}-01T10:00:00+05:00`);
const weekday = ((now.getUTCDay() + 6) % 7) + 1;
const chat = { chatId: link.chat_id, language };
const chats = { studentChat: role === "student" ? chat : null, parentChat: role === "parent" ? chat : null };
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
const reward = (update, note = null) => ({ redemptionId: "test", studentId: student.id, reward: "Brend futbolka", cost: 100, update, note, ...chats });

const data = {
  settings: async () => ({
    centreName: centre.centre_name,
    remindersEnabled: true,
    pointsEnabled: true,
    // No quiet hours for a test.
    quietFrom: "00:00",
    quietTo: "00:00",
    weeklyDay: weekday,
    weeklyTime: "00:00",
  }),
  templates: async () => templates,
  linkedStudents: async () => [{ id: student.id, ...chats }],
  // Sample numbers: the test student has no lessons or points of their own.
  summary: async (_id, month) => ({
    student_id: student.id,
    name: NAME,
    active: true,
    month: month ?? today.slice(0, 7),
    balance: 92,
    week_points: 14,
    month_points: 44,
    centre_rank: 7,
    groups: [{ name: "English B1", points: 30, rank: 2 }],
    perfect_month_bonus: 10,
    last: [],
    next_reward: { name: "Brend futbolka", cost: 100, needed: 8 },
  }),
  deductions: async () => [
    {
      ledgerId: "test",
      studentId: student.id,
      points: 2,
      groupName: "English B1",
      reason: null,
      preset: { uz: "Darsda telefon", ru: "Телефон на уроке", en: "Phone in class" },
      at: minutesAgo(5),
      ...chats,
    },
  ],
  rewardEvents: async () => [reward("requested"), reward("given"), reward("rejected", { uz: "Oʻlcham toʻgʻri kelmadi", ru: "Не подошёл размер", en: "Wrong size" }[language])],
};

// Kept in memory, not in the messages table, so the script can be run again.
const sent = [];
const log = {
  begin: async (message) => String(sent.push({ ...message, status: "queued", error: null })),
  finish: async (id, result) => Object.assign(sent[Number(id) - 1], result),
};

const telegram = new TelegramProvider({ token });
const noSms = { channel: "sms", send: async () => ({ ok: false, error: "Points messages are never sent by SMS" }) };
const summary = await runPointsMessages(now, { data, log, providers: { telegram, sms: noSms }, texts });

console.log("");
for (const message of sent) {
  const mark = message.status === "sent" ? "✓" : "✗";
  console.log(`${mark} ${message.type.padEnd(20)} ${message.status === "sent" ? "sent" : message.error}`);
}
console.log(`\n${summary.sent} sent, ${summary.failed} failed. Expected: 6 messages in your Telegram (weekly, taken away, month results, 3 reward updates).`);
console.log("When you are done: node scripts/points-telegram-test.mjs --cleanup");
process.exit(summary.failed > 0 || summary.sent !== 6 ? 1 : 0);
