import { handleUpdate, type TelegramUpdate } from "@/lib/notify/bot";
import { botTexts } from "@/lib/notify/bot-texts";
import { secretMatches } from "@/lib/notify/secret";
import { botStore, getProviders } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Telegram calls this for every message to the bot and every button pressed
 * in it. The request must carry the secret token the webhook was registered
 * with; anything else is refused. docs/SPEC.md → "Telegram for students and
 * parents": /start s_<code> and p_<code>, /stop, /language, /points, /top,
 * /rewards.
 */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return new Response("Bad request", { status: 400 });

  const telegram = getProviders().telegram;
  try {
    const reply = await handleUpdate(update, botStore(admin), botTexts);
    if (reply) {
      if (reply.callbackId) await telegram.answerCallback(reply.callbackId);
      await telegram.sendWithButtons(String(reply.chatId), reply.text, reply.buttons);
    }
  } catch (error) {
    // Still 200: Telegram would only send the same update again.
    console.error("telegram webhook", error);
  }
  // Always 200 once the secret is right, so Telegram does not send the update again.
  return Response.json({ ok: true });
}
