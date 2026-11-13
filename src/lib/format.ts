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

const AXIS_UNITS: Record<Locale, { million: string; thousand: string }> = {
  en: { million: "M", thousand: "K" },
  ru: { million: " млн", thousand: " тыс." },
  uz: { million: " mln", thousand: " ming" },
};

/**
 * Whole soʻm shortened for a chart axis, where the full amount does not fit:
 * 45000000 → en "45M", ru "45 млн", uz "45 mln"; 2500000 → "2.5M"; 500000 → "500K".
 * Axis ticks only: every amount a person reads off is written by formatMoney().
 */
export function formatMoneyAxis(amount: number, locale: Locale): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`formatMoneyAxis expects whole soʻm, got ${amount}`);
  const sign = amount < 0 ? MINUS : "";
  const value = Math.abs(amount);
  const units = AXIS_UNITS[locale];
  const decimal = locale === "en" ? "." : ",";
  const short = (divisor: number) => {
    // One decimal at most, cut and not rounded up, written without floats.
    const tenths = Math.floor((value * 10) / divisor);
    return tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)}${decimal}${tenths % 10}`;
  };
  if (value >= 1_000_000) return `${sign}${short(1_000_000)}${units.million}`;
  if (value >= 1_000) return `${sign}${short(1_000)}${units.thousand}`;
  return `${sign}${value}`;
}

/** A rate with one decimal: 92.8 → en "92.8%", ru and uz "92,8%". */
export function formatPercent(value: number, locale: Locale): string {
  const tenths = Math.round(value * 10);
  const whole = Math.trunc(tenths / 10);
  const rest = Math.abs(tenths % 10);
  const sign = tenths < 0 && whole === 0 ? MINUS : "";
  return `${sign}${String(whole).replace("-", MINUS)}${rest === 0 ? "" : `${locale === "en" ? "." : ","}${rest}`}%`;
}

/** A month for a chart axis, from "YYYY-MM" or "YYYY-MM-01": en "Nov 26", ru "нояб. 26", uz "noy 26". */
export function formatMonthShort(month: string, locale: Locale): string {
  const [year, index] = month.split("-").map(Number);
  return `${MONTHS_SHORT_ALONE[locale][index - 1]} ${String(year).slice(2)}`;
}

/** Whole soʻm as the starting value of a money input: 600000 → "600 000". */
export function formatMoneyInput(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`formatMoneyInput expects whole soʻm, got ${amount}`);
  }
  return groupDigits(String(amount), " ");
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

// Months standing alone, short: Russian needs the nominative ("май", not "мая").
const MONTHS_SHORT_ALONE: Record<Locale, string[]> = {
  en: MONTHS.en.short,
  ru: ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."],
  uz: MONTHS.uz.short,
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
