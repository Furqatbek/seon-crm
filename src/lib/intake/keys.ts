// Keys for website sources — docs/SPEC.md → "Lead forms add-on → Public intake
// URL and Meta lead ads". A key is shown once, when it is made; the database
// keeps only its SHA-256 and a short prefix to tell keys apart.

import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY = /^lk_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/;

function random(length: number): string {
  let out = "";
  // Bytes above 247 are thrown away, so every character is equally likely.
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248 && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

/** "lk_ab12cd34_…": `prefix` is the part that may be shown again, `hash` is what is stored. */
export function generateKey(): { key: string; prefix: string; hash: string } {
  const prefix = `lk_${random(8)}`;
  const key = `${prefix}_${random(32)}`;
  return { key, prefix, hash: hashKey(key) };
}

/** SHA-256 of a key, in hex: what intake_sources.key_hash holds. */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Whether a string has the shape of a key. Anything else is refused without asking the database. */
export function looksLikeKey(value: string | null | undefined): value is string {
  return typeof value === "string" && KEY.test(value);
}

/**
 * The key a request presents: `Authorization: Bearer <key>`, or `?key=` for
 * page builders that cannot set headers. The header wins when both are there.
 */
export function presentedKey(authorization: string | null | undefined, queryKey: string | null | undefined): string | null {
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "")?.[1];
  const key = bearer ?? queryKey?.trim() ?? null;
  return looksLikeKey(key) ? key : null;
}
