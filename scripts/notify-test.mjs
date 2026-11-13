#!/usr/bin/env node
// Sends ONE real Telegram message and ONE real SMS through the same providers
// the app uses, to check the credentials in .env.local.
//
//   node scripts/notify-test.mjs --phone +998901234567
//   node scripts/notify-test.mjs --phone +998901234567 --chat 123456789
//   node scripts/notify-test.mjs --chat 123456789            (Telegram only)
//   node scripts/notify-test.mjs --phone +998901234567 --sms-text "..."
//
// Telegram: first open your bot in Telegram and press Start. Without --chat
// the script looks up the chat that wrote to the bot most recently.
// SMS: costs one SMS. An Eskiz account still in test status only delivers
// Eskiz's own fixed test text, which is the default here.
//
// Needs Node 22.18 or newer (it loads the TypeScript providers directly).

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { values } = parseArgs({
  options: {
    chat: { type: "string" },
    phone: { type: "string" },
    "sms-text": { type: "string" },
    "telegram-text": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || (!values.chat && !values.phone)) {
  console.log(
    [
      "Sends one real test message to your Telegram and one to your phone.",
      "",
      "  node scripts/notify-test.mjs --phone +998901234567 [--chat <telegram chat id>]",
      "",
      "  --phone          where the SMS goes, as +998XXXXXXXXX (leave out to skip the SMS)",
      "  --chat           your Telegram chat id (leave out to use the chat that last wrote to the bot)",
      "  --sms-text       the SMS text (default: Eskiz's fixed test text)",
      "  --telegram-text  the Telegram text",
    ].join("\n"),
  );
  process.exit(values.help ? 0 : 1);
}

const { TelegramProvider } = await import("../src/lib/notify/telegram.ts");
const { EskizProvider } = await import("../src/lib/notify/eskiz.ts");

let failed = false;
const report = (name, target, result) => {
  if (result.ok) console.log(`✓ ${name}: sent to ${target}`);
  else {
    failed = true;
    console.error(`✗ ${name}: ${result.error}`);
  }
};

// ── Telegram ──
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  failed = true;
  console.error("✗ Telegram: TELEGRAM_BOT_TOKEN is not set in .env.local");
} else {
  let chat = values.chat;
  if (!chat) {
    // Only works while no webhook is registered: Telegram gives updates to one or the other.
    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const updates = await response.json().catch(() => null);
    const latest = updates?.result?.findLast?.((update) => update.message?.chat?.type === "private");
    chat = latest ? String(latest.message.chat.id) : undefined;
    if (chat) console.log(`  Telegram: using the chat of ${latest.message.chat.first_name ?? "the last sender"} (${chat})`);
    else {
      failed = true;
      console.error(
        updates?.ok === false
          ? `✗ Telegram: ${updates.description}. If a webhook is registered, pass --chat <id> instead.`
          : "✗ Telegram: no chat found. Open your bot in Telegram, press Start, then run this again (or pass --chat <id>).",
      );
    }
  }
  if (chat) {
    const text = values["telegram-text"] ?? "Edu CRM: test message. If you can read this, Telegram reminders work.";
    report("Telegram", `chat ${chat}`, await new TelegramProvider({ token }).send(chat, text));
  }
}

// ── SMS ──
if (!values.phone) {
  console.log("  SMS: skipped (no --phone)");
} else if (!/^\+998\d{9}$/.test(values.phone)) {
  failed = true;
  console.error(`✗ SMS: ${values.phone} is not a phone like +998901234567`);
} else {
  const eskiz = new EskizProvider({
    email: process.env.ESKIZ_EMAIL,
    password: process.env.ESKIZ_PASSWORD,
    sender: process.env.ESKIZ_SENDER,
  });
  const text = values["sms-text"] ?? "Bu Eskiz dan test";
  report("SMS", values.phone, await eskiz.send(values.phone, text));
}

process.exit(failed ? 1 : 0);
