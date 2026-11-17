import { describe, expect, it } from "vitest";

import { inTashkentMonth, rankByPoints, tashkentMonthRange, tvName } from "./leaderboard";

describe("rankByPoints", () => {
  it("ties share a rank and the next one skips: 1, 2, 2, 4", () => {
    const ranked = rankByPoints([
      { name: "Dilnoza", points: 12 },
      { name: "Akmal", points: 30 },
      { name: "Bobur", points: 12 },
      { name: "Zarina", points: 5 },
    ]);
    expect(ranked.map((row) => [row.rank, row.name])).toEqual([
      [1, "Akmal"],
      [2, "Bobur"],
      [2, "Dilnoza"],
      [4, "Zarina"],
    ]);
  });

  it("everyone on the same points shares first place, by name", () => {
    expect(rankByPoints([{ name: "B", points: 0 }, { name: "A", points: 0 }]).map((row) => [row.rank, row.name])).toEqual([
      [1, "A"],
      [1, "B"],
    ]);
    expect(rankByPoints([])).toEqual([]);
  });
});

describe("the month boundary", () => {
  it("is 00:00 in Tashkent, which is 19:00 UTC the day before", () => {
    expect(tashkentMonthRange("2026-11")).toEqual({ start: "2026-10-31T19:00:00.000Z", end: "2026-11-30T19:00:00.000Z" });
    expect(tashkentMonthRange("2026-12")).toEqual({ start: "2026-11-30T19:00:00.000Z", end: "2026-12-31T19:00:00.000Z" });
  });

  it("a row at 23:59 Tashkent on the last day is this month; at 00:00 it is the next", () => {
    expect(inTashkentMonth("2026-11-30T23:59:59+05:00", "2026-11")).toBe(true);
    expect(inTashkentMonth("2026-12-01T00:00:00+05:00", "2026-11")).toBe(false);
    expect(inTashkentMonth("2026-12-01T00:00:00+05:00", "2026-12")).toBe(true);
    // Still 30 November in UTC, already December in Tashkent.
    expect(inTashkentMonth("2026-11-30T20:00:00Z", "2026-12")).toBe(true);
  });
});

describe("tvName", () => {
  it("is the first name and the last initial", () => {
    expect(tvName("Akmal Ismoilov")).toBe("Akmal I.");
    expect(tvName("  Oysha  Oʻktamova ")).toBe("Oysha O.");
    expect(tvName("Ali Vali oʻgʻli Karimov")).toBe("Ali K.");
    expect(tvName("Madina")).toBe("Madina");
  });
});
