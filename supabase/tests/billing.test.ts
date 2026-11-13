/**
 * Monthly billing — generate_monthly_charges() and friends.
 * docs/SPEC.md → "Business rules → Monthly billing".
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { balanceState } from "../../src/lib/domain/ledger";
import { discountAmount, type Discount } from "../../src/lib/domain/proration";
import {
  DB_URL,
  DENIED,
  OWNER_ID,
  admin,
  as,
  connect,
  disconnect,
  enrollmentId,
  groupId,
  studentId,
  type Attempt,
  type Session,
} from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";
const month = `date_trunc('month', ${today})::date`;
const nextMonth = `(date_trunc('month', ${today}) + interval '1 month')::date`;

/** Removes this month's fees, so the month can be generated from scratch. */
const unbilled = (a: Session) =>
  a.rows(`delete from charges where billing_month = ${month} and type = 'monthly_fee'`).then(() => {});

const generate = async (s: Session, forMonth = month) =>
  (await s.rows<{ created: number }>(`select public.generate_monthly_charges(${forMonth}) as created`))[0].created;

const fees = (s: Session, where = "true", forMonth = month) =>
  s.rows<{ enrollment_id: string; base: number; discount: number; amount: number; is_prorated: boolean; created_by: string | null }>(
    `select enrollment_id, base_amount::int as base, discount_amount::int as discount, amount::int as amount,
            is_prorated, created_by
     from charges where billing_month = ${forMonth} and type = 'monthly_fee' and ${where}`,
  );

describe.skipIf(!DB_URL)("Monthly billing", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("creates one fee per active enrolment, and nothing new when run twice", async () => {
    await as(
      "owner",
      async (s) => {
        // Counted independently of the function under test.
        const [{ expected }] = await s.rows<{ expected: number }>(
          `select count(*)::int as expected
           from enrollments e join groups g on g.id = e.group_id join students st on st.id = e.student_id
           where e.status = 'active' and g.status = 'active' and g.archived_at is null
             and st.status = 'active' and st.archived_at is null and e.joined_on < ${nextMonth}`,
        );
        expect(expected).toBeGreaterThan(70);
        expect(await s.count("charges", `billing_month = ${month} and type = 'monthly_fee'`)).toBe(0);

        const preview = await s.rows(`select * from public.preview_monthly_charges(${month})`);
        expect(preview).toHaveLength(expected);

        expect(await generate(s)).toBe(expected);
        expect(await generate(s)).toBe(0);
        expect(await generate(s)).toBe(0);

        expect(await s.count("charges", `billing_month = ${month} and type = 'monthly_fee'`)).toBe(expected);
        expect(
          await s.rows(
            `select enrollment_id from charges where billing_month = ${month} and type = 'monthly_fee'
             group by enrollment_id having count(*) > 1`,
          ),
        ).toEqual([]);
        expect(await s.rows(`select * from public.preview_monthly_charges(${month})`)).toEqual([]);

        // Created by the owner who ran it, never prorated.
        const created = await fees(s);
        expect(new Set(created.map((fee) => fee.created_by))).toEqual(new Set([OWNER_ID]));
        expect(created.every((fee) => fee.is_prorated === false)).toBe(true);
      },
      unbilled,
    );
  });

  it("a student who already has this month's first charge from enrolling is not billed again", async () => {
    await as("owner", async (s) => {
      const [{ id: student }] = await s.rows<{ id: string }>(
        `insert into students (full_name, phone) values ('Mid Month', '+998900000066') returning id`,
      );
      const [{ enrolment }] = await s.rows<{ enrolment: string }>(
        `select public.enrol_student($1, $2, ${today}) as enrolment`,
        [student, groupId(2)],
      );
      const before = await fees(s, `enrollment_id = '${enrolment}'`);
      expect(before).toHaveLength(1);
      await generate(s);
      expect(await fees(s, `enrollment_id = '${enrolment}'`)).toEqual(before);
    });
  });

  it("skips paused students, students who left, and groups that are finished, forming or archived", async () => {
    await as(
      "owner",
      async (s) => {
        await generate(s);
        const billed = async (where: string) =>
          (
            await s.rows<{ n: number }>(
              `select count(*)::int as n from charges c
               where c.billing_month = ${month} and c.type = 'monthly_fee' and ${where}`,
            )
          )[0].n;

        // Student 1 was paused, student 75 is paused in the seed, 78 left.
        expect(await billed(`c.student_id = '${studentId(1)}'`)).toBe(0);
        expect(await billed(`c.student_id = '${studentId(75)}'`)).toBe(0);
        expect(await billed(`c.student_id = '${studentId(78)}'`)).toBe(0);
        // Group 2 finished, group 3 forming, group 4 archived.
        expect(await billed(`c.group_id in ('${groupId(2)}', '${groupId(3)}', '${groupId(4)}')`)).toBe(0);
        // Everyone else in an active group was billed.
        expect(await billed(`c.group_id = '${groupId(5)}'`)).toBeGreaterThan(5);
        // Student 5 is in group 5.
        expect(await billed(`c.student_id = '${studentId(5)}'`)).toBe(1);
      },
      async (a) => {
        await unbilled(a);
        await a.rows(`update students set status = 'paused' where id = $1`, [studentId(1)]);
        await a.rows(`update groups set status = 'finished' where id = $1`, [groupId(2)]);
        await a.rows(`update groups set status = 'forming' where id = $1`, [groupId(3)]);
        await a.rows(`update groups set archived_at = now() where id = $1`, [groupId(4)]);
      },
    );
  });

  it("applies each enrolment's discount: amount = group fee − discount", async () => {
    await as(
      "owner",
      async (s) => {
        await generate(s);
        const rows = await s.rows<{ base: number; discount: number; amount: number; kind: string | null; value: number | null; fee: number }>(
          `select c.base_amount::int as base, c.discount_amount::int as discount, c.amount::int as amount,
                  e.discount_kind as kind, e.discount_value::int as value, g.monthly_fee::int as fee
           from charges c join enrollments e on e.id = c.enrollment_id join groups g on g.id = c.group_id
           where c.billing_month = ${month} and c.type = 'monthly_fee'`,
        );
        let percent = 0;
        let fixed = 0;
        for (const row of rows) {
          const discount: Discount =
            row.kind === "percent" || row.kind === "amount" ? { kind: row.kind, value: row.value! } : null;
          // The same rule as the TypeScript side.
          expect(row.base).toBe(row.fee);
          expect(row.discount).toBe(discountAmount(row.fee, discount));
          expect(row.amount).toBe(row.fee - row.discount);
          if (row.kind === "percent") percent += 1;
          if (row.kind === "amount") fixed += 1;
        }
        expect(percent).toBeGreaterThan(3);
        expect(fixed).toBeGreaterThan(1);

        // Student 4: English Kids 400,000 with 15 % → 60,000 off → 340,000.
        expect(await fees(s, `enrollment_id = '${enrollmentId(4)}'`)).toMatchObject([
          { base: 400_000, discount: 60_000, amount: 340_000 },
        ]);
        // Student 5: Matematika 7-sinf 450,000 with 50,000 off → 400,000.
        expect(await fees(s, `enrollment_id = '${enrollmentId(5)}'`)).toMatchObject([
          { base: 450_000, discount: 50_000, amount: 400_000 },
        ]);
      },
      unbilled,
    );
  });

  describe("a changed group fee applies from the next billing month", () => {
    const raise = (s: Session, fee: number) =>
      s.rows(`update groups set monthly_fee = $2 where id = $1`, [groupId(2), fee]);
    const feeFor = async (s: Session, forMonth: string) =>
      (await s.rows<{ fee: number }>(`select public.group_fee_for($1, ${forMonth})::int as fee`, [groupId(2)]))[0].fee;

    it("this month is still billed at the old fee", async () => {
      await as(
        "owner",
        async (s) => {
          // English B1: 600,000 → 700,000, changed before this month was billed.
          await raise(s, 700_000);
          expect(await feeFor(s, month)).toBe(600_000);
          expect(await feeFor(s, nextMonth)).toBe(700_000);

          await generate(s);
          const bases = (await fees(s, `group_id = '${groupId(2)}'`)).map((fee) => fee.base);
          expect(bases.length).toBeGreaterThan(5);
          expect(new Set(bases)).toEqual(new Set([600_000]));

          // A student joining this month also pays the old fee.
          expect(
            await s.rows(`select base_amount::int as base from public.propose_first_charge($1, ${today})`, [groupId(2)]),
          ).toEqual([{ base: 600_000 }]);
        },
        unbilled,
      );
    });

    it("charges already created never change", async () => {
      await as("owner", async (s) => {
        const before = await fees(s, `group_id = '${groupId(2)}'`);
        await raise(s, 700_000);
        expect(await generate(s)).toBe(0);
        expect(await fees(s, `group_id = '${groupId(2)}'`)).toEqual(before);
      });
    });

    it("next month is billed at the new fee; a second change in the month replaces the first", async () => {
      await admin(async (s) => {
        await raise(s, 700_000);
        await raise(s, 750_000);
        expect(await feeFor(s, month)).toBe(600_000);
        expect(await feeFor(s, nextMonth)).toBe(750_000);
        expect(await s.count("group_fee_history", `group_id = '${groupId(2)}'`)).toBe(2);

        // The scheduled job is not a user request, so it may bill the next month here.
        await generate(s, nextMonth);
        const next = await fees(s, `group_id = '${groupId(2)}'`, nextMonth);
        expect(next.length).toBeGreaterThan(5);
        expect(new Set(next.map((fee) => fee.base))).toEqual(new Set([750_000]));
        // Other groups are untouched.
        expect(new Set((await fees(s, `group_id = '${groupId(1)}'`, nextMonth)).map((fee) => fee.base))).toEqual(
          new Set([500_000]),
        );
      });
    });

    it("a new group's fee counts from the start, and the history cannot be written through the API", async () => {
      await as("owner", async (s) => {
        const [{ id }] = await s.rows<{ id: string }>(
          `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date, status)
           select 'Fee Test', 'Test', teacher_id, 800000, '{1}', '10:00', ${month}, 'active' from groups limit 1 returning id`,
        );
        expect(
          await s.rows(`select public.group_fee_for($1, ${month})::int as now, public.group_fee_for($1, date '2020-01-01')::int as past`, [id]),
        ).toEqual([{ now: 800_000, past: 800_000 }]);
        expect(
          code(await s.attempt(`insert into group_fee_history (group_id, monthly_fee, effective_month) values ($1, 1, ${month})`, [id])),
        ).toBe(DENIED);
        expect(code(await s.attempt(`update group_fee_history set monthly_fee = 1`))).toBe(DENIED);
      });
    });
  });

  describe("a fee typed wrongly on a group nobody has been charged for", () => {
    it("is corrected at once, not from next month", async () => {
      await as(
        "owner",
        async (s) => {
          const [{ id }] = await s.rows<{ id: string }>(
            `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, duration_min, start_date, status)
             select 'Fee typo', subject, teacher_id, 60000, days, start_time, duration_min, ${today}, 'forming'
             from groups where id = $1 returning id`,
            [groupId(2)],
          );
          await s.rows(`update groups set monthly_fee = 600000 where id = $1`, [id]);
          expect(
            await s.rows(
              `select public.group_fee_for($1, ${month})::int as now, public.group_fee_for($1, ${nextMonth})::int as next`,
              [id],
            ),
          ).toEqual([{ now: 600_000, next: 600_000 }]);
          expect(
            await s.rows(`select base_amount::int as base from public.propose_first_charge($1, ${today})`, [id]),
          ).toEqual([{ base: 600_000 }]);

          // Once a student has been charged, a change waits for next month.
          await s.rows(
            `insert into charges (student_id, group_id, billing_month, type, amount, note, created_by)
             values ($2, $1, ${month}, 'adjustment', -1000, 'Test', auth.uid())`,
            [id, studentId(5)],
          );
          await s.rows(`update groups set monthly_fee = 700000 where id = $1`, [id]);
          expect(
            await s.rows(
              `select public.group_fee_for($1, ${month})::int as now, public.group_fee_for($1, ${nextMonth})::int as next`,
              [id],
            ),
          ).toEqual([{ now: 600_000, next: 700_000 }]);
        },
      );
    });
  });

  describe("the preview totals", () => {
    it("count and sum every missing fee, and are the owner's only", async () => {
      await as(
        "owner",
        async (s) => {
          const [summary] = await s.rows<{ charges: number; total: string }>(
            `select charges, total from public.preview_monthly_charges_summary(${month})`,
          );
          const [list] = await s.rows<{ n: number; total: string }>(
            `select count(*)::int as n, coalesce(sum(amount), 0) as total from public.preview_monthly_charges(${month})`,
          );
          expect(summary.charges).toBe(list.n);
          expect(summary.charges).toBeGreaterThan(10);
          expect(Number(summary.total)).toBe(Number(list.total));
          expect(await generate(s)).toBe(summary.charges);
          expect(
            await s.rows(`select charges, total::int as total from public.preview_monthly_charges_summary(${month})`),
          ).toEqual([{ charges: 0, total: 0 }]);
        },
        unbilled,
      );
      expect(code(await as("manager", (s) => s.attempt(`select * from public.preview_monthly_charges_summary(${month})`)))).toBe(DENIED);
    });
  });

  describe("list_debtors", () => {
    type Debtor = { student_id: string; balance: string; oldest_unpaid_month: string | null; last_payment_at: Date | null; total: string };
    const list = (s: Session, limit = 1000, offset = 0) =>
      s.rows<Debtor>(
        `select student_id, balance, oldest_unpaid_month::text, last_payment_at, total
         from public.list_debtors($1, $2)`,
        [limit, offset],
      );

    it("lists exactly the students balanceState() calls debtors, largest debt first", async () => {
      for (const who of ["owner", "manager"] as const) {
        await as(who, async (s) => {
          const [{ day, due_day }] = await s.rows<{ day: string; due_day: number }>(
            `select ${today}::text as day, (select due_day from centre_settings) as due_day`,
          );
          const all = await s.rows<{ id: string; balance: string; oldest: string | null }>(
            `select s.id, b.balance, b.oldest_unpaid_month::text as oldest
             from students s join student_balances b on b.student_id = s.id where s.archived_at is null`,
          );
          const expected = all
            .filter(
              (row) =>
                balanceState(Number(row.balance), { today: day, dueDay: due_day, oldestUnpaidMonth: row.oldest }) === "debt",
            )
            .map((row) => row.id)
            .sort();
          const debtors = await list(s);
          expect(debtors.map((row) => row.student_id).sort()).toEqual(expected);
          expect(expected.length).toBeGreaterThan(0);
          expect(debtors.every((row) => Number(row.total) === expected.length)).toBe(true);
          const debts = debtors.map((row) => Number(row.balance));
          expect(debts).toEqual([...debts].sort((a, b) => a - b));

          // Pages do not overlap and keep the full count.
          const first = await list(s, 2, 0);
          const second = await list(s, 2, 2);
          expect(first.map((row) => row.student_id)).toEqual(debtors.slice(0, 2).map((row) => row.student_id));
          expect(second.map((row) => row.student_id)).toEqual(debtors.slice(2, 4).map((row) => row.student_id));
          expect(Number(first[0].total)).toBe(expected.length);
        });
      }
    });

    it("gives each debtor their own last payment, and ignores voided ones", async () => {
      await as("owner", async (s) => {
        const debtors = await list(s);
        for (const debtor of debtors) {
          const [{ last }] = await s.rows<{ last: Date | null }>(
            `select max(paid_at) as last from payments where student_id = $1 and voided_at is null`,
            [debtor.student_id],
          );
          expect(debtor.last_payment_at?.getTime() ?? null).toBe(last?.getTime() ?? null);
        }
        const paid = debtors.find((row) => row.last_payment_at);
        if (!paid) throw new Error("the seed should have a debtor who has paid before");
        await s.rows(
          `update payments set voided_at = now(), voided_by = $2, void_reason = 'test'
           where student_id = $1 and voided_at is null`,
          [paid.student_id, OWNER_ID],
        );
        const after = (await list(s)).find((row) => row.student_id === paid.student_id);
        expect(after?.last_payment_at).toBeNull();
      });
    });

    it("is not for visitors", async () => {
      expect(code(await as("anon", (s) => s.attempt(`select * from public.list_debtors()`)))).toBe(DENIED);
    });
  });

  describe("who may bill", () => {
    it("the owner bills the current month only: not one ahead, not an earlier one", async () => {
      const lastMonth = `(date_trunc('month', ${today}) - interval '1 month')::date`;
      expect(code(await as("owner", (s) => s.attempt(`select public.generate_monthly_charges(${nextMonth})`)))).toBe("EF001");
      // An earlier month would be billed from today's statuses and discounts.
      await as(
        "owner",
        async (s) => {
          expect(code(await s.attempt(`select public.generate_monthly_charges(${lastMonth})`))).toBe("EF001");
          expect(await fees(s, "true", lastMonth)).toEqual([]);
        },
        (a) => a.rows(`delete from charges where billing_month = ${lastMonth} and type = 'monthly_fee'`).then(() => {}),
      );
      expect(code(await as("owner", (s) => s.attempt(`select public.generate_monthly_charges(${today} - 1 + (extract(day from ${today}) = 1)::int * 2)`)))).toBe("22023");
    });

    it("a manager cannot preview, generate, run the billing day or read the month summary", async () => {
      await as("manager", async (s) => {
        expect(code(await s.attempt(`select * from public.preview_monthly_charges(${month})`))).toBe(DENIED);
        expect(code(await s.attempt(`select public.generate_monthly_charges(${month})`))).toBe(DENIED);
        expect(code(await s.attempt(`select public.run_billing_day()`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.finance_month_summary(${month})`))).toBe(DENIED);
      });
    });

    it("a visitor who is not signed in cannot call any of it", async () => {
      await as("anon", async (s) => {
        for (const call of [
          `public.preview_monthly_charges(current_date)`,
          `public.generate_monthly_charges(current_date)`,
          `public.run_billing_day()`,
          `public.finance_month_summary(current_date)`,
          `public.group_fee_for('${groupId(1)}', current_date)`,
        ]) {
          expect(code(await s.attempt(`select ${call}`)), call).toBe(DENIED);
        }
      });
    });
  });

  describe("the daily job", () => {
    it("bills the current month on the billing day and does nothing on other days", async () => {
      await admin(async (s) => {
        await unbilled(s);
        const [{ day }] = await s.rows<{ day: number }>(`select extract(day from ${today})::int as day`);

        // Any other day of the month.
        await s.rows(`update centre_settings set billing_day = $1`, [day === 1 ? 2 : 1]);
        expect(await s.rows(`select public.run_billing_day() as created`)).toEqual([{ created: 0 }]);
        expect(await s.count("charges", `billing_month = ${month} and type = 'monthly_fee'`)).toBe(0);

        // The billing day can be 1–28; on the 29th–31st there is nothing more to check.
        if (day <= 28) {
          await s.rows(`update centre_settings set billing_day = $1`, [day]);
          const [{ created }] = await s.rows<{ created: number }>(`select public.run_billing_day() as created`);
          expect(created).toBeGreaterThan(70);
          expect(await s.rows(`select public.run_billing_day() as created`)).toEqual([{ created: 0 }]);
          // Nobody is signed in when the job runs.
          expect(new Set((await fees(s)).map((fee) => fee.created_by))).toEqual(new Set([null]));
        }
      });
    });

    it("is scheduled for 00:10 Tashkent time", async () => {
      const jobs = await admin(async (s) => {
        const cron = await s.attempt(`select schedule, command from cron.job where jobname = 'monthly-charges-billing-day'`);
        return cron.ok ? cron.rows : null;
      });
      if (jobs) expect(jobs).toEqual([{ schedule: "10 19 * * *", command: "select public.run_billing_day()" }]);
    });
  });

  describe("finance_month_summary", () => {
    const summary = async (s: Session) =>
      (
        await s.rows<{ collected: string; billed: string; debt: string }>(
          `select * from public.finance_month_summary(${month})`,
        )
      ).map((row) => ({ collected: Number(row.collected), billed: Number(row.billed), debt: Number(row.debt) }))[0];

    it("agrees with the ledger tables", async () => {
      await as("owner", async (s) => {
        const [expected] = await s.rows<{ collected: string; billed: string; debt: string }>(
          `select
             (select coalesce(sum(amount), 0) from payments
              where voided_at is null and (paid_at at time zone 'Asia/Tashkent')::date >= ${month}
                and (paid_at at time zone 'Asia/Tashkent')::date < ${nextMonth}) as collected,
             (select coalesce(sum(amount), 0) from charges where billing_month = ${month}) as billed,
             (select coalesce(sum(-balance), 0) from student_balances where balance < 0) as debt`,
        );
        expect(await summary(s)).toEqual({
          collected: Number(expected.collected),
          billed: Number(expected.billed),
          debt: Number(expected.debt),
        });
        expect(Number(expected.collected)).toBeGreaterThan(0);
        expect(Number(expected.debt)).toBeGreaterThan(0);
      });
    });

    it("a payment raises Collected and lowers Debt; voiding it puts both back", async () => {
      await as("owner", async (s) => {
        const before = await summary(s);
        // A debtor, and exactly what they owe.
        const [debtor] = await s.rows<{ student_id: string; balance: string; group_id: string }>(
          `select b.student_id, b.balance, (select e.group_id from enrollments e where e.student_id = b.student_id limit 1) as group_id
           from student_balances b where b.balance < 0 order by b.balance limit 1`,
        );
        const owed = -Number(debtor.balance);
        const [{ id }] = await s.rows<{ id: string }>(
          `insert into payments (student_id, group_id, amount, method, received_by)
           values ($1, $2, $3, 'cash', auth.uid()) returning id`,
          [debtor.student_id, debtor.group_id, owed],
        );
        expect(await summary(s)).toEqual({
          collected: before.collected + owed,
          billed: before.billed,
          debt: before.debt - owed,
        });

        await s.rows(
          `update payments set voided_at = now(), void_reason = 'Xato', voided_by = auth.uid() where id = $1`,
          [id],
        );
        expect(await summary(s)).toEqual(before);
      });
    });

    it("a credit lowers Billed and Debt", async () => {
      await as("owner", async (s) => {
        const before = await summary(s);
        const [debtor] = await s.rows<{ student_id: string; balance: string }>(
          `select student_id, balance from student_balances where balance <= -100000 order by balance limit 1`,
        );
        await s.rows(
          `insert into charges (student_id, billing_month, type, amount, note, created_by)
           values ($1, ${month}, 'adjustment', -100000, 'Test', auth.uid())`,
          [debtor.student_id],
        );
        expect(await summary(s)).toEqual({
          collected: before.collected,
          billed: before.billed - 100_000,
          debt: before.debt - 100_000,
        });
      });
    });
  });
});
