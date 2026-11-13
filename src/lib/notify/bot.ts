import type { Language } from "./types";

// The Telegram bot: /start <code> links a chat to a student, /stop unlinks.
// docs/SPEC.md → "Notifications → Linking Telegram".

export type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { language_code?: string };
  };
};

export interface BotStore {
  /** Saves the chat on the student with this link code. Null when no student has it. */
  link(code: string, chatId: number): Promise<{ fullName: string; language: Language } | null>;
  /** Unlinks every student linked to the chat; returns their languages. */
  unlink(chatId: number): Promise<Language[]>;
  centreName(): Promise<string>;
}

export type BotReply = {
  chatId: number;
  language: Language;
  text: "linked" | "unknownCode" | "stopped" | "nothingLinked" | "help";
  values: { student?: string; centre: string };
};

const LINK_CODE = /^[A-Za-z0-9]{22}$/;

/** The language Telegram reports for the person, when it is one of ours. */
function languageOf(code: string | undefined): Language {
  const short = code?.slice(0, 2).toLowerCase();
  return short === "ru" || short === "en" ? short : "uz";
}

/**
 * Handles one update and says what to reply, or null for anything the bot
 * does not answer (no text, a group chat, an edited message).
 * One parent can link several children: each link code is its own /start.
 */
export async function handleUpdate(update: TelegramUpdate, store: BotStore): Promise<BotReply | null> {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!message || typeof chatId !== "number" || !text || message.chat?.type !== "private") return null;

  const [command, argument] = text.split(/\s+/, 2);
  // "/start@bot_name" is the same command.
  const name = command.split("@")[0].toLowerCase();
  const fallback = languageOf(message.from?.language_code);
  const centre = await store.centreName();

  if (name === "/start") {
    if (!argument || !LINK_CODE.test(argument)) {
      return { chatId, language: fallback, text: argument ? "unknownCode" : "help", values: { centre } };
    }
    const student = await store.link(argument, chatId);
    if (!student) return { chatId, language: fallback, text: "unknownCode", values: { centre } };
    // The confirmation is in the student's language.
    return { chatId, language: student.language, text: "linked", values: { student: student.fullName, centre } };
  }

  if (name === "/stop") {
    const languages = await store.unlink(chatId);
    return {
      chatId,
      language: languages[0] ?? fallback,
      text: languages.length > 0 ? "stopped" : "nothingLinked",
      values: { centre },
    };
  }

  return { chatId, language: fallback, text: "help", values: { centre } };
}
