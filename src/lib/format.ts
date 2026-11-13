import type { Locale } from "@/i18n/routing";

const MINUS = "−";

function groupDigits(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats whole soʻm for display. Money is never a float: a number that is
 * not a safe integer throws instead of being rounded silently.
 *
 *   uz "1 250 000 soʻm" · ru "1 250 000 сум" · en "UZS 1,250,000"
 */
export function formatMoney(amount: bigint | number, locale: Locale): string {
  if (typeof amount === "number" && !Number.isSafeInteger(amount)) {
    throw new RangeError(`formatMoney expects whole soʻm, got ${amount}`);
  }
  const value = BigInt(amount);
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString();
  const sign = negative ? MINUS : "";

  switch (locale) {
    case "en":
      return `${sign}UZS ${groupDigits(digits, ",")}`;
    case "ru":
      return `${sign}${groupDigits(digits, " ")} сум`;
    case "uz":
      return `${sign}${groupDigits(digits, " ")} soʻm`;
  }
}

/** "+998901234567" → "+998 90 123 45 67". Anything else is returned as it is. */
export function formatPhone(phone: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone.replace(/[\s()-]/g, ""));
  if (!match) return phone;
  const [, operator, a, b, c] = match;
  return `+998 ${operator} ${a} ${b} ${c}`;
}

// Dates are written out by hand, in Tashkent time (UTC+5, no daylight saving).
// Intl month names for Uzbek are missing in some browsers, where a date would
// read "M11 10".
const MONTHS: Record<Locale, { short: string[]; long: string[] }> = {
  en: {
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    long: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
  },
  ru: {
    short: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
    long: [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ],
  },
  uz: {
    short: ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"],
    long: [
      "yanvar", "fevral", "mart", "aprel", "may", "iyun",
      "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
    ],
  },
};

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

function tashkentParts(instant: Date | string) {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const local = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    time: `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/**
 * A day in Tashkent: en "Nov 10", ru "10 нояб.", uz "10-noy".
 * With `year`: "Nov 10, 2026", "10 нояб. 2026", "10-noy 2026".
 * For a date column ("2026-11-10") use formatDay().
 */
export function formatDate(
  instant: Date | string,
  locale: Locale,
  options: { year?: boolean; month?: "short" | "long" } = {},
): string {
  const { year, month, day } = tashkentParts(instant);
  const name = MONTHS[locale][options.month ?? "short"][month];
  switch (locale) {
    case "en":
      return options.year ? `${name} ${day}, ${year}` : `${name} ${day}`;
    case "ru":
      return options.year ? `${day} ${name} ${year}` : `${day} ${name}`;
    case "uz":
      return options.year ? `${day}-${name} ${year}` : `${day}-${name}`;
  }
}

/** A day and a 24-hour time in Tashkent: "Nov 13, 15:09". */
export function formatDateTime(instant: Date | string, locale: Locale): string {
  return `${formatDate(instant, locale)}, ${tashkentParts(instant).time}`;
}

/** A date column value ("2026-11-10"), which has no time or zone. */
export function formatDay(
  day: string,
  locale: Locale,
  options: { year?: boolean; month?: "short" | "long" } = {},
): string {
  return formatDate(`${day}T12:00:00+05:00`, locale, options);
}

// Month names on their own ("November 2026"); Russian differs from the form used in a date.
const MONTHS_ALONE: Record<Locale, string[]> = {
  en: MONTHS.en.long,
  ru: [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
  ],
  uz: MONTHS.uz.long,
};

/** A month from "YYYY-MM" or "YYYY-MM-01": en "November 2026", ru "ноябрь 2026", uz "noyabr 2026". */
export function formatMonth(month: string, locale: Locale): string {
  const [year, index] = month.split("-").map(Number);
  return `${MONTHS_ALONE[locale][index - 1]} ${year}`;
}
