/**
 * Settings and users — what the database itself enforces.
 * docs/SPEC.md → "Screens → Settings", "Roles and permissions".
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, as, connect, disconnect, type Attempt } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);

describe.skipIf(!DB_URL)("Settings and users", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("a deactivated user is blocked by the database", () => {
    it("the owner deactivates a manager, and from that moment they get no rows and can write nothing", async () => {
      // The same signed-in manager, before and after: no new sign-in is involved.
      const visible = (who: "manager") =>
        as(who, async (s) => ({
          students: await s.count("students"),
          groups: await s.count("groups"),
          payments: await s.count("payments"),
          profiles: await s.count("profiles"),
          settings: await s.count("centre_settings"),
          write: code(await s.attempt(`update profiles set full_name = 'Still here' where id = $1`, [MANAGER_ID])),
          debtors: code(await s.attempt(`select * from public.list_debtors()`)),
        }));
      const before = await visible("manager");
      expect(before.students).toBeGreaterThan(50);
      expect(before.write).toBe("allowed (1)");

      await as("owner", async (s) => {
        expect(code(await s.attempt(`update profiles set is_active = false where id = $1`, [MANAGER_ID]))).toBe("allowed (1)");
        // Still inside the owner's transaction: the manager's own session, right after.
        await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: MANAGER_ID, role: "authenticated" })]);
        expect(await s.count("students")).toBe(0);
        expect(await s.count("groups")).toBe(0);
        expect(await s.count("payments")).toBe(0);
        expect(await s.count("profiles")).toBe(0);
        expect(await s.count("centre_settings")).toBe(0);
        expect(await s.count("student_balances")).toBe(0);
        expect(code(await s.attempt(`update profiles set full_name = 'Still here' where id = $1`, [MANAGER_ID]))).toBe("allowed (0)");
        expect(code(await s.attempt(`update profiles set is_active = true where id = $1`, [MANAGER_ID]))).toBe("allowed (0)");
        expect(
          code(await s.attempt(`insert into leads (full_name, phone, source, created_by) values ('X', '+998901112233', 'other', $1)`, [MANAGER_ID])),
        ).toBe(DENIED);
        expect(await s.rows(`select public.is_staff() as staff, public.app_role() as role`)).toEqual([{ staff: false, role: null }]);
      });
    });
  });

  describe("roles", () => {
    it("the centre always keeps one active owner", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update profiles set role = 'manager' where id = $1`, [OWNER_ID]))).toBe("EU001");
        expect(code(await s.attempt(`update profiles set is_active = false where id = $1`, [OWNER_ID]))).toBe("EU001");
        // With a second owner, the first can step down.
        expect(code(await s.attempt(`update profiles set role = 'owner' where id = $1`, [MANAGER_ID]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update profiles set role = 'manager' where id = $1`, [OWNER_ID]))).toBe("allowed (1)");
        // And is now a manager: no more role changes.
        expect(code(await s.attempt(`update profiles set role = 'owner' where id = $1`, [OWNER_ID]))).toBe(DENIED);
      });
    });

    it("a manager changes their own name and language, and nothing else about anyone", async () => {
      await as("manager", async (s) => {
        expect(code(await s.attempt(`update profiles set full_name = 'New Name', language = 'en' where id = $1`, [MANAGER_ID]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update profiles set role = 'owner' where id = $1`, [MANAGER_ID]))).toBe(DENIED);
        expect(code(await s.attempt(`update profiles set is_active = false where id = $1`, [MANAGER_ID]))).toBe(DENIED);
        expect(code(await s.attempt(`update profiles set full_name = 'Hacked' where id = $1`, [OWNER_ID]))).toBe("allowed (0)");
        expect(code(await s.attempt(`update profiles set is_active = false where id = $1`, [OWNER_ID]))).toBe("allowed (0)");
      });
    });
  });

  describe("centre settings and templates are the owner's", () => {
    it("the owner saves them; the due day cannot be before the billing day", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update centre_settings set centre_name = 'Seon', billing_day = 3, due_day = 10`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update centre_settings set billing_day = 10, due_day = 5`))).toBe("23514");
        expect(code(await s.attempt(`update centre_settings set due_day = 29`))).toBe("23514");
        expect(code(await s.attempt(`update centre_settings set reminders_enabled = false, lesson_reminder_hours = 5, quiet_from = '22:00', quiet_to = '08:00'`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update message_templates set body = 'Salom, {student}!' where type = 'custom' and channel = 'sms' and language = 'uz'`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update message_templates set body = '  '`))).toBe("23514");
      });
    });

    it("a manager reads them and changes nothing", async () => {
      await as("manager", async (s) => {
        expect(await s.count("centre_settings")).toBe(1);
        expect(await s.count("message_templates")).toBe(24);
        expect(code(await s.attempt(`update centre_settings set centre_name = 'Mine'`))).toBe("allowed (0)");
        expect(code(await s.attempt(`update centre_settings set reminders_enabled = false`))).toBe("allowed (0)");
        expect(code(await s.attempt(`update message_templates set body = 'x'`))).toBe("allowed (0)");
        expect(
          code(await s.attempt(`insert into message_templates (type, channel, language, body) values ('custom', 'sms', 'uz', 'x')`)),
        ).toBe(DENIED);
      });
    });
  });
});
