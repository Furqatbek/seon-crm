/**
 * Reports — every number matches Finance.
 * docs/SPEC.md → "Screens → Reports". Same setup as permissions.test.ts;
 * every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, OWNER_ID, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";
const month = `date_trunc('month', ${today})::date`;
const monthsAgo = (n: number) => `(date_trunc('month', ${today}) - interval '${n} month')::date`;

type Kpis = {
  collected: number | null;
  expenses: number | null;
  salaries: number | null;
  profit: number | null;
  total_debt: number | null;
  active_students: number;
  new_leads: number;
  won_leads: number;
  lead_conversion: number | null;
  attendance_rate: number | null;
};
const kpis = async (s: Session, from: string, to: string) =>
  (
    await s.rows<Kpis>(
      `select collected::float8 as collected, expenses::float8 as expenses, salaries::float8 as salaries,
              profit::float8 as profit, total_debt::float8 as total_debt, active_students, new_leads, won_leads,
              lead_conversion::float8 as lead_conversion, attendance_rate::float8 as attendance_rate
       from public.report_kpis(${from}, ${to})`,
    )
  )[0];
const finance = async (s: Session, forMonth: string) =>
  (
    await s.rows<{ collected: number; billed: number; debt: number; expenses: number }>(
      `select collected::float8 as collected, billed::float8 as billed, debt::float8 as debt, expenses::float8 as expenses
       from public.finance_month_summary(${forMonth})`,
    )
  )[0];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe.skipIf(!DB_URL)("Reports", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("report totals equal Finance totals for the same month", () => {
    it.each([
      ["this month", month],
      ["last month", monthsAgo(1)],
      ["two months ago", monthsAgo(2)],
    ])("%s", async (_name, forMonth) => {
      await as("owner", async (s) => {
        // Salaries exist once the owner has calculated the month.
        await s.rows(`select public.calculate_teacher_payouts(${forMonth})`);
        const strip = await finance(s, forMonth);
        const [{ payouts }] = await s.rows<{ payouts: number }>(
          `select coalesce(sum(final_amount), 0)::float8 as payouts from teacher_payouts where month = ${forMonth}`,
        );
        expect(strip.collected).toBeGreaterThan(0);
        expect(strip.expenses).toBeGreaterThan(0);
        expect(payouts).toBeGreaterThan(0);

        // The KPI row.
        const row = await kpis(s, forMonth, forMonth);
        expect(row.collected).toBe(strip.collected);
        expect(row.expenses).toBe(strip.expenses);
        expect(row.salaries).toBe(payouts);
        expect(row.profit).toBe(strip.collected - strip.expenses - payouts);
        expect(
          await s.rows(`select costs::float8 as costs from public.report_kpis(${forMonth}, ${forMonth})`),
        ).toEqual([{ costs: strip.expenses + payouts }]);
        expect(
          await s.rows(`select costs::float8 as costs from public.report_collected_vs_expenses(${forMonth}, ${forMonth})`),
        ).toEqual([{ costs: strip.expenses + payouts }]);
        expect(row.total_debt).toBe(strip.debt);

        // Collected vs expenses by month.
        expect(
          await s.rows(
            `select collected::float8 as collected, expenses::float8 as expenses, salaries::float8 as salaries
             from public.report_collected_vs_expenses(${forMonth}, ${forMonth})`,
          ),
        ).toEqual([{ collected: strip.collected, expenses: strip.expenses, salaries: payouts }]);

        // Revenue by group and by subject: both add up to Collected.
        const revenue = await s.rows<{ dimension: string; collected: number }>(
          `select dimension, collected::float8 as collected from public.report_revenue(${forMonth}, ${forMonth})`,
        );
        const of = (dimension: string) => revenue.filter((entry) => entry.dimension === dimension).map((entry) => entry.collected);
        expect(of("group").length).toBeGreaterThan(5);
        expect(sum(of("group"))).toBe(strip.collected);
        expect(sum(of("subject"))).toBe(strip.collected);
        // Largest first.
        expect(of("group")).toEqual([...of("group")].sort((a, b) => b - a));

        // The Payments tab's own rows for the month.
        const [{ payments }] = await s.rows<{ payments: number }>(
          `select coalesce(sum(amount), 0)::float8 as payments from payments
           where voided_at is null
             and paid_at >= (${forMonth}::timestamp at time zone 'Asia/Tashkent')
             and paid_at < ((${forMonth} + interval '1 month')::timestamp at time zone 'Asia/Tashkent')`,
        );
        expect(row.collected).toBe(payments);
      });
    });

    it("a period of several months is the sum of its months", async () => {
      await as("owner", async (s) => {
        for (const n of [0, 1, 2]) await s.rows(`select public.calculate_teacher_payouts(${monthsAgo(n)})`);
        const months = [await finance(s, monthsAgo(2)), await finance(s, monthsAgo(1)), await finance(s, month)];
        const row = await kpis(s, monthsAgo(2), month);
        expect(row.collected).toBe(sum(months.map((entry) => entry.collected)));
        expect(row.expenses).toBe(sum(months.map((entry) => entry.expenses)));

        const byMonth = await s.rows<{ collected: number; expenses: number; salaries: number }>(
          `select collected::float8 as collected, expenses::float8 as expenses, salaries::float8 as salaries
           from public.report_collected_vs_expenses(${monthsAgo(2)}, ${month})`,
        );
        expect(byMonth.map((entry) => entry.collected)).toEqual(months.map((entry) => entry.collected));
        expect(byMonth.map((entry) => entry.expenses)).toEqual(months.map((entry) => entry.expenses));
        expect(sum(byMonth.map((entry) => entry.salaries))).toBe(row.salaries);
      });
    });

    it("debt by age adds up to the Debt in Finance, student by student", async () => {
      await as("owner", async (s) => {
        const strip = await finance(s, month);
        const buckets = await s.rows<{ bucket: string; amount: number; students: number }>(
          `select bucket, amount::float8 as amount, students from public.report_debt_age()`,
        );
        expect(buckets.map((entry) => entry.bucket)).toEqual(["0_30", "31_60", "over_60"]);
        expect(sum(buckets.map((entry) => entry.amount))).toBe(strip.debt);
        expect(strip.debt).toBeGreaterThan(0);
        // Seeded: some fees of last month are still unpaid.
        expect(buckets[1].amount).toBeGreaterThan(0);
        const [{ debtors }] = await s.rows<{ debtors: number }>(
          `select count(*)::int as debtors from student_balances where balance < 0`,
        );
        expect(buckets.every((entry) => entry.students <= debtors)).toBe(true);
      });
    });

    it("a payment, a void, an expense and a credit move the report exactly as they move Finance", async () => {
      await as("owner", async (s) => {
        const before = await kpis(s, month, month);
        const [debtor] = await s.rows<{ student_id: string; group_id: string; owed: number }>(
          `select b.student_id, e.group_id, (-b.balance)::float8 as owed
           from student_balances b join enrollments e on e.student_id = b.student_id and e.status = 'active'
           where b.balance < 0 order by b.balance limit 1`,
        );
        const [payment] = await s.rows<{ id: string }>(
          `insert into payments (student_id, group_id, amount, method, received_by)
           values ($1, $2, $3, 'cash', auth.uid()) returning id`,
          [debtor.student_id, debtor.group_id, debtor.owed],
        );
        let after = await kpis(s, month, month);
        expect(after.collected).toBe(before.collected! + debtor.owed);
        expect(after.total_debt).toBe(before.total_debt! - debtor.owed);
        expect(after).toMatchObject({ collected: (await finance(s, month)).collected, total_debt: (await finance(s, month)).debt });

        await s.rows(`update payments set voided_at = now(), voided_by = auth.uid(), void_reason = 'Test' where id = $1`, [payment.id]);
        after = await kpis(s, month, month);
        expect(after.collected).toBe(before.collected);
        expect(after.total_debt).toBe(before.total_debt);

        await s.rows(
          `insert into expenses (category, amount, spent_on, created_by) values ('supplies', 90000, ${today}, $1)`,
          [OWNER_ID],
        );
        after = await kpis(s, month, month);
        expect(after.expenses).toBe(before.expenses! + 90_000);
        expect(after.profit).toBe(before.profit! - 90_000);
        expect(after.expenses).toBe((await finance(s, month)).expenses);
      });
    });
  });

  describe("people figures", () => {
    it("active students, joins and leaves follow the enrolments", async () => {
      await as("owner", async (s) => {
        const rows = await s.rows<{ month: string; active: number; joined: number; left_count: number }>(
          `select month::text, active, joined, left_count from public.report_students(${monthsAgo(5)}, ${month})`,
        );
        expect(rows).toHaveLength(6);
        const [{ now, ever, gone }] = await s.rows<{ now: number; ever: number; gone: number }>(
          `select
             (select count(distinct student_id)::int from enrollments where status = 'active' and joined_on <= ${today}) as now,
             (select count(distinct student_id)::int from enrollments where joined_on >= ${monthsAgo(5)} and joined_on <= ${today}
                and student_id not in (select student_id from enrollments where joined_on < ${monthsAgo(5)})) as ever,
             (select count(*)::int from (select student_id from enrollments group by student_id
                having bool_and(left_on is not null) and max(left_on) >= ${monthsAgo(5)}) x) as gone`,
        );
        expect(rows.at(-1)!.active).toBe(now);
        expect(sum(rows.map((row) => row.joined))).toBe(ever);
        expect(sum(rows.map((row) => row.left_count))).toBe(gone);
        // The KPI is the last point of the chart.
        expect((await kpis(s, monthsAgo(5), month)).active_students).toBe(now);
        // Each month's count is the one before plus joins minus leaves.
        for (let i = 1; i < rows.length - 1; i += 1) {
          expect(rows[i].active).toBe(rows[i - 1].active + rows[i].joined - rows[i].left_count);
        }
      });
    });

    it("the lead funnel counts the leads created in the period, by stage and by source", async () => {
      await as("owner", async (s) => {
        const rows = await s.rows<{ dimension: string; key: string; leads: number; won: number }>(
          `select dimension, key, leads, won from public.report_lead_funnel(${monthsAgo(11)}, ${month})`,
        );
        const stages = rows.filter((row) => row.dimension === "stage");
        const sources = rows.filter((row) => row.dimension === "source");
        expect(stages.map((row) => row.key)).toEqual(["new", "contacted", "trial", "won", "lost"]);
        expect(sources).toHaveLength(7);
        const [{ leads, won }] = await s.rows<{ leads: number; won: number }>(
          `select count(*)::int as leads, (count(*) filter (where status = 'won'))::int as won
           from leads where archived_at is null and created_at >= (${monthsAgo(11)}::timestamp at time zone 'Asia/Tashkent')`,
        );
        expect(leads).toBeGreaterThan(30);
        expect(sum(stages.map((row) => row.leads))).toBe(leads);
        expect(sum(sources.map((row) => row.leads))).toBe(leads);
        expect(sum(sources.map((row) => row.won))).toBe(won);
        expect(stages.find((row) => row.key === "won")!.leads).toBe(won);

        const row = await kpis(s, monthsAgo(11), month);
        expect(row).toMatchObject({ new_leads: leads, won_leads: won });
        expect(row.lead_conversion).toBe(Math.round((1000 * won) / leads) / 10);
      });
    });

    it("attendance rate = (present + late) ÷ (present + late + absent), excused left out", async () => {
      await as("owner", async (s) => {
        const rows = await s.rows<{ present: number; late: number; absent: number; excused: number; rate: number }>(
          `select present, late, absent, excused, rate::float8 as rate from public.report_attendance(${monthsAgo(1)}, ${month})`,
        );
        expect(rows.length).toBeGreaterThan(5);
        for (const row of rows) {
          expect(row.rate).toBe(Math.round((1000 * (row.present + row.late)) / (row.present + row.late + row.absent)) / 10);
        }
        expect(rows.map((row) => row.rate)).toEqual([...rows.map((row) => row.rate)].sort((a, b) => b - a));
        const attended = sum(rows.map((row) => row.present + row.late));
        const marked = attended + sum(rows.map((row) => row.absent));
        expect((await kpis(s, monthsAgo(1), month)).attendance_rate).toBe(Math.round((1000 * attended) / marked) / 10);
        const [{ excused }] = await s.rows<{ excused: number }>(
          `select count(*)::int as excused from attendance a join lessons l on l.id = a.lesson_id
           where a.status = 'excused' and l.lesson_date >= ${monthsAgo(1)}`,
        );
        expect(sum(rows.map((row) => row.excused))).toBe(excused);
      });
    });
  });

  describe("a manager sees only the lead, attendance and student-count parts", () => {
    it("the money functions refuse a manager and the KPI row has no money", async () => {
      await as("manager", async (s) => {
        expect(code(await s.attempt(`select * from public.report_collected_vs_expenses(${month}, ${month})`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.report_revenue(${month}, ${month})`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.report_debt_age()`))).toBe(DENIED);

        const row = await kpis(s, monthsAgo(2), month);
        expect(row).toMatchObject({ collected: null, expenses: null, salaries: null, profit: null, total_debt: null });
        expect(row.active_students).toBeGreaterThan(50);
        expect(row.new_leads).toBeGreaterThan(0);
        expect(row.attendance_rate).toBeGreaterThan(50);

        expect((await s.rows(`select * from public.report_lead_funnel(${monthsAgo(2)}, ${month})`)).length).toBe(12);
        expect((await s.rows(`select * from public.report_students(${monthsAgo(2)}, ${month})`)).length).toBe(3);
        expect((await s.rows(`select * from public.report_attendance(${monthsAgo(2)}, ${month})`)).length).toBeGreaterThan(5);
      });
    });

    it("the owner and the manager get the same people figures", async () => {
      const people = async (s: Session) => {
        const { active_students, new_leads, won_leads, lead_conversion, attendance_rate } = await kpis(s, monthsAgo(2), month);
        return { active_students, new_leads, won_leads, lead_conversion, attendance_rate };
      };
      expect(await as("manager", people)).toEqual(await as("owner", people));
    });

    it("a visitor gets nothing", async () => {
      await as("anon", async (s) => {
        for (const call of [
          `report_kpis(${month}, ${month})`,
          `report_collected_vs_expenses(${month}, ${month})`,
          `report_revenue(${month}, ${month})`,
          `report_lead_funnel(${month}, ${month})`,
          `report_students(${month}, ${month})`,
          `report_attendance(${month}, ${month})`,
          `report_debt_age()`,
        ]) {
          expect(code(await s.attempt(`select * from public.${call}`))).toBe(DENIED);
        }
      });
    });
  });

  it("refuses a period that is not whole months, is backwards or is longer than 36 months", async () => {
    await as("owner", async (s) => {
      expect(code(await s.attempt(`select * from public.report_kpis(${month} + 1, ${month})`))).toBe("ER001");
      expect(code(await s.attempt(`select * from public.report_kpis(${month}, ${monthsAgo(1)})`))).toBe("ER001");
      expect(code(await s.attempt(`select * from public.report_students(${monthsAgo(36)}, ${month})`))).toBe("ER001");
      expect(code(await s.attempt(`select * from public.report_students(${monthsAgo(35)}, ${month})`))).toMatch(/^allowed/);
      expect(code(await s.attempt(`select * from public.report_revenue(null, ${month})`))).toBe("ER001");
    });
  });
});
