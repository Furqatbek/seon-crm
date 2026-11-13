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
