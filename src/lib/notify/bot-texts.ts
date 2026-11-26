import { createTranslator } from "next-intl";

import en from "../../../messages/en.json";
import ko from "../../../messages/ko.json";
import ru from "../../../messages/ru.json";
import uz from "../../../messages/uz.json";

import type { Texts } from "./points-data";
import type { StaffLanguage, StaffTexts } from "./staff-alerts";
import type { Language } from "./types";

const MESSAGES = { en, ru, uz };

/** The bot's own texts ("bot" in messages/*.json), one translator per language. */
const translators = new Map<Language, ReturnType<Texts>>();

export const botTexts: Texts = (language) => {
  let translate = translators.get(language);
  if (!translate) {
    // Only the bot's texts are loaded into the translator.
    const t = createTranslator({ locale: language, messages: { bot: MESSAGES[language].bot }, namespace: "bot" });
    translate = (key, values) => (t as (key: string, values?: Record<string, string | number>) => string)(key, values);
    translators.set(language, translate);
  }
  return translate;
};

/** The command list Telegram shows, per language. */
export function botCommands(): Record<Language, Array<{ command: string; description: string }>> {
  const of = (language: Language) =>
    (["points", "top", "rewards", "language", "stop"] as const).map((command) => ({
      command,
      description: MESSAGES[language].bot.commands[command],
    }));
  return { uz: of("uz"), ru: of("ru"), en: of("en") };
}

const STAFF_MESSAGES = { en, ru, uz, ko };
const staffTranslators = new Map<StaffLanguage, ReturnType<StaffTexts>>();

/** What the bot says to staff ("staffBot" in messages/*.json), in the four interface languages. */
export const staffBotTexts: StaffTexts = (language) => {
  let translate = staffTranslators.get(language);
  if (!translate) {
    const t = createTranslator({ locale: language, messages: { staffBot: STAFF_MESSAGES[language].staffBot }, namespace: "staffBot" });
    translate = (key, values) => (t as (key: string, values?: Record<string, string | number>) => string)(key, values);
    staffTranslators.set(language, translate);
  }
  return translate;
};
