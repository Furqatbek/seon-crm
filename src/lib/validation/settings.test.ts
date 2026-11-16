import { describe, expect, it } from "vitest";

import { roomSchema } from "./settings";

describe("roomSchema", () => {
  it("takes what the form sends: a typed capacity and an optional name", () => {
    expect(roomSchema.parse({ number: " 2A ", name: "  Big hall ", capacity: "12", is_active: true })).toEqual({
      number: "2A",
      name: "Big hall",
      capacity: 12,
      is_active: true,
    });
    // No name is no name, not an error.
    expect(roomSchema.parse({ number: "3", name: "", capacity: 8, is_active: false })).toMatchObject({ name: null });
    expect(roomSchema.parse({ number: "3", name: "   ", capacity: 8, is_active: true })).toMatchObject({ name: null });
  });

  it("needs a number and a capacity from 1 to 500", () => {
    const error = (input: unknown) => roomSchema.safeParse(input).error?.issues[0]?.message;
    expect(error({ number: "  ", name: "", capacity: 8, is_active: true })).toBe("numberRequired");
    for (const capacity of ["", "0", "-2", "501", "1.5", "abc"]) {
      expect(error({ number: "3", name: "", capacity, is_active: true }), capacity).toBe("capacityInvalid");
    }
    expect(roomSchema.safeParse({ number: "3", name: "", capacity: "500", is_active: true }).success).toBe(true);
  });
});
