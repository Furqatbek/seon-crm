/**
 * The Finance month strip adds up — docs/SPEC.md → "Screens → Finance".
 * Billed for a month = paid + still unpaid, with payments settling a
 * student's charges oldest month first. Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, OWNER_ID, admin, as, connect, disconnect, type Session } from "./helpers";

const month = `date_trunc('month', public.tashkent_today())::date`;
const monthsAgo = (n: number) => `(date_trunc('month', public.tashkent_today()) - interval '${n} months')::date`;

type Strip = { billed: number; paid: number; unpaid: number; collected: number; debt: number };
const strip = async (s: Session, forMonth = month) =>
  (
    await s.rows<Strip>(
      `select billed::float8 as billed, paid::float8 as paid, unpaid::float8 as unpaid, collected::float8 as collected, debt::float8 as debt
       from public.finance_month_summary(${forMonth})`,
    )
  )[0];

let group: string;

/** A new student in a group, with whatever charges and payments the test gives them. */
async function student(s: Session, name: string) {
  const [{ id }] = await s.rows<{ id: string }>(
    `insert into students (full_name, phone) values ($1, '+99890666' || lpad((random() * 9999)::int::text, 4, '0')) returning id`,
    [name],
  );
  const [{ id: enrolment }] = await s.rows<{ id: string }>(
    `insert into enrollments (group_id, student_id, joined_on) values ($1, $2, ${monthsAgo(3)}) returning id`,
    [group, id],
  );
  return {
    id,
    fee: (forMonth: string, amount: number) =>
      s.rows(
        `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount, amount, is_prorated)
         values ($1, $2, $3, ${forMonth}, 'monthly_fee', $4, 0, $4, false)`,
        [id, enrolment, group, amount],
      ),
    credit: (forMonth: string, amount: number) =>
      s.rows(
        `insert into charges (student_id, group_id, billing_month, type, base_amount, discount_amount, amount, is_prorated, note)
         values ($1, $2, ${forMonth}, 'adjustment', $3, 0, $3, false, 'Test credit')`,
        [id, group, -amount],
      ),
    pay: (amount: number, at = "now()") =>
      s.rows(`insert into payments (student_id, group_id, amount, method, received_by, paid_at) values ($1, $2, $3, 'cash', $4, ${at})`, [id, group, amount, OWNER_ID]),
  };
}

/** What the strip gained when the fixture ran. */
const delta = (after: Strip, before: Strip) => ({
  billed: after.billed - before.billed,
  paid: after.paid - before.paid,
  unpaid: after.unpaid - before.unpaid,
});

describe.skipIf(!DB_URL)("The Finance month strip adds up", () => {
  beforeAll(async () => {
    await connect();
    await admin(async (s) => {
      [{ id: group }] = await s.rows<{ id: string }>(`select id from groups where status = 'active' and archived_at is null order by name limit 1`);
    });
  });
  afterAll(disconnect);

  it("billed = paid + unpaid, for every month, on the whole centre's data", async () => {
    await as("owner", async (s) => {
      for (const n of [0, 1, 2, 3]) {
        const row = await strip(s, monthsAgo(n));
        expect(row.paid + row.unpaid, `month −${n}`).toBe(row.billed);
        expect(row.unpaid).toBeGreaterThanOrEqual(0);
      }
      // What is unpaid of this and earlier months can never be more than every debt there is.
      const all = await s.rows<{ owed: number }>(`select coalesce(sum(-balance), 0)::float8 as owed from student_balances where balance < 0`);
      expect((await strip(s)).unpaid).toBeLessThanOrEqual(all[0].owed);
    });
  });

  it("payments settle the oldest month first", async () => {
    await admin(async (s) => {
      const before = { now: await strip(s), last: await strip(s, monthsAgo(1)) };
      const a = await student(s, "Split Oldest");
      await a.fee(monthsAgo(1), 600_000);
      await a.fee(month, 600_000);
      // 900 000 paid this month: last month is settled, 300 000 of this month is.
      await a.pay(900_000);
      expect(delta(await strip(s, monthsAgo(1)), before.last)).toEqual({ billed: 600_000, paid: 600_000, unpaid: 0 });
      expect(delta(await strip(s), before.now)).toEqual({ billed: 600_000, paid: 300_000, unpaid: 300_000 });
      // Money received this month is all 900 000: it is a different figure, and may be more than this month's fees.
      expect((await strip(s)).collected - before.now.collected).toBe(900_000);
    });
  });

  it("a prepayment pays the month in full and no more; a credit lowers what was billed", async () => {
    await admin(async (s) => {
      const before = await strip(s);
      const a = await student(s, "Split Prepaid");
      await a.fee(month, 600_000);
      await a.pay(2_000_000);
      expect(delta(await strip(s), before)).toEqual({ billed: 600_000, paid: 600_000, unpaid: 0 });
      const b = await student(s, "Split Credit");
      await b.fee(month, 600_000);
      await b.credit(month, 150_000);
      await b.pay(200_000);
      // 450 000 owed after the credit, 200 000 paid.
      expect(delta(await strip(s), before)).toEqual({ billed: 1_050_000, paid: 800_000, unpaid: 250_000 });
    });
  });

  it("a voided payment pays nothing, an archived charge bills nothing, and a student who left still counts", async () => {
    await admin(async (s) => {
      const before = await strip(s);
      const a = await student(s, "Split Voided");
      await a.fee(month, 600_000);
      await a.pay(600_000);
      await s.rows(`update payments set voided_at = now(), void_reason = 'Test', voided_by = $2 where student_id = $1`, [a.id, OWNER_ID]);
      expect(delta(await strip(s), before)).toEqual({ billed: 600_000, paid: 0, unpaid: 600_000 });
      await s.rows(`update charges set archived_at = now() where student_id = $1`, [a.id]);
      expect(delta(await strip(s), before)).toEqual({ billed: 0, paid: 0, unpaid: 0 });

      const b = await student(s, "Split Left");
      await b.fee(month, 400_000);
      const debt = (await strip(s)).debt;
      await s.rows(`update students set status = 'left' where id = $1`, [b.id]);
      // Their fee was billed, so it is unpaid in the month; they are only left out of the debt that is chased.
      expect(delta(await strip(s), before)).toEqual({ billed: 400_000, paid: 0, unpaid: 400_000 });
      expect((await strip(s)).debt).toBe(debt - 400_000);
    });
  });
});
