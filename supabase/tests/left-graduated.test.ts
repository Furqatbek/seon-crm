/**
 * Students who left or graduated — docs/SPEC.md → "Business rules → Balance
 * and payments" and "Enrolment". A student who left is not chased for money;
 * a graduate who still owes is. Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, admin, as, connect, disconnect, studentId, type Session } from "./helpers";

const month = `date_trunc('month', public.tashkent_today())::date`;
// Seeded: an active student in debt. The amount is read, not assumed.
const DEBTOR = studentId(1);

const debts = async (s: Session) => {
  const [finance] = await s.rows<{ debt: number }>(`select debt::float8 as debt from public.finance_month_summary(${month})`);
  const [report] = await s.rows<{ debt: number }>(`select total_debt::float8 as debt from public.report_kpis(${month}, ${month})`);
  const [aged] = await s.rows<{ debt: number }>(`select coalesce(sum(amount), 0)::float8 as debt from public.report_debt_age()`);
  const listed = (await s.rows(`select 1 from public.list_debtors(1000, 0) where student_id = $1`, [DEBTOR])).length;
  return { finance: finance.debt, report: report.debt, aged: aged.debt, listed };
};
const balance = async (s: Session) =>
  (await s.rows<{ balance: number }>(`select balance::float8 as balance from student_balances where student_id = $1`, [DEBTOR]))[0].balance;

describe.skipIf(!DB_URL)("Students who left or graduated", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("a student who left drops out of Debtors and every debt total, but keeps the balance", async () => {
    await as("owner", async (s) => {
      const before = await debts(s);
      const DEBT = -(await balance(s));
      expect(DEBT).toBeGreaterThan(0);
      expect(before.listed).toBe(1);
      expect(before.finance).toBe(before.report);
      expect(before.aged).toBe(before.finance);

      await s.rows(`select public.mark_student_left($1)`, [DEBTOR]);

      expect(await debts(s)).toEqual({
        finance: before.finance - DEBT,
        report: before.report - DEBT,
        aged: before.aged - DEBT,
        listed: 0,
      });
      expect(await balance(s)).toBe(-DEBT);
      expect(await s.rows(`select balance::float8 as balance from student_overview where id = $1`, [DEBTOR])).toEqual([{ balance: -DEBT }]);
    });
  });

  it("a student who left gets no automatic debt reminder", async () => {
    await admin(async (s) => {
      expect((await s.rows(`select 1 from public.notify_debtors() where student_id = $1`, [DEBTOR])).length).toBe(1);
      await s.rows(`update students set status = 'left' where id = $1`, [DEBTOR]);
      expect(await s.rows(`select 1 from public.notify_debtors() where student_id = $1`, [DEBTOR])).toEqual([]);
    });
  });

  it("a manager marks a student as graduated: enrolments end today, the debt stays owed", async () => {
    await as("manager", async (s) => {
      const active = await s.count("enrollments", `student_id = '${DEBTOR}' and status = 'active'`);
      expect(active).toBeGreaterThan(0);
      const DEBT = -(await balance(s));
      const endedToday = await s.count("enrollments", `student_id = '${DEBTOR}' and left_on = public.tashkent_today()`);
      const [{ n: listedBefore }] = await s.rows<{ n: number }>(`select count(*)::int as n from public.list_debtors(1000, 0) where student_id = $1`, [DEBTOR]);

      await s.rows(`select public.mark_student_graduated($1)`, [DEBTOR]);

      expect(await s.rows(`select status from students where id = $1`, [DEBTOR])).toEqual([{ status: "graduated" }]);
      expect(await s.count("enrollments", `student_id = '${DEBTOR}' and status = 'active'`)).toBe(0);
      expect(await s.count("enrollments", `student_id = '${DEBTOR}' and left_on = public.tashkent_today()`)).toBe(endedToday + active);
      const [{ n: listedAfter }] = await s.rows<{ n: number }>(`select count(*)::int as n from public.list_debtors(1000, 0) where student_id = $1`, [DEBTOR]);
      expect(listedAfter).toBe(listedBefore);
      expect(await balance(s)).toBe(-DEBT);
    });
  });

  it("enrolling a graduate again makes them active", async () => {
    await as("owner", async (s) => {
      await s.rows(`select public.mark_student_graduated($1)`, [DEBTOR]);
      // A group the student was never in.
      const [group] = await s.rows<{ id: string }>(
        `select g.id from groups g
         where g.status = 'active' and g.archived_at is null
           and not exists (select 1 from enrollments e where e.group_id = g.id and e.student_id = $1)
         order by g.id limit 1`,
        [DEBTOR],
      );
      await s.rows(`select public.enrol_student($1, $2, public.tashkent_today())`, [DEBTOR, group.id]);
      expect(await s.rows(`select status from students where id = $1`, [DEBTOR])).toEqual([{ status: "active" }]);
    });
  });

  it("a teacher cannot mark a student as graduated", async () => {
    await as("teacher", async (s) => {
      const result = await s.attempt(`select public.mark_student_graduated($1)`, [DEBTOR]);
      expect(result.ok).toBe(false);
      expect(await s.count("students")).toBe(0);
    });
  });
});
