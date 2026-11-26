/**
 * Rooms — who may do what, the one-group-at-a-time rule, and capacity.
 * docs/SPEC.md → "Roles and permissions", "Screens → Groups", "Screens → Settings".
 * Same setup as permissions.test.ts; every test is rolled back.
 *
 * Seeded: room 1 holds English A2 (Mon/Wed/Fri 15:00–16:30) and English B1
 * (Tue/Thu/Sat 16:30–18:00); room 3 holds Matematika 7-sinf (Mon/Wed/Fri
 * 14:00–15:30), Matematika 9-sinf and the forming Fizika abituriyent
 * (Mon/Wed/Fri 17:00–18:30). Every seeded group has a capacity of 12.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findRoomClash, type RoomGroup } from "../../src/lib/domain/rooms";
import { DB_URL, DENIED, admin, as, connect, disconnect, groupId, roomId, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const detail = (result: Attempt) => (result.ok ? null : result.message);
const today = "public.tashkent_today()";

/** A new group in a room, as the group sheet saves it. */
const group = (
  s: Session,
  options: { name: string; room: string | null; days: number[]; start: string; duration?: number; capacity?: number | null; status?: string },
) =>
  s.attempt(
    `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, duration_min, room_id, capacity, start_date, status)
     values ($1, 'Test', $2, 500000, $3, $4, $5, $6, $7, ${today}, $8)`,
    [
      options.name,
      teacherId(1),
      `{${options.days.join(",")}}`,
      options.start,
      options.duration ?? 90,
      options.room,
      options.capacity === undefined ? 10 : options.capacity,
      options.status ?? "active",
    ],
  );

describe.skipIf(!DB_URL)("Rooms", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("who may do what", () => {
    it("the owner creates, edits and archives rooms", async () => {
      await as("owner", async (s) => {
        expect(await s.count("rooms")).toBe(5);
        expect(code(await s.attempt(`insert into rooms (number, name, capacity) values ('9', 'Kichik xona', 6)`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update rooms set name = 'Yangi nom', capacity = 8 where number = '9'`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update rooms set is_active = false where number = '9'`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update rooms set archived_at = now() where number = '9'`))).toBe("allowed (1)");
      });
    });

    it("a manager reads every room and changes none", async () => {
      await as("manager", async (s) => {
        expect(await s.count("rooms")).toBe(5);
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('9', 6)`))).toBe(DENIED);
        expect(code(await s.attempt(`update rooms set capacity = 99`))).toBe("allowed (0)");
        expect(code(await s.attempt(`update rooms set is_active = false where id = $1`, [roomId(5)]))).toBe("allowed (0)");
        expect(code(await s.attempt(`update rooms set archived_at = now() where id = $1`, [roomId(5)]))).toBe("allowed (0)");
        expect(await s.rows(`select capacity, is_active, archived_at from rooms where id = $1`, [roomId(5)])).toEqual([
          { capacity: 12, is_active: true, archived_at: null },
        ]);
      });
    });

    it("nobody deletes a room, and a visitor sees none", async () => {
      for (const who of ["owner", "manager"] as const) {
        expect(code(await as(who, (s) => s.attempt(`delete from rooms where id = $1`, [roomId(5)])))).toBe(DENIED);
      }
      await as("anon", async (s) => {
        expect(code(await s.attempt(`select * from rooms`))).toBe(DENIED);
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('9', 6)`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.room_clashes($1, '{1}', '15:00', 90)`, [roomId(1)]))).toBe(DENIED);
      });
    });

    it("a room needs a number and a capacity above zero, and a number is used once", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('  ', 6)`))).toBe("23514");
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('9', 0)`))).toBe("23514");
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('9', -3)`))).toBe("23514");
        expect(code(await s.attempt(`insert into rooms (number, name, capacity) values ('9', ' ', 6)`))).toBe("23514");
        // "1" is taken, however it is typed.
        expect(code(await s.attempt(`insert into rooms (number, capacity) values (' 1 ', 6)`))).toBe("23505");
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('2a', 6)`))).toBe("allowed (1)");
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('2A', 6)`))).toBe("23505");
        // An archived room gives its number back.
        expect(code(await s.attempt(`update rooms set archived_at = now() where number = '2a'`))).toBe("allowed (1)");
        expect(code(await s.attempt(`insert into rooms (number, capacity) values ('2A', 6)`))).toBe("allowed (1)");
      });
    });
  });

  describe("a room holds one group at a time", () => {
    it("same day, overlapping time: refused, naming the clashing group", async () => {
      await as("manager", async (s) => {
        // Room 1, Monday 15:00–16:30 is English A2's.
        for (const [days, start, duration] of [
          [[1, 3, 5], "15:00", 90],
          [[1], "16:00", 90],
          [[5], "14:00", 90],
          [[3], "15:30", 30],
          [[1], "13:00", 240],
          [[1, 2], "16:29", 1],
        ] as const) {
          const result = await group(s, { name: "Clash", room: roomId(1), days: [...days], start, duration });
          expect(code(result), `${days} ${start}`).toBe("EM001");
          expect(detail(result)).toContain("English A2");
        }
        expect(await s.count("groups", "name = 'Clash'")).toBe(0);
      });
    });

    it("back-to-back: allowed", async () => {
      await as("manager", async (s) => {
        // Straight after English A2 on its days, and straight before.
        expect(code(await group(s, { name: "After", room: roomId(1), days: [1, 3, 5], start: "16:30" }))).toBe("allowed (1)");
        expect(code(await group(s, { name: "Before", room: roomId(1), days: [1, 3, 5], start: "13:30" }))).toBe("allowed (1)");
        // The room is now full from 13:30 to 18:00 on those days.
        const result = await group(s, { name: "Squeezed", room: roomId(1), days: [3], start: "16:45", duration: 30 });
        expect(code(result)).toBe("EM001");
        expect(detail(result)).toContain("After");
      });
    });

    it("different days: allowed, at the same time", async () => {
      await as("manager", async (s) => {
        expect(code(await group(s, { name: "Sunday", room: roomId(1), days: [7], start: "15:00" }))).toBe("allowed (1)");
        // English A2 has Mon/Wed/Fri; English B1 has Tue/Thu/Sat at 16:30, so 15:00 on those days is free.
        expect(code(await group(s, { name: "Other days", room: roomId(1), days: [2, 4, 6], start: "15:00" }))).toBe("allowed (1)");
      });
    });

    it("another room, or no room, is free", async () => {
      await as("manager", async (s) => {
        expect(code(await group(s, { name: "Elsewhere", room: roomId(2), days: [1, 3, 5], start: "15:00" }))).toBe("allowed (1)");
        expect(code(await group(s, { name: "No room 1", room: null, days: [1, 3, 5], start: "15:00" }))).toBe("allowed (1)");
        expect(code(await group(s, { name: "No room 2", room: null, days: [1, 3, 5], start: "15:00" }))).toBe("allowed (1)");
      });
    });

    it("a forming group has its room booked; a finished or archived one has let it go", async () => {
      await as("owner", async (s) => {
        // Fizika abituriyent is forming in room 3, Mon/Wed/Fri 17:00–18:30.
        const taken = await group(s, { name: "Evening", room: roomId(3), days: [1], start: "17:30" });
        expect(code(taken)).toBe("EM001");
        expect(detail(taken)).toContain("Fizika abituriyent");
        // A new forming group is checked like an active one.
        expect(code(await group(s, { name: "Later", room: roomId(1), days: [1], start: "15:30", status: "forming" }))).toBe("EM001");

        // (It has not started yet, so it ends on its start date.)
        await s.rows(`update groups set status = 'finished', end_date = start_date where id = $1`, [groupId(10)]);
        expect(code(await group(s, { name: "Evening", room: roomId(3), days: [1], start: "17:30" }))).toBe("allowed (1)");
        // Reopening the finished group now clashes with the one that took its place.
        const reopened = await s.attempt(`update groups set status = 'active', end_date = null where id = $1`, [groupId(10)]);
        expect(code(reopened)).toBe("EM001");
        expect(detail(reopened)).toContain("Evening");

        await s.rows(`update groups set archived_at = now() where name = 'Evening'`);
        expect(code(await s.attempt(`update groups set status = 'active', end_date = null where id = $1`, [groupId(10)]))).toBe("allowed (1)");
      });
    });

    it("editing a group checks its new slot, not itself", async () => {
      await as("manager", async (s) => {
        const a2 = groupId(1);
        // The same slot, a new name, a longer lesson into free time: fine.
        expect(code(await s.attempt(`update groups set name = 'English A2+' where id = $1`, [a2]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update groups set start_time = '15:15' where id = $1`, [a2]))).toBe("allowed (1)");
        // Onto English B1's days and time: refused.
        const moved = await s.attempt(`update groups set days = '{2,4}', start_time = '17:00' where id = $1`, [a2]);
        expect(code(moved)).toBe("EM001");
        expect(detail(moved)).toContain("English B1");
        // Into another room where that time is taken.
        const other = await s.attempt(`update groups set room_id = $2, days = '{1,3,5}', start_time = '14:30' where id = $1`, [a2, roomId(3)]);
        expect(code(other)).toBe("EM001");
        expect(detail(other)).toContain("Matematika 7-sinf");
        expect(await s.rows(`select room_id, start_time::text from groups where id = $1`, [a2])).toEqual([
          { room_id: roomId(1), start_time: "15:15:00" },
        ]);
      });
    });

    it("groups that clashed before the rule existed can still be edited, and start on their day", async () => {
      await admin(async (s) => {
        // Two groups put into one slot behind the rule's back, as old data may be.
        await s.rows(`alter table groups disable trigger guard_group_room`);
        await s.rows(
          `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, room_id, capacity, start_date, status)
           values ('Old A', 'Test', $1, 1, '{7}', '10:00', $2, 5, ${today}, 'active'),
                  ('Old B', 'Test', $1, 1, '{7}', '10:30', $2, 5, ${today}, 'forming')`,
          [teacherId(1), roomId(5)],
        );
        await s.rows(`alter table groups enable trigger guard_group_room`);

        expect(code(await s.attempt(`update groups set name = 'Old A renamed', monthly_fee = 2, capacity = 6 where name = 'Old A'`))).toBe("allowed (1)");
        // The daily job turns the forming one active without tripping over the old clash.
        expect(code(await s.attempt(`select public.activate_started_groups()`))).toMatch(/^allowed/);
        expect(await s.rows(`select status from groups where name = 'Old B'`)).toEqual([{ status: "active" }]);
        // Touching the schedule is where it is caught.
        expect(code(await s.attempt(`update groups set start_time = '10:15' where name = 'Old B'`))).toBe("EM001");
      });
    });

    it("room_clashes() agrees with findRoomClash() for every slot tried", async () => {
      await as("owner", async (s) => {
        const groups = await s.rows<RoomGroup>(
          `select id, name, room_id, days, to_char(start_time, 'HH24:MI') as start_time, duration_min, status, archived_at::text from groups`,
        );
        let clashes = 0;
        for (const room of [roomId(1), roomId(3), roomId(5)]) {
          for (const days of [[1], [2], [1, 2], [6, 7], [3, 5]]) {
            for (const start of ["08:00", "13:59", "14:00", "15:29", "15:30", "16:30", "17:00", "18:29", "18:30", "20:00"]) {
              for (const duration of [30, 90, 240]) {
                const [row] = await s.rows<{ group_name: string }>(
                  `select group_name from public.room_clashes($1, $2, $3, $4) limit 1`,
                  [room, `{${days.join(",")}}`, start, duration],
                );
                const expected = findRoomClash(room, { days, start_time: start, duration_min: duration }, groups);
                expect(row?.group_name ?? null, `${room} ${days} ${start} ${duration}`).toBe(expected?.name ?? null);
                if (expected) clashes += 1;
              }
            }
          }
        }
        // The grid really exercises both answers.
        expect(clashes).toBeGreaterThan(40);
        expect(clashes).toBeLessThan(400);
      });
    });
  });

  describe("capacity", () => {
    it("a group cannot be larger than its room", async () => {
      await as("manager", async (s) => {
        // Room 5 holds 12.
        const over = await group(s, { name: "Too big", room: roomId(5), days: [7], start: "09:00", capacity: 13 });
        expect(code(over)).toBe("EM002");
        expect(code(await group(s, { name: "Fits", room: roomId(5), days: [7], start: "09:00", capacity: 12 }))).toBe("allowed (1)");
        expect(code(await group(s, { name: "Open", room: roomId(5), days: [7], start: "12:00", capacity: null }))).toBe("allowed (1)");
        expect(code(await s.attempt(`update groups set capacity = 13 where name = 'Fits'`))).toBe("EM002");
        // Moving a group of 12 into a room that holds 12 is fine; a room of 14 too.
        expect(code(await s.attempt(`update groups set room_id = $1, days = '{7}' where id = $2`, [roomId(1), groupId(9)]))).toBe("allowed (1)");
      });
    });

    it("a room cannot be made smaller than a group that uses it", async () => {
      await as("owner", async (s) => {
        // Room 1 holds 14 and its groups are 12 each.
        expect(code(await s.attempt(`update rooms set capacity = 12 where id = $1`, [roomId(1)]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update rooms set capacity = 11 where id = $1`, [roomId(1)]))).toBe("EM004");
        expect(code(await s.attempt(`update rooms set capacity = 30 where id = $1`, [roomId(1)]))).toBe("allowed (1)");
      });
    });
  });

  describe("archiving and switching off", () => {
    it("a room in use cannot be archived; a free one can", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update rooms set archived_at = now() where id = $1`, [roomId(1)]))).toBe("EM003");
        // Room 4's two groups finish: now it can go.
        await s.rows(`update groups set status = 'finished', end_date = ${today} where room_id = $1`, [roomId(4)]);
        expect(code(await s.attempt(`update rooms set archived_at = now() where id = $1`, [roomId(4)]))).toBe("allowed (1)");
        // The finished groups keep their room in their history.
        expect(await s.count("groups", `room_id = '${roomId(4)}'`)).toBe(2);
      });
    });

    it("a forming group also keeps a room from being archived", async () => {
      await as("owner", async (s) => {
        await s.rows(`update groups set status = 'finished', end_date = ${today} where room_id = $1 and status = 'active'`, [roomId(3)]);
        // Only the forming Fizika abituriyent is left in room 3.
        expect(code(await s.attempt(`update rooms set archived_at = now() where id = $1`, [roomId(3)]))).toBe("EM003");
      });
    });

    it("a room that is switched off or archived is not given to a group, but keeps the groups it has", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update rooms set is_active = false where id = $1`, [roomId(5)]))).toBe("allowed (1)");
        expect(code(await group(s, { name: "New", room: roomId(5), days: [7], start: "09:00" }))).toBe("EM005");
        // Python dasturlash is already there and can still be edited.
        expect(code(await s.attempt(`update groups set name = 'Python 2', start_time = '18:00' where id = $1`, [groupId(9)]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update groups set room_id = $1, days = '{7}' where id = $2`, [roomId(5), groupId(1)]))).toBe("EM005");
      });
    });
  });
});
