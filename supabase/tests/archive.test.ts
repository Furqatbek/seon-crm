/**
 * Archiving finance records — docs/SPEC.md → "Screens → Finance".
 * The owner archives a payment, charge, expense or payout; nothing is deleted
 * and the row drops out of every balance and total.
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, as, connect, disconnect, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";
const month = `date_trunc('month', ${today})::date`;
const lastMonth = `(date_trunc('month', ${today}) - interval '1 month')::date`;

const summary = async (s: Session, forMonth = month) =>
  (
    await s.rows<{ collected: number; billed: number; debt: number; expenses: number }>(
      `select collected::float8 as collected, billed::float8 as billed, debt::float8 as debt, expenses::float8 as expenses
       from public.finance_month_summary(${forMonth})`,
    )
  )[0];
const balance = async (s: Session, student: string) =>
  (await s.rows<{ balance: number }>(`select balance::float8 as balance from student_balances where student_id = $1`, [student]))[0].balance;

describe.skipIf(!DB_URL)("Archiving finance records", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("payments", () => {
    it("archiving a payment voids it: the balance, Collected and reports lose it, and it leaves the lists", async () => {
      await as("owner", async (s) => {
        const [payment] = await s.rows<{ id: string; student_id: string; amount: number }>(
          `select id, student_id, amount::float8 as amount from payments
           where voided_at is null and paid_at >= (${month}::timestamp at time zone 'Asia/Tashkent') order by paid_at limit 1`,
        );
        const before = { summary: await summary(s), balance: await balance(s, payment.student_id) };
        const [{ r }] = await s.rows<{ r: number }>(`select collected::float8 as r from public.report_kpis(${month}, ${month})`);

        expect(code(await s.attempt(`update payments set archived_at = now() where id = $1`, [payment.id]))).toBe("allowed (1)");
        expect(await s.rows(`select voided_at is not null as voided, void_reason, voided_by from payments where id = $1`, [payment.id])).toEqual([
          { voided: true, void_reason: "Archived", voided_by: OWNER_ID },
        ]);
        expect((await summary(s)).collected).toBe(before.summary.collected - payment.amount);
        expect(await balance(s, payment.student_id)).toBe(before.balance - payment.amount);
        expect(await s.rows(`select collected::float8 as r from public.report_kpis(${month}, ${month})`)).toEqual([{ r: r - payment.amount }]);
        // Not listed among the voided payments either: it is gone from view.
        expect(await s.rows(`select 1 from public.list_adjustments(${month}, 1000, 0) where receipt_no = (select receipt_no from payments where id = $1)`, [payment.id])).toEqual([]);
        // Still in the table: nothing is deleted.
        expect(await s.count("payments", `id = '${payment.id}'`)).toBe(1);
      });
    });

    it("a payment voided by someone else can still be archived, and keeps who voided it", async () => {
      await as("owner", async (s) => {
        // Seeded: two payments voided last month by the owner; pretend another owner did one.
        const [voided] = await s.rows<{ id: string }>(`select id from payments where voided_at is not null limit 1`);
        expect(code(await s.attempt(`update payments set archived_at = now() where id = $1`, [voided.id]))).toBe("allowed (1)");
        expect(await s.rows(`select void_reason from payments where id = $1`, [voided.id])).toEqual([{ void_reason: "Ikki marta kiritilgan" }]);
      });
    });

    it("a manager cannot archive a payment, and still cannot void one", async () => {
      await as("manager", async (s) => {
        expect(code(await s.attempt(`update payments set archived_at = now()`))).toBe("allowed (0)");
        expect(code(await s.attempt(`update payments set voided_at = now(), void_reason = 'x', voided_by = auth.uid()`))).toBe("allowed (0)");
      });
    });

    it("the owner voids in their own name, whatever the request says", async () => {
      await as("owner", async (s) => {
        const [payment] = await s.rows<{ id: string }>(`select id from payments where voided_at is null limit 1`);
        await s.rows(`update payments set voided_at = now(), void_reason = 'Test', voided_by = $2 where id = $1`, [payment.id, MANAGER_ID]);
        expect(await s.rows(`select voided_by from payments where id = $1`, [payment.id])).toEqual([{ voided_by: OWNER_ID }]);
        // A payment still cannot be edited.
        expect(code(await s.attempt(`update payments set amount = 1 where id = $1`, [payment.id]))).toBe(DENIED);
      });
    });
  });

  describe("charges", () => {
    it("an archived charge is no longer owed, billed or counted as debt", async () => {
      await as("owner", async (s) => {
        const [charge] = await s.rows<{ id: string; student_id: string; amount: number }>(
          `select id, student_id, amount::float8 as amount from charges where billing_month = ${month} and type = 'monthly_fee' and amount > 0 limit 1`,
        );
        const before = { summary: await summary(s), balance: await balance(s, charge.student_id) };
        expect(code(await s.attempt(`update charges set archived_at = now() where id = $1`, [charge.id]))).toBe("allowed (1)");
        expect(await balance(s, charge.student_id)).toBe(before.balance + charge.amount);
        const after = await summary(s);
        expect(after.billed).toBe(before.summary.billed - charge.amount);
        // Debt by age still adds up to the debt.
        const [{ aged }] = await s.rows<{ aged: number }>(`select sum(amount)::float8 as aged from public.report_debt_age()`);
        expect(aged).toBe(after.debt);
        expect(after.debt).toBeLessThanOrEqual(before.summary.debt);
      });
    });

    it("a charge is still never edited: only archived", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update charges set amount = 0 where billing_month = ${month}`))).toBe(DENIED);
        expect(code(await s.attempt(`update charges set note = 'x', archived_at = now() where billing_month = ${month}`))).toBe(DENIED);
        expect(code(await s.attempt(`delete from charges where billing_month = ${month}`))).toBe(DENIED);
      });
      await as("manager", async (s) => {
        expect(code(await s.attempt(`update charges set archived_at = now() where billing_month = ${month}`))).toBe("allowed (0)");
      });
    });

    it("a month archived whole can be generated again, once", async () => {
      await as("owner", async (s) => {
        const [{ fees }] = await s.rows<{ fees: number }>(
          `select count(*)::int as fees from charges where billing_month = ${month} and type = 'monthly_fee'`,
        );
        expect(fees).toBeGreaterThan(50);
        expect((await s.rows(`select 1 from public.preview_monthly_charges(${month})`)).length).toBe(0);
        await s.rows(`update charges set archived_at = now() where billing_month = ${month}`);
        expect((await summary(s)).billed).toBe(0);

        const preview = await s.rows(`select 1 from public.preview_monthly_charges(${month})`);
        expect(preview.length).toBeGreaterThan(50);
        const [{ created }] = await s.rows<{ created: number }>(`select public.generate_monthly_charges(${month}) as created`);
        expect(created).toBe(preview.length);
        expect(await s.rows(`select public.generate_monthly_charges(${month}) as created`)).toEqual([{ created: 0 }]);
        // The archived ones are still there, beside the new ones.
        expect(await s.count("charges", `billing_month = ${month} and type = 'monthly_fee' and archived_at is not null`)).toBe(fees);
        expect(await s.count("charges", `billing_month = ${month} and type = 'monthly_fee' and archived_at is null`)).toBe(created);
      });
    });

    it("an archived credit leaves the adjustments list", async () => {
      await as("owner", async (s) => {
        const [{ id }] = await s.rows<{ id: string }>(
          `insert into charges (student_id, billing_month, type, amount, note, created_by)
           select id, ${month}, 'adjustment', -50000, 'Archive me', auth.uid() from students limit 1 returning id`,
        );
        expect((await s.rows(`select 1 from public.list_adjustments(${month}, 1000, 0) where reason = 'Archive me'`)).length).toBe(1);
        await s.rows(`update charges set archived_at = now() where id = $1`, [id]);
        expect(await s.rows(`select 1 from public.list_adjustments(${month}, 1000, 0) where reason = 'Archive me'`)).toEqual([]);
      });
    });
  });

  describe("expenses and payouts", () => {
    it("an archived expense leaves the month's expenses", async () => {
      await as("owner", async (s) => {
        const before = await summary(s, lastMonth);
        const [expense] = await s.rows<{ id: string; amount: number }>(
          `select id, amount::float8 as amount from expenses where spent_on >= ${lastMonth} and spent_on < ${month} limit 1`,
        );
        await s.rows(`update expenses set archived_at = now() where id = $1`, [expense.id]);
        expect((await summary(s, lastMonth)).expenses).toBe(before.expenses - expense.amount);
      });
    });

    it("a paid payout can be archived and nothing else; Calculate then makes a fresh draft", async () => {
      await as("owner", async (s) => {
        await s.rows(`select public.calculate_teacher_payouts(${lastMonth})`);
        const where = `teacher_id = '${teacherId(1)}' and month = ${lastMonth}`;
        await s.rows(`update teacher_payouts set status = 'paid', paid_at = now(), paid_by = auth.uid() where ${where}`);
        const salaries = async () =>
          (await s.rows<{ v: number }>(`select salaries::float8 as v from public.report_kpis(${lastMonth}, ${lastMonth})`))[0].v;
        const before = await salaries();

        // Locked: no edit, no going back to draft.
        expect(code(await s.attempt(`update teacher_payouts set bonus = 1, note = 'x' where ${where}`))).toBe(DENIED);
        expect(code(await s.attempt(`update teacher_payouts set bonus = 1, note = 'x', archived_at = now() where ${where}`))).toBe(DENIED);
        // Archived: out of the salaries total.
        expect(code(await s.attempt(`update teacher_payouts set archived_at = now() where ${where}`))).toBe("allowed (1)");
        expect(await salaries()).toBe(before - 6_000_000);
        expect(code(await s.attempt(`update teacher_payouts set archived_at = null where ${where}`))).toBe(DENIED);

        // The month can be calculated again for that teacher.
        await s.rows(`select public.calculate_teacher_payouts(${lastMonth})`);
        expect(
          await s.rows(`select status, archived_at is null as live from teacher_payouts where ${where} order by created_at`),
        ).toEqual([
          { status: "paid", live: false },
          { status: "draft", live: true },
        ]);
        expect(await salaries()).toBe(before);
        // And running it once more adds nothing.
        await s.rows(`select public.calculate_teacher_payouts(${lastMonth})`);
        expect(await s.count("teacher_payouts", where)).toBe(2);
      });
    });

    it("a manager archives none of them", async () => {
      await as(
        "manager",
        async (s) => {
          expect(code(await s.attempt(`update expenses set archived_at = now()`))).toBe("allowed (0)");
          expect(code(await s.attempt(`update teacher_payouts set archived_at = now()`))).toBe("allowed (0)");
        },
        async (a) => {
          await a.rows(`select public.calculate_teacher_payouts(${lastMonth})`);
        },
      );
    });
  });
});
