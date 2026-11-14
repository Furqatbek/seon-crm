import type { Channel, Language } from "./types";

export const PLACEHOLDERS = ["student", "group", "month", "amount", "due_date", "time", "centre"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type TemplateValues = Partial<Record<Placeholder, string>>;

/**
 * Fills {placeholders}. One the message has no value for becomes empty, and
 * the spaces it leaves are tidied; anything else in braces is left alone.
 */
export function renderTemplate(body: string, values: TemplateValues): string {
  return body
    .replace(/\{(\w+)\}/g, (whole, name: string) =>
      (PLACEHOLDERS as readonly string[]).includes(name) ? (values[name as Placeholder] ?? "") : whole,
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?:;])/g, "$1")
    .trim();
}

/**
 * Text as an SMS carries it cheaply: the Uzbek ʻ and curly apostrophes become
 * a straight one, so a Latin message stays in the 160-character alphabet
 * (o'quv, not oʻquv). Cyrillic is left as it is.
 */
export function toSmsText(text: string): string {
  return text.replace(/[ʻʼ‘’`´]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-");
}

/** The text as it goes out on a channel. */
export function forChannel(text: string, channel: Channel): string {
  return channel === "sms" ? toSmsText(text) : text;
}

const MONTH_NAMES: Record<Language, string[]> = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const MONTH_NAMES_OF: Record<Language, string[]> = {
  uz: MONTH_NAMES.uz,
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: MONTH_NAMES.en,
};

/** {month}: the month's name in the recipient's language, from "YYYY-MM…". */
export function monthValue(month: string, language: Language): string {
  return MONTH_NAMES[language][Number(month.slice(5, 7)) - 1];
}

/** {due_date}: uz "5-noyabr", ru "5 ноября", en "November 5", from "YYYY-MM-DD". */
export function dateValue(day: string, language: Language): string {
  const date = Number(day.slice(8, 10));
  const month = MONTH_NAMES_OF[language][Number(day.slice(5, 7)) - 1];
  if (language === "uz") return `${date}-${month}`;
  return language === "ru" ? `${date} ${month}` : `${month} ${date}`;
}

/** {amount}: whole soʻm with spaces; the template carries the currency word. */
export function amountValue(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`amount must be whole soʻm, got ${amount}`);
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
