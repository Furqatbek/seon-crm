import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compares a secret a request presents with the one we hold, in constant
 * time. False when either is missing: an unset secret never opens a route.
 */
export function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}
