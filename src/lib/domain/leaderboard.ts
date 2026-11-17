/**
 * Leaderboard rules — docs/SPEC.md → "Points and rewards add-on →
 * Leaderboard rules". Pure functions; leaderboard() and tv_board() in
 * supabase/migrations/20261121100000_leaderboards.sql follow the same rules.
 */

export type Ranked<T> = T & { rank: number };

/**
 * Most points first. Ties share a rank and the next rank skips (1, 2, 2, 4);
 * inside a tie the order is by name.
 */
export function rankByPoints<T extends { name: string; points: number }>(rows: readonly T[]): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.points !== sorted[index - 1].points) rank = index + 1;
    return { ...row, rank };
  });
}

/** The first and last moment of a Tashkent month ("YYYY-MM") as ISO instants: `>= start`, `< end`. */
export function tashkentMonthRange(month: string): { start: string; end: string } {
  const [year, index] = month.split("-").map(Number);
  // Tashkent is UTC+5 all year: its midnight is 19:00 UTC the day before.
  const midnight = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1, -5)).toISOString();
  return { start: midnight(year, index), end: midnight(year, index + 1) };
}

/** Whether a ledger row posted at `instant` belongs to that Tashkent month. */
export function inTashkentMonth(instant: string, month: string): boolean {
  const { start, end } = tashkentMonthRange(month);
  const at = new Date(instant).toISOString();
  return at >= start && at < end;
}

/** The name shown on the TV: first name and last initial. "Akmal Ismoilov" → "Akmal I." */
export function tvName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${[...parts[parts.length - 1]][0]}.`;
}
