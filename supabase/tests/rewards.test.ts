/**
 * Rewards and redemption — docs/SPEC.md → "Points and rewards add-on":
 * "Point rules" (reward rows), "Defaults to confirm → Redeeming".
 * Most tests are rolled back; the two about simultaneous requests need two
 * real connections and commits, and delete what they made.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, admin, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);

const newStudent = async (s: Session, name: string, points: number) => {
  const [{ id }] = await s.rows<{ id: string }>(
    `insert into students (full_name, phone) values ($1, '+99890777' || lpad((random() * 9999)::int::text, 4, '0')) returning id`,
    [name],
  );
  if (points > 0) {
    await s.rows(`insert into points_ledger (student_id, delta, source, reason) values ($1, $2, 'owner_adjustment', 'Test')`, [id, points]);
  }
  return id;
};
const newReward = async (s: Session, cost: number, stock: number | null) =>
  (await s.rows<{ id: string }>(`insert into rewards (name, cost, stock) values ('Test reward', $1, $2) returning id`, [cost, stock]))[0].id;
const balance = async (s: Session, student: string) =>
  (await s.rows<{ n: number }>(`select coalesce(sum(delta), 0)::int as n from points_ledger where student_id = $1`, [student]))[0].n;
const stock = async (s: Session, reward: string) =>
  (await s.rows<{ stock: number | null }>(`select stock from rewards where id = $1`, [reward]))[0].stock;
const request = (s: Session, student: string, reward: string) =>
  s.attempt(`select public.request_reward($1, $2) as id`, [student, reward]);

describe.skipIf(!DB_URL)("Rewards and redemption", () => {
  beforeAll(connect);
  afterAll(disconnect);

  let student = "";
  let reward = "";
  const setup = (points: number, cost: number, units: number | null) => async (s: Session) => {
    student = await newStudent(s, "Reward Test", points);
    reward = await newReward(s, cost, units);
  };

  it("a request holds the points and one unit of stock at once", async () => {
    await as("manager", async (s) => {
      const result = await request(s, student, reward);
      expect(code(result)).toBe("allowed");
      const id = result.ok ? (result.rows[0].id as string) : "";
      expect(await s.rows(`select status, cost, via, requested_by, created_by, handled_at from redemptions where id = $1`, [id])).toEqual([
        { status: "requested", cost: 100, via: "desk", requested_by: "staff", created_by: MANAGER_ID, handled_at: null },
      ]);
      expect(await s.rows(`select delta, source, reason, dedupe_key from points_ledger where redemption_id = $1`, [id])).toEqual([
        { delta: -100, source: "reward_hold", reason: "Test reward", dedupe_key: `reward_hold:${id}` },
      ]);
      expect(await balance(s, student)).toBe(20);
      expect(await stock(s, reward)).toBe(2);
    }, setup(120, 100, 3));
  });

  it("is refused when the balance is below the cost, the stock is 0, or the reward is not on offer", async () => {
    await as("manager", async (s) => {
      expect(await request(s, student, reward)).toMatchObject({ ok: false, code: "ER001" });
      expect(await balance(s, student)).toBe(99);
      expect(await stock(s, reward)).toBe(3);
    }, setup(99, 100, 3));
    await as("manager", async (s) => {
      expect(code(await request(s, student, reward))).toBe("ER002");
      expect(await balance(s, student)).toBe(100);
    }, setup(100, 100, 0));
    await as("manager", async (s) => {
      expect(code(await request(s, student, reward))).toBe("ER005");
    }, async (s) => {
      await setup(100, 100, 3)(s);
      await s.rows(`update rewards set is_active = false where id = $1`, [reward]);
    });
    // Unlimited stock is never used up.
    await as("manager", async (s) => {
      expect(code(await request(s, student, reward))).toBe("allowed");
      expect(code(await request(s, student, reward))).toBe("allowed");
      expect(await stock(s, reward)).toBeNull();
      expect(await balance(s, student)).toBe(0);
    }, setup(200, 100, null));
  });

  it("Give is final; Reject and Cancel need a reason and return the points and the stock", async () => {
    await as("manager", async (s) => {
      const first = await request(s, student, reward);
      const second = await request(s, student, reward);
      const third = await request(s, student, reward);
      const [a, b, c] = [first, second, third].map((r) => (r.ok ? (r.rows[0].id as string) : ""));
      expect(await balance(s, student)).toBe(0);
      expect(await stock(s, reward)).toBe(0);

      // Give: handed over, nothing comes back, and it cannot be undone.
      expect(await s.rows(`select public.handle_redemption($1, 'give') as status`, [a])).toEqual([{ status: "given" }]);
      expect(await s.rows(`select status, handled_by, handled_at is not null as handled from redemptions where id = $1`, [a])).toEqual([
        { status: "given", handled_by: MANAGER_ID, handled: true },
      ]);
      expect(code(await s.attempt(`select public.handle_redemption($1, 'reject', 'Changed mind')`, [a]))).toBe("ER003");
      expect(code(await s.attempt(`select public.handle_redemption($1, 'give')`, [a]))).toBe("ER003");
      expect(await balance(s, student)).toBe(0);

      // Reject: a reason is required; points and stock return.
      expect(code(await s.attempt(`select public.handle_redemption($1, 'reject', '  ')`, [b]))).toBe("ER004");
      expect(await s.rows(`select public.handle_redemption($1, 'reject', 'Wrong size') as status`, [b])).toEqual([{ status: "rejected" }]);
      expect(await s.rows(`select delta, source, reason from points_ledger where redemption_id = $1 and source = 'reward_return'`, [b])).toEqual([
        { delta: 100, source: "reward_return", reason: "Wrong size" },
      ]);
      expect(await balance(s, student)).toBe(100);
      expect(await stock(s, reward)).toBe(1);
      expect(code(await s.attempt(`select public.handle_redemption($1, 'reject', 'Again')`, [b]))).toBe("ER003");

      // Cancel does the same.
      expect(code(await s.attempt(`select public.handle_redemption($1, 'cancel')`, [c]))).toBe("ER004");
      expect(await s.rows(`select public.handle_redemption($1, 'cancel', 'Asked by mistake') as status`, [c])).toEqual([{ status: "cancelled" }]);
      expect(await balance(s, student)).toBe(200);
      expect(await stock(s, reward)).toBe(2);
    }, setup(300, 100, 3));
  });

  it("redeeming does not change the leaderboard rank or the points earned", async () => {
    await as("manager", async (s) => {
      const place = async () =>
        (await s.rows<{ rank: number; points: number }>(`select rank, points::int as points from public.leaderboard('centre') where display_name = 'Reward Test'`))[0];
      const earned = () => s.rows(`select balance::int, earned_this_month::int, earned_all_time::int from student_points where student_id = $1`, [student]);
      expect(await place()).toEqual({ rank: 1, points: 90_000 });
      expect(code(await request(s, student, reward))).toBe("allowed");
      expect(await place()).toEqual({ rank: 1, points: 90_000 });
      expect(await earned()).toEqual([{ balance: 10_000, earned_this_month: 90_000, earned_all_time: 90_000 }]);
    }, async (s) => {
      await setup(90_000, 80_000, null)(s);
      // Someone close behind: a rank that counted spending would drop below them.
      await newStudent(s, "Reward Rival", 50_000);
    });
  });

  it("only staff ask and handle; nobody writes a request directly; only the owner edits the catalogue", async () => {
    await as("teacher", async (s) => {
      expect(code(await request(s, student, reward))).toBe(DENIED);
      const rows = await s.attempt(`select 1 from redemptions`);
      expect(rows.ok ? rows.rowCount : 0).toBe(0);
      // A teacher views the catalogue on offer.
      expect(await s.count("rewards", `id = '${reward}'`)).toBe(1);
      expect((await s.attempt(`update rewards set cost = 1 where id = $1`, [reward])).ok && (await s.count("rewards", "cost = 1"))).toBe(0);
    }, setup(100, 100, 3));
    await as("anon", async (s) => {
      expect(code(await request(s, student, reward))).toBe(DENIED);
    }, setup(100, 100, 3));
    await as("manager", async (s) => {
      expect(code(await s.attempt(`insert into redemptions (student_id, reward_id, cost, via, requested_by) values ($1, $2, 1, 'desk', 'staff')`, [student, reward]))).toBe(DENIED);
      expect(code(await s.attempt(`update redemptions set status = 'given'`))).toBe(DENIED);
      expect(code(await s.attempt(`insert into rewards (name, cost) values ('Mine', 5)`))).toBe(DENIED);
      await s.attempt(`update rewards set cost = 1 where id = $1`, [reward]);
      expect(await s.rows(`select cost from rewards where id = $1`, [reward])).toEqual([{ cost: 100 }]);
    }, setup(100, 100, 3));
    await as("owner", async (s) => {
      expect(code(await s.attempt(`insert into rewards (name, cost, stock) values ('Owner made', 5, 1)`))).toBe("allowed");
      expect(code(await s.attempt(`update rewards set cost = 110, archived_at = now() where id = $1`, [reward]))).toBe("allowed");
    }, setup(100, 100, 3));
  });

  it("reward photos: the owner uploads, anyone signed in reads, a visitor does not", async () => {
    const object = `select count(*)::int as n from storage.objects where bucket_id = 'reward-photos' and name = 'test.png'`;
    const put = `insert into storage.objects (bucket_id, name) values ('reward-photos', 'test.png')`;
    await as("manager", async (s) => expect(code(await s.attempt(put))).toBe(DENIED));
    await as("teacher", async (s) => expect(code(await s.attempt(put))).toBe(DENIED));
    await as("owner", async (s) => {
      expect(code(await s.attempt(put))).toBe("allowed");
      expect(await s.rows(object)).toEqual([{ n: 1 }]);
    });
    const seeded = async (s: Session) => void (await s.rows(put));
    await as("manager", async (s) => expect(await s.rows(object)).toEqual([{ n: 1 }]), seeded);
    await as("teacher", async (s) => expect(await s.rows(object)).toEqual([{ n: 1 }]), seeded);
    await as("anon", async (s) => {
      const result = await s.attempt(object);
      expect(result.ok ? result.rows : [{ n: 0 }]).toEqual([{ n: 0 }]);
    }, seeded);
    await admin(async (s) => {
      expect(await s.rows(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'reward-photos'`)).toEqual([
        { public: false, file_size_limit: "2097152", allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] },
      ]);
    });
  });

  describe("two requests at the same moment", () => {
    // Real commits on two connections: a rolled-back transaction cannot show a lock at work.
    const marker = `Race ${Date.now()}`;
    let one: pg.Client;
    let two: pg.Client;
    let setupDb: pg.Client;
    const asManager = async (db: pg.Client) => {
      await db.query("begin");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: MANAGER_ID, role: "authenticated" })]);
      await db.query("set local role authenticated");
    };
    const make = async (name: string, points: number) => {
      const { rows } = await setupDb.query(
        `insert into students (full_name, phone) values ($1, '+99890888' || lpad((random() * 9999)::int::text, 4, '0')) returning id`,
        [`${marker} ${name}`],
      );
      await setupDb.query(`insert into points_ledger (student_id, delta, source, reason) values ($1, $2, 'owner_adjustment', $3)`, [rows[0].id, points, marker]);
      return rows[0].id as string;
    };
    const makeReward = async (cost: number, units: number) =>
      (await setupDb.query(`insert into rewards (name, cost, stock) values ($1, $2, $3) returning id`, [marker, cost, units])).rows[0].id as string;
    /** The first request waits uncommitted; the second must queue behind it and then see what the first did. */
    const race = async (first: [string, string], second: [string, string]) => {
      await asManager(one);
      await asManager(two);
      await one.query(`select public.request_reward($1, $2)`, first);
      let settled = false;
      const waiting = two
        .query(`select public.request_reward($1, $2)`, second)
        .then(() => "allowed", (error: { code?: string }) => error.code ?? "error")
        .finally(() => (settled = true));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blocked = !settled;
      await one.query("commit");
      const outcome = await waiting;
      await two.query(outcome === "allowed" ? "commit" : "rollback");
      return { blocked, outcome };
    };

    beforeAll(async () => {
      [one, two, setupDb] = [0, 1, 2].map(() => new pg.Client({ connectionString: DB_URL }));
      await Promise.all([one.connect(), two.connect(), setupDb.connect()]);
    });
    afterAll(async () => {
      await setupDb.query(`delete from points_ledger where student_id in (select id from students where full_name like $1)`, [`${marker}%`]);
      await setupDb.query(`delete from redemptions where student_id in (select id from students where full_name like $1)`, [`${marker}%`]);
      await setupDb.query(`delete from rewards where name = $1`, [marker]);
      await setupDb.query(`delete from students where full_name like $1`, [`${marker}%`]);
      await Promise.all([one.end(), two.end(), setupDb.end()]);
    });

    it("cannot overspend a balance", async () => {
      const student = await make("Spender", 100);
      const reward = await makeReward(100, 5);
      expect(await race([student, reward], [student, reward])).toEqual({ blocked: true, outcome: "ER001" });
      const { rows } = await setupDb.query(
        `select (select coalesce(sum(delta), 0)::int from points_ledger where student_id = $1) as balance,
                (select count(*)::int from redemptions where student_id = $1) as requests,
                (select stock from rewards where id = $2) as stock`,
        [student, reward],
      );
      expect(rows).toEqual([{ balance: 0, requests: 1, stock: 4 }]);
    });

    it("cannot take the last unit twice", async () => {
      const [first, second] = [await make("First", 100), await make("Second", 100)];
      const reward = await makeReward(100, 1);
      expect(await race([first, reward], [second, reward])).toEqual({ blocked: true, outcome: "ER002" });
      const { rows } = await setupDb.query(
        `select (select stock from rewards where id = $1) as stock,
                (select count(*)::int from redemptions where reward_id = $1) as requests,
                (select coalesce(sum(delta), 0)::int from points_ledger where student_id = $2) as second_balance`,
        [reward, second],
      );
      expect(rows).toEqual([{ stock: 0, requests: 1, second_balance: 100 }]);
    });
  });
});
