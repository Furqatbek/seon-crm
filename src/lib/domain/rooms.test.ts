import { describe, expect, it } from "vitest";

import { findRoomClash, roomLabel, slotsOverlap, usesRoom, type RoomGroup, type Slot } from "./rooms";

const ROOM = "room-1";
const OTHER_ROOM = "room-2";

const group = (extra: Partial<RoomGroup> = {}): RoomGroup => ({
  id: "g1",
  name: "English B1",
  room_id: ROOM,
  days: [1, 3, 5],
  start_time: "18:00",
  duration_min: 90,
  status: "active",
  archived_at: null,
  ...extra,
});

/** English B1 has the room Mon, Wed, Fri 18:00–19:30. */
const TAKEN = [group()];
const slot = (days: number[], start_time: string, duration_min = 90): Slot => ({ days, start_time, duration_min });
const clash = (candidate: Slot, groups = TAKEN, exceptId?: string) =>
  findRoomClash(ROOM, candidate, groups, exceptId)?.name ?? null;

describe("the overlap rule", () => {
  it("same day, overlapping time: refused, and it names the clashing group", () => {
    // The same slot.
    expect(clash(slot([1, 3, 5], "18:00"))).toBe("English B1");
    // Starts while the other is running.
    expect(clash(slot([1], "19:00"))).toBe("English B1");
    // Still running when the other starts.
    expect(clash(slot([3], "17:00"))).toBe("English B1");
    // Sits inside the other.
    expect(clash(slot([5], "18:30", 30))).toBe("English B1");
    // Covers the other entirely.
    expect(clash(slot([1], "17:00", 240))).toBe("English B1");
    // One shared weekday is enough.
    expect(clash(slot([2, 4, 5], "18:00"))).toBe("English B1");
    // One minute of overlap is an overlap.
    expect(clash(slot([1], "19:29"))).toBe("English B1");
    expect(clash(slot([1], "16:31"))).toBe("English B1");
  });

  it("back-to-back: allowed", () => {
    // Starts the minute the other ends.
    expect(clash(slot([1, 3, 5], "19:30"))).toBeNull();
    // Ends the minute the other starts.
    expect(clash(slot([1, 3, 5], "16:30"))).toBeNull();
    expect(clash(slot([1], "17:00", 60))).toBeNull();
  });

  it("different days: allowed, at the very same time", () => {
    expect(clash(slot([2, 4, 6], "18:00"))).toBeNull();
    expect(clash(slot([7], "18:00", 480))).toBeNull();
  });

  it("another room is another matter", () => {
    expect(findRoomClash(OTHER_ROOM, slot([1, 3, 5], "18:00"), TAKEN)).toBeNull();
    expect(clash(slot([1], "18:00"), [group({ room_id: null })])).toBeNull();
  });

  it("a group does not clash with itself when it is edited", () => {
    expect(clash(slot([1, 3, 5], "18:15"), TAKEN, "g1")).toBeNull();
    expect(clash(slot([1, 3, 5], "18:15"), TAKEN, "g2")).toBe("English B1");
  });

  it("only groups that use the room count: active or forming, and not archived", () => {
    const same = slot([1, 3, 5], "18:00");
    expect(clash(same, [group({ status: "forming" })])).toBe("English B1");
    expect(clash(same, [group({ status: "finished" })])).toBeNull();
    expect(clash(same, [group({ archived_at: "2026-11-01T00:00:00Z" })])).toBeNull();
    expect(usesRoom({ status: "active", archived_at: null })).toBe(true);
    expect(usesRoom({ status: "forming", archived_at: null })).toBe(true);
    expect(usesRoom({ status: "finished", archived_at: null })).toBe(false);
    expect(usesRoom({ status: "active", archived_at: "2026-11-01T00:00:00Z" })).toBe(false);
  });

  it("names the first clashing group by name when there are several", () => {
    const groups = [
      group({ id: "g2", name: "Rus tili", days: [1], start_time: "18:30" }),
      group({ id: "g1", name: "English B1" }),
    ];
    expect(clash(slot([1], "18:45", 30), groups)).toBe("English B1");
  });

  it("reads times with seconds, as the database stores them", () => {
    expect(slotsOverlap(slot([1], "18:00:00"), slot([1], "19:29:00"))).toBe(true);
    expect(slotsOverlap(slot([1], "18:00:00"), slot([1], "19:30:00"))).toBe(false);
  });

  it("is the same whichever slot is asked first", () => {
    const a = slot([1, 2], "10:00", 60);
    for (const b of [slot([2], "10:59", 30), slot([2], "11:00", 30), slot([3], "10:00", 60), slot([1], "09:00", 61)]) {
      expect(slotsOverlap(a, b)).toBe(slotsOverlap(b, a));
    }
  });
});

describe("roomLabel", () => {
  it('is "number · name", or the number alone when the room has no name', () => {
    expect(roomLabel({ number: "3", name: "Katta zal" })).toBe("3 · Katta zal");
    expect(roomLabel({ number: "2A", name: null })).toBe("2A");
    expect(roomLabel({ number: "5", name: "  " })).toBe("5");
  });
});
