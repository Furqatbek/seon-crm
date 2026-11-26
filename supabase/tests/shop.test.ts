/**
 * The Shop — docs/STUDENT_APP_SPEC.md → "App behaviour → Shop", "Users, roles
 * and access". Variants with their own stock, Ready for pickup, a student
 * ordering and cancelling in the app, and an app user who can never order.
 * Most tests are rolled back; the one about two orders at the same moment
 * needs two real connections and commits, and deletes what it made.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, admin, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);

const STUDENT_USER = "0000000c-0000-4000-8000-000000000001";
const OTHER_USER = "0000000c-0000-4000-8000-000000000002";
const APP_USER = "0000000c-0000-4000-8000-000000000003";

let student = "";
let other = "";
let shirt = "";
let sizeM = "";
let sizeL = "";
let notebook = "";

/** A student with coins and an app account linked by phone. */
async function linkedStudent(s: Session, user: string, phone: string, coins: number): Promise<string> {
  const id = (await s.rows<{ id: string }>(`insert into students (full_name, phone) values ('Shop Student', $1) returning id`, [phone]))[0].id;
  if (coins > 0) await s.rows(`insert into points_ledger (student_id, delta, source, reason) values ($1, $2, 'owner_adjustment', 'Test')`, [id, coins]);
  await s.rows(
    `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), '{"full_name":"Shop Student"}')`,
    [user, phone.slice(1)],
  );
  return id;
}

/** A T-shirt in M (3 left) and L (1 left), a notebook without variants (2 left), two linked students and an app user. */
const setup = async (s: Session) => {
  student = await linkedStudent(s, STUDENT_USER, "+998770001001", 128);
  other = await linkedStudent(s, OTHER_USER, "+998770001002", 500);
  await s.rows(
    `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', '998770001003', now(), '{"full_name":"App User"}')`,
    [APP_USER],
  );
  await s.rows(`insert into locked_coins (profile_id, amount) values ($1, 500)`, [APP_USER]);
  shirt = (await s.rows<{ id: string }>(`insert into rewards (name, cost, stock) values ('Brendli futbolka', 100, null) returning id`))[0].id;
  notebook = (await s.rows<{ id: string }>(`insert into rewards (name, cost, stock) values ('Daftar', 25, 2) returning id`))[0].id;
  const variants = await s.rows<{ id: string; size: string }>(
    `insert into reward_variants (reward_id, name, stock) values
       ($1, '{"uz":"M","ru":"M","en":"M","ko":"M"}', 3), ($1, '{"uz":"L","ru":"L","en":"L","ko":"L"}', 1)
     returning id, name ->> 'en' as size`,
    [shirt],
  );
  sizeM = variants.find((v) => v.size === "M")!.id;
  sizeL = variants.find((v) => v.size === "L")!.id;
};

const balance = async (s: Session, id: string) =>
  (await s.rows<{ n: number }>(`select coalesce(sum(delta), 0)::int as n from points_ledger where student_id = $1`, [id]))[0].n;
const variantStock = async (s: Session, id: string) => (await s.rows<{ stock: number | null }>(`select stock from reward_variants where id = $1`, [id]))[0].stock;
const rewardStock = async (s: Session, id: string) => (await s.rows<{ stock: number | null }>(`select stock from rewards where id = $1`, [id]))[0].stock;
/** What the owner of the database sees, from inside a signed-in session. */
const asOwnerOfDb = async <T>(s: Session, fn: () => Promise<T>): Promise<T> => {
  await s.rows(`reset role`);
  try {
    return await fn();
  } finally {
    await s.rows(`set local role authenticated`);
  }
};
const order = (s: Session, reward: string, variant: string | null = null, forStudent: string | null = null) =>
  s.attempt(`select public.request_reward($1, $2, p_variant_id => $3) as id`, [forStudent, reward, variant]);

describe.skipIf(!DB_URL)("The Shop", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("a linked student orders in the app", () => {
    it("a size M T-shirt: coins held, one unit of M taken, the order is theirs", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        const made = await order(s, shirt, sizeM);
        expect(code(made)).toBe("allowed");
        const mine = await s.rows(`select reward_name, variant_name ->> 'uz' as size, cost, status from my_orders()`);
        expect(mine).toEqual([{ reward_name: "Brendli futbolka", size: "M", cost: 100, status: "requested" }]);
        expect(await s.rows(`select via, requested_by, student_id from redemptions`)).toEqual([{ via: "app", requested_by: "student", student_id: student }]);
        await asOwnerOfDb(s, async () => {
          expect(await balance(s, student)).toBe(28);
          expect(await variantStock(s, sizeM)).toBe(2);
          expect(await variantStock(s, sizeL)).toBe(1);
        });
      }, setup);
    });

    it("always for themselves, whoever they name", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        expect(code(await order(s, notebook, null, other))).toBe("allowed");
        await asOwnerOfDb(s, async () => {
          expect(await balance(s, student)).toBe(103);
          expect(await balance(s, other)).toBe(500);
          expect(await s.rows(`select student_id from redemptions`)).toEqual([{ student_id: student }]);
        });
      }, setup);
    });

    it("a reward with variants needs one of its own", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        expect(code(await order(s, shirt))).toBe("ER006");
        expect(code(await order(s, notebook, sizeM))).toBe("ER006");
        const foreign = (await asOwnerOfDb(s, () =>
          s.rows<{ id: string }>(`insert into reward_variants (reward_id, name, stock) values ($1, '{"en":"Blue"}', 5) returning id`, [notebook])))[0].id;
        expect(code(await order(s, shirt, foreign))).toBe("ER006");
      }, setup);
    });

    it("not enough coins, and a variant that has run out, are refused without taking anything", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        expect(code(await order(s, shirt, sizeM))).toBe("allowed");
        // 28 coins left.
        expect(code(await order(s, shirt, sizeL))).toBe("ER001");
        await asOwnerOfDb(s, () => s.rows(`update reward_variants set stock = 0 where id = $1`, [sizeL]));
        await asOwnerOfDb(s, () => s.rows(`insert into points_ledger (student_id, delta, source, reason) values ($1, 500, 'owner_adjustment', 'Test')`, [student]));
        expect(code(await order(s, shirt, sizeL))).toBe("ER002");
        await asOwnerOfDb(s, async () => {
          expect(await balance(s, student)).toBe(528);
          expect(await variantStock(s, sizeL)).toBe(0);
        });
      }, setup);
    });

    it("an archived variant is not on offer and cannot be ordered", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        expect((await s.rows(`select id from reward_variants where reward_id = $1`, [shirt])).length).toBe(1);
        expect(code(await order(s, shirt, sizeL))).toBe("ER006");
      }, async (s) => {
        await setup(s);
        await s.rows(`update reward_variants set archived_at = now() where id = $1`, [sizeL]);
      });
    });

    it("Cancel while Requested returns the coins and the unit of stock", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        const shirtOrder = (await order(s, shirt, sizeM)) as unknown as { rows: Array<{ id: string }> };
        const bookOrder = (await order(s, notebook)) as unknown as { rows: Array<{ id: string }> };
        await asOwnerOfDb(s, async () => {
          expect(await balance(s, student)).toBe(3);
          expect(await variantStock(s, sizeM)).toBe(2);
          expect(await rewardStock(s, notebook)).toBe(1);
        });

        expect((await s.rows(`select handle_redemption($1, 'cancel') as status`, [shirtOrder.rows[0].id]))[0]).toEqual({ status: "cancelled" });
        expect((await s.rows(`select handle_redemption($1, 'cancel') as status`, [bookOrder.rows[0].id]))[0]).toEqual({ status: "cancelled" });
        await asOwnerOfDb(s, async () => {
          expect(await balance(s, student)).toBe(128);
          expect(await variantStock(s, sizeM)).toBe(3);
          expect(await rewardStock(s, notebook)).toBe(2);
          // The hold and the return are both in the ledger: nothing is rewritten.
          expect(await s.rows(`select delta, source from points_ledger where redemption_id = $1 order by delta`, [shirtOrder.rows[0].id])).toEqual([
            { delta: -100, source: "reward_hold" },
            { delta: 100, source: "reward_return" },
          ]);
          expect((await s.rows(`select note from redemptions where id = $1`, [shirtOrder.rows[0].id]))[0]).toEqual({ note: "cancelled_by_student" });
        });
        // Cancelling twice returns nothing twice.
        expect(code(await s.attempt(`select handle_redemption($1, 'cancel')`, [shirtOrder.rows[0].id]))).toBe("ER007");
        expect((await s.rows(`select status, note from my_orders() order by cost desc`))).toEqual([
          { status: "cancelled", note: null },
          { status: "cancelled", note: null },
        ]);
      }, setup);
    });

    it("cannot cancel once it is Ready, cannot cancel someone else's order, and can do nothing but cancel", async () => {
      let ready = "";
      let theirs = "";
      await as({ userId: STUDENT_USER }, async (s) => {
        expect(code(await s.attempt(`select handle_redemption($1, 'cancel')`, [ready]))).toBe("ER007");
        expect(code(await s.attempt(`select handle_redemption($1, 'cancel')`, [theirs]))).toBe("P0002");
        for (const action of ["ready", "give", "reject"]) {
          expect(code(await s.attempt(`select handle_redemption($1, $2, 'because')`, [ready, action])), action).toBe(DENIED);
        }
        // Only their own orders are listed.
        expect((await s.rows(`select id from my_orders()`)).map((row) => (row as { id: string }).id)).toEqual([ready]);
        expect(await s.rows(`select distinct student_id from redemptions`)).toEqual([{ student_id: student }]);
      }, async (s) => {
        await setup(s);
        ready = (await s.rows<{ id: string }>(`select request_reward($1, $2, p_variant_id => $3) as id`, [student, shirt, sizeM]))[0].id;
        await s.rows(`select handle_redemption($1, 'ready')`, [ready]);
        theirs = (await s.rows<{ id: string }>(`select request_reward($1, $2) as id`, [other, notebook]))[0].id;
      });
    });
  });

  describe("an app user", () => {
    it("browses the shop but the database refuses their order", async () => {
      await as({ userId: APP_USER }, async (s) => {
        expect(await s.count("rewards", `id in ('${shirt}', '${notebook}')`)).toBe(2);
        expect((await s.rows(`select id from reward_variants where reward_id = $1`, [shirt])).length).toBe(2);
        // For nobody, for a real student, with or without a variant: always refused.
        expect(code(await order(s, shirt, sizeM))).toBe(DENIED);
        expect(code(await order(s, shirt, sizeM, student))).toBe(DENIED);
        expect(code(await order(s, notebook, null, student))).toBe(DENIED);
        expect(code(await s.attempt(`select public.request_reward($1, $2, 'bot', 'student')`, [student, notebook]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into redemptions (student_id, reward_id, cost, via, requested_by) values ($1, $2, 1, 'app', 'student')`, [student, notebook]))).toBe(DENIED);
        expect(await s.rows(`select * from my_orders()`)).toEqual([]);
        await asOwnerOfDb(s, async () => {
          expect(await s.count("redemptions", `reward_id in ('${shirt}', '${notebook}')`)).toBe(0);
          expect(await variantStock(s, sizeM)).toBe(3);
          expect(await balance(s, student)).toBe(128);
        });
      }, setup);
    });
  });

  describe("staff: Ready before Give", () => {
    it("Requested → Ready → Given; Ready is not final and can still be rejected with the coins and stock back", async () => {
      let first = "";
      let second = "";
      await as("manager", async (s) => {
        expect((await s.rows(`select handle_redemption($1, 'ready') as status`, [first]))[0]).toEqual({ status: "ready" });
        expect((await s.rows(`select status, ready_at is not null as at, ready_by, handled_at from redemptions where id = $1`, [first]))[0]).toEqual({
          status: "ready", at: true, ready_by: MANAGER_ID, handled_at: null,
        });
        // Ready twice is refused; it stays Ready.
        expect(code(await s.attempt(`select handle_redemption($1, 'ready')`, [first]))).toBe("ER003");
        expect((await s.rows(`select handle_redemption($1, 'give') as status`, [first]))[0]).toEqual({ status: "given" });
        expect(code(await s.attempt(`select handle_redemption($1, 'ready')`, [first]))).toBe("ER003");
        expect(code(await s.attempt(`select handle_redemption($1, 'reject', 'late')`, [first]))).toBe("ER003");

        await s.rows(`select handle_redemption($1, 'ready')`, [second]);
        expect(code(await s.attempt(`select handle_redemption($1, 'reject')`, [second]))).toBe("ER004");
        expect((await s.rows(`select handle_redemption($1, 'reject', 'Oʻlcham qolmadi') as status`, [second]))[0]).toEqual({ status: "rejected" });
      }, async (s) => {
        await setup(s);
        first = (await s.rows<{ id: string }>(`select request_reward($1, $2, p_variant_id => $3) as id`, [student, shirt, sizeM]))[0].id;
        second = (await s.rows<{ id: string }>(`select request_reward($1, $2, p_variant_id => $3) as id`, [other, shirt, sizeL]))[0].id;
      });
    });

    it("Give straight from Requested still works, and a rejected variant order returns its unit to that variant", async () => {
      await admin(async (s) => {
        await setup(s);
        const a = (await s.rows<{ id: string }>(`select request_reward($1, $2, p_variant_id => $3) as id`, [student, shirt, sizeM]))[0].id;
        const b = (await s.rows<{ id: string }>(`select request_reward($1, $2, p_variant_id => $3) as id`, [other, shirt, sizeL]))[0].id;
        expect([await variantStock(s, sizeM), await variantStock(s, sizeL)]).toEqual([2, 0]);
        await s.rows(`select handle_redemption($1, 'give')`, [a]);
        await s.rows(`select handle_redemption($1, 'reject', 'out')`, [b]);
        expect([await variantStock(s, sizeM), await variantStock(s, sizeL)]).toEqual([2, 1]);
        expect([await balance(s, student), await balance(s, other)]).toEqual([28, 500]);
      });
    });

    it("at the desk staff choose the variant too; a teacher still cannot order or handle", async () => {
      await as("manager", async (s) => {
        expect(code(await s.attempt(`select request_reward($1, $2)`, [student, shirt]))).toBe("ER006");
        expect(code(await s.attempt(`select request_reward($1, $2, p_variant_id => $3)`, [student, shirt, sizeM]))).toBe("allowed");
        expect((await s.rows(`select via, requested_by from redemptions where student_id = $1`, [student]))[0]).toEqual({ via: "desk", requested_by: "staff" });
      }, setup);
      await as("teacher", async (s) => {
        expect(code(await s.attempt(`select request_reward($1, $2, p_variant_id => $3)`, [student, shirt, sizeM]))).toBe(DENIED);
        expect(code(await s.attempt(`select handle_redemption(gen_random_uuid(), 'ready')`))).toBe(DENIED);
      }, setup);
    });
  });

  describe("two orders at the same moment", () => {
    // Real commits on two connections: a rolled-back transaction cannot show a lock at work.
    const marker = `Shop race ${Date.now()}`;
    let one: pg.Client;
    let two: pg.Client;
    let setupDb: pg.Client;
    const asManager = async (db: pg.Client) => {
      await db.query("begin");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: MANAGER_ID, role: "authenticated" })]);
      await db.query("set local role authenticated");
    };
    const make = async (name: string) => {
      const { rows } = await setupDb.query(
        `insert into students (full_name, phone) values ($1, '+99890666' || lpad((random() * 9999)::int::text, 4, '0')) returning id`,
        [`${marker} ${name}`],
      );
      await setupDb.query(`insert into points_ledger (student_id, delta, source, reason) values ($1, 100, 'owner_adjustment', $2)`, [rows[0].id, marker]);
      return rows[0].id as string;
    };

    beforeAll(async () => {
      [one, two, setupDb] = [0, 1, 2].map(() => new pg.Client({ connectionString: DB_URL }));
      await Promise.all([one.connect(), two.connect(), setupDb.connect()]);
    });
    afterAll(async () => {
      await setupDb.query(`delete from points_ledger where student_id in (select id from students where full_name like $1)`, [`${marker}%`]);
      await setupDb.query(`delete from redemptions where student_id in (select id from students where full_name like $1)`, [`${marker}%`]);
      await setupDb.query(`delete from reward_variants where reward_id in (select id from rewards where name = $1)`, [marker]);
      await setupDb.query(`delete from rewards where name = $1`, [marker]);
      await setupDb.query(`delete from students where full_name like $1`, [`${marker}%`]);
      await Promise.all([one.end(), two.end(), setupDb.end()]);
    });

    it("a variant's last unit cannot be ordered twice", async () => {
      const [first, second] = [await make("First"), await make("Second")];
      const reward = (await setupDb.query(`insert into rewards (name, cost, stock) values ($1, 100, null) returning id`, [marker])).rows[0].id as string;
      const variant = (await setupDb.query(`insert into reward_variants (reward_id, name, stock) values ($1, '{"en":"M"}', 1) returning id`, [reward])).rows[0].id as string;

      // The first order waits uncommitted; the second must queue behind it and then see the unit is gone.
      await asManager(one);
      await asManager(two);
      await one.query(`select public.request_reward($1, $2, p_variant_id => $3)`, [first, reward, variant]);
      let settled = false;
      const waiting = two
        .query(`select public.request_reward($1, $2, p_variant_id => $3)`, [second, reward, variant])
        .then(() => "allowed", (error: { code?: string }) => error.code ?? "error")
        .finally(() => (settled = true));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blocked = !settled;
      await one.query("commit");
      const outcome = await waiting;
      await two.query(outcome === "allowed" ? "commit" : "rollback");
      expect({ blocked, outcome }).toEqual({ blocked: true, outcome: "ER002" });

      const { rows } = await setupDb.query(
        `select (select stock from reward_variants where id = $1) as stock,
                (select count(*)::int from redemptions where variant_id = $1) as orders,
                (select coalesce(sum(delta), 0)::int from points_ledger where student_id = $2) as second_balance`,
        [variant, second],
      );
      expect(rows).toEqual([{ stock: 0, orders: 1, second_balance: 100 }]);
    });
  });
});
