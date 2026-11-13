import { createTranslator } from "next-intl";

import { handleUpdate, type TelegramUpdate } from "@/lib/notify/bot";
import { secretMatches } from "@/lib/notify/secret";
import { botStore, getProviders } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

import en from "../../../../../messages/en.json";
import ru from "../../../../../messages/ru.json";
import uz from "../../../../../messages/uz.json";

const MESSAGES = { en, ru, uz };

/**
 * Telegram calls this for every message to the bot. The request must carry
 * the secret token the webhook was registered with; anything else is refused.
 * /start <code> links the chat to a student, /stop unlinks.
 */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return new Response("Bad request", { status: 400 });

  const reply = await handleUpdate(update, botStore(admin));
  if (reply) {
    // Only the bot's own texts are loaded into the translator.
    const t = createTranslator({ locale: reply.language, messages: { bot: MESSAGES[reply.language].bot }, namespace: "bot" });
    await getProviders().telegram.send(String(reply.chatId), t(reply.text, { student: reply.values.student ?? "", centre: reply.values.centre }));
  }
  // Always 200 once the secret is right, so Telegram does not send the update again.
  return Response.json({ ok: true });
}
