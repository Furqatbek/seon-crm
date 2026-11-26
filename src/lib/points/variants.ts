// Pure helpers about reward variants, usable in client components.

import type { Reward } from "./queries";

/** A variant's name in an interface language, falling back to Uzbek. */
export function variantLabel(name: unknown, locale: string): string {
  const names = (name && typeof name === "object" ? name : {}) as Record<string, unknown>;
  const pick = (key: string) => (typeof names[key] === "string" && names[key] ? (names[key] as string) : null);
  return pick(locale) ?? pick("uz") ?? pick("en") ?? "";
}

/** What can still be ordered: the variants' units when there are variants, else the reward's own. null = unlimited. */
export function rewardStockLeft(reward: Pick<Reward, "stock" | "variants">): number | null {
  if (reward.variants.length === 0) return reward.stock;
  return reward.variants.some((variant) => variant.stock === null) ? null : reward.variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);
}
