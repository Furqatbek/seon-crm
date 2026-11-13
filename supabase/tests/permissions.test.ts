/**
 * Proves docs/SPEC.md → "Roles and permissions", one describe block per row
 * of that table, by signing in as the seeded owner and manager.
 *
 * Needs a database with the migrations and supabase/seed.sql applied:
 * SUPABASE_DB_URL in .env.local (the dev project) or a local one from
 * scripts/local-db.sh. Every test runs in a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DB_URL,
  DENIED,
  MANAGER_ID,
  OWNER_ID,
  admin,
  as,
  connect,
  disconnect,
  enrollmentId,
  groupId,
  leadId,
  studentId,
  teacherId,
  type Attempt,
  type Session,
} from "./helpers";

const allowed = (result: Attempt, rows = 1) =>
  expect(result.ok ? result.rowCount : `refused: ${result.message}`).toBe(rows);
/** Refused with an error: no grant, a policy check or a guard trigger. */
const denied = (result: Attempt) =>
  expect(result.ok ? `allowed (${result.rowCount} rows)` : result.code).toBe(DENIED);
/** Row level security hides the rows, so the statement changes nothing. */
const noEffect = (result: Attempt) =>
  expect(result.ok ? result.rowCount : `refused: ${result.message}`).toBe(0);

const BOTH = ["owner", "manager"] as const;
const month = `date_trunc('month', now() at time zone 'Asia/Tashkent')::date`;
const today = `(now() at time zone 'Asia/Tashkent')::date`;

const newLead = (s: Session) =>
  s.attempt(
    `insert into leads (full_name, phone, source, created_by)
     values ('Test Lead', '+998900000001', 'instagram', auth.uid()) returning id`,
  );
const newPayment = (s: Session, receivedBy = "auth.uid()") =>
  s.attempt(
    `insert into payments (student_id, group_id, amount, method, received_by)
     values ($1, $2, 500000, 'cash', ${receivedBy}) returning id, receipt_no`,
    [studentId(1), groupId(1)],
  );
const idOf = (result: Attempt) => (result.ok ? (result.rows[0].id as string) : "");

describe.skipIf(!DB_URL)("Roles and permissions", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("the seed has an active owner and an active manager who can sign in", async () => {
    expect(await as("owner", (s) => s.rows("select app_role() as role, is_owner() as owner"))).toEqual([
      { role: "owner", owner: true },
    ]);
    expect(await as("manager", (s) => s.rows("select app_role() as role, is_owner() as owner"))).toEqual([
      { role: "manager", owner: false },
    ]);
  });

  describe("Leads — owner: full · manager: full, except archive", () => {
    it.each(BOTH)("%s reads, creates and edits leads and writes to the timeline", async (who) => {
      await as(who, async (s) => {
        // At least the seed: other test runs may have added more.
        expect(await s.count("leads")).toBeGreaterThanOrEqual(40);
        const lead = await newLead(s);
        allowed(lead);
        allowed(await s.attempt(`update leads set status = 'contacted' where id = $1`, [idOf(lead)]));
        allowed(
          await s.attempt(
            `insert into lead_activities (lead_id, kind, from_status, to_status, created_by)
             values ($1, 'status_change', 'new', 'contacted', auth.uid())`,
            [idOf(lead)],
          ),
        );
        allowed(
          await s.attempt(`update leads set status = 'lost', lost_reason = 'price' where id = $1`, [leadId(1)]),
        );
      });
    });

    it("every status change writes a timeline row, with who did it and why", async () => {
      await as("manager", async (s) => {
        const lead = idOf(await newLead(s));
        const timeline = () =>
          s.rows(
            `select kind, from_status, to_status, body, created_by from lead_activities
             where lead_id = $1 order by from_status`,
            [lead],
          );
        expect(await timeline()).toEqual([]);

        allowed(await s.attempt(`update leads set status = 'contacted' where id = $1`, [lead]));
        // Editing anything else is not a status change.
        allowed(await s.attempt(`update leads set notes = 'x' where id = $1`, [lead]));
        allowed(await s.attempt(`update leads set status = 'lost', lost_reason = 'price' where id = $1`, [lead]));

        // Both rows share the test transaction's timestamp, so order by stage.
        expect(await timeline()).toEqual([
          { kind: "status_change", from_status: "new", to_status: "contacted", body: null, created_by: MANAGER_ID },
          { kind: "status_change", from_status: "contacted", to_status: "lost", body: "price", created_by: MANAGER_ID },
        ]);
      });
    });

    it("a lead cannot be lost without a reason or in trial without a group and date", async () => {
      await as("manager", async (s) => {
        const lead = idOf(await newLead(s));
        const noReason = await s.attempt(`update leads set status = 'lost' where id = $1`, [lead]);
        expect(noReason.ok ? "allowed" : noReason.code).toBe("23514");
        const noGroup = await s.attempt(`update leads set status = 'trial' where id = $1`, [lead]);
        expect(noGroup.ok ? "allowed" : noGroup.code).toBe("23514");
        allowed(
          await s.attempt(
            `update leads set status = 'trial', trial_group_id = $2, trial_date = ${today} where id = $1`,
            [lead, groupId(1)],
          ),
        );
      });
    });

    it("owner archives a lead; manager cannot", async () => {
      const archive = (s: Session) =>
        s.attempt(`update leads set archived_at = now() where id = $1`, [leadId(1)]);
      allowed(await as("owner", archive));
      denied(await as("manager", archive));
    });

    it("a timeline entry cannot be written in someone else's name or edited", async () => {
      await as("manager", async (s) => {
        denied(
          await s.attempt(
            `insert into lead_activities (lead_id, kind, body, created_by) values ($1, 'note', 'x', $2)`,
            [leadId(1), OWNER_ID],
          ),
        );
        denied(await s.attempt(`update lead_activities set body = 'x' where lead_id = $1`, [leadId(1)]));
      });
    });
  });

  describe("Students — owner: full · manager: create, edit, enrol, transfer, mark as left", () => {
    it.each(BOTH)("%s creates, edits, enrols, transfers and marks a student as left", async (who) => {
      await as(who, async (s) => {
        expect(await s.count("students")).toBeGreaterThanOrEqual(80);
        const student = await s.attempt(
          `insert into students (full_name, phone) values ('Test Student', '+998900000002')
           returning id, telegram_link_code`,
        );
        allowed(student);
        expect(student.ok && student.rows[0].telegram_link_code).toMatch(/^[A-Za-z0-9]{22}$/);
        const id = idOf(student);

        allowed(await s.attempt(`update students set parent_name = 'Test Parent' where id = $1`, [id]));
        // Enrol in group 1, then transfer to group 2 on the same day.
        const enrolment = await s.attempt(
          `insert into enrollments (group_id, student_id, joined_on) values ($1, $2, ${today}) returning id`,
          [groupId(1), id],
        );
        allowed(enrolment);
        allowed(
          await s.attempt(`update enrollments set status = 'left', left_on = ${today} where id = $1`, [
            idOf(enrolment),
          ]),
        );
        allowed(
          await s.attempt(
            `insert into enrollments (group_id, student_id, joined_on) values ($1, $2, ${today})`,
            [groupId(2), id],
          ),
        );
        allowed(await s.attempt(`update students set status = 'left' where id = $1`, [id]));
      });
    });

    it.each(BOTH)("%s converts an open lead: student created, linked both ways, lead Won", async (who) => {
      await as(who, async (s) => {
        // Lead 1 is New in the seed.
        const [{ id }] = await s.rows<{ id: string }>(
          `select convert_lead_to_student($1, 'Converted Student', '+998900000009', p_language => 'ru') as id`,
          [leadId(1)],
        );
        expect(
          await s.rows(`select lead_id, language, status, length(telegram_link_code) as code from students where id = $1`, [id]),
        ).toEqual([{ lead_id: leadId(1), language: "ru", status: "active", code: 22 }]);
        expect(
          await s.rows(`select status, converted_student_id, next_contact_at from leads where id = $1`, [leadId(1)]),
        ).toEqual([{ status: "won", converted_student_id: id, next_contact_at: null }]);
        expect(
          await s.rows(
            `select from_status, to_status from lead_activities
             where lead_id = $1 and kind = 'status_change' and to_status = 'won'`,
            [leadId(1)],
          ),
        ).toEqual([{ from_status: "new", to_status: "won" }]);

        // It cannot be converted twice, and a won lead is read-only.
        const again = await s.attempt(`select convert_lead_to_student($1, 'x', '+998900000009')`, [leadId(1)]);
        expect(again.ok ? "allowed" : again.code).toBe("P0001");
        denied(await s.attempt(`update leads set notes = 'x' where id = $1`, [leadId(1)]));
        denied(await s.attempt(`update leads set status = 'new', converted_student_id = null where id = $1`, [leadId(1)]));
      });
    });

    it("a won lead can still be archived by the owner, not by a manager", async () => {
      // Lead 4 is Won in the seed.
      const archive = (s: Session) =>
        s.attempt(`update leads set archived_at = now() where id = $1`, [leadId(4)]);
      allowed(await as("owner", archive));
      denied(await as("manager", archive));
    });

    it.each(BOTH)("%s marks a student as left: every active enrolment ends today", async (who) => {
      await as(who, async (s) => {
        // Student 8 is in two groups.
        expect(await s.count("enrollments", `student_id = '${studentId(8)}' and status = 'active'`)).toBe(2);
        await s.rows(`select mark_student_left($1)`, [studentId(8)]);
        expect(await s.rows(`select status from students where id = $1`, [studentId(8)])).toEqual([{ status: "left" }]);
        expect(
          await s.rows(
            `select status, left_on = ${today} as today from enrollments where student_id = $1`,
            [studentId(8)],
          ),
        ).toEqual([
          { status: "left", today: true },
          { status: "left", today: true },
        ]);
      });
    });

    it.each(BOTH)("%s reads the student list with balances", async (who) => {
      await as(who, async (s) => {
        expect(await s.count("student_overview")).toBe(await s.count("students"));
        expect(
          await s.rows(
            `select count(*)::int as n from student_overview o join student_balances b on b.student_id = o.id
             where o.balance is distinct from b.balance`,
          ),
        ).toEqual([{ n: 0 }]);
      });
    });

    it("owner archives a student; manager cannot", async () => {
      const archive = (s: Session) =>
        s.attempt(`update students set archived_at = now() where id = $1`, [studentId(1)]);
      allowed(await as("owner", archive));
      denied(await as("manager", archive));
    });
  });

  describe("Groups and lessons — owner: full · manager: create, edit, cancel a lesson, mark attendance", () => {
    it.each(BOTH)("%s creates and edits a group, cancels a lesson and marks attendance", async (who) => {
      await as(who, async (s) => {
        expect(await s.count("groups")).toBeGreaterThanOrEqual(10);
        const group = await s.attempt(
          `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date)
           values ('Test Group', 'Ingliz tili', $1, 500000, '{1,3,5}', '09:00', ${today}) returning id`,
          [teacherId(1)],
        );
        allowed(group);
        allowed(await s.attempt(`update groups set room = '7-xona' where id = $1`, [idOf(group)]));

        allowed(
          await s.attempt(
            `update lessons set status = 'cancelled', cancel_reason = 'Oʻqituvchi kasal'
             where id = (select id from lessons where lesson_date > ${today} order by lesson_date limit 1)`,
          ),
        );

        // A lesson held in the last few days: change one mark, then mark a new student.
        const [recent] = await s.rows<{ lesson_id: string; student_id: string }>(
          `select a.lesson_id, a.student_id from attendance a join lessons l on l.id = a.lesson_id
           where l.lesson_date >= ${today} - 5 order by l.lesson_date desc limit 1`,
        );
        allowed(
          await s.attempt(
            `insert into attendance (lesson_id, student_id, status, marked_by)
             values ($1, $2, 'late', auth.uid())
             on conflict (lesson_id, student_id)
             do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now()`,
            [recent.lesson_id, recent.student_id],
          ),
        );
      });
    });

    const oldMark = `select a.lesson_id, a.student_id from attendance a join lessons l on l.id = a.lesson_id
                     where l.lesson_date < ${today} - 7 order by l.lesson_date limit 1`;

    it("manager cannot change or add attendance older than 7 days; owner can", async () => {
      await as("manager", async (s) => {
        // The row is visible to read but not to update.
        expect((await s.rows(oldMark)).length).toBe(1);
        noEffect(
          await s.attempt(
            `update attendance set status = 'absent', marked_by = auth.uid()
             where (lesson_id, student_id) in (${oldMark})`,
          ),
        );
      });
      const addOld = (s: Session) =>
        s.attempt(
          `insert into attendance (lesson_id, student_id, status, marked_by)
           select l.id, $1, 'present', auth.uid() from lessons l
           where l.lesson_date < ${today} - 7 and l.status = 'held' order by l.lesson_date limit 1`,
          [studentId(80)],
        );
      // Student 80 is not in that group, so no mark exists yet.
      const cleared = (a: Session) => a.rows(`delete from attendance where student_id = $1`, [studentId(80)]).then(() => {});
      denied(await as("manager", addOld, cleared));
      allowed(await as("owner", addOld, cleared));
      allowed(
        await as("owner", (s) =>
          s.attempt(
            `update attendance set status = 'absent', marked_by = auth.uid()
             where (lesson_id, student_id) in (${oldMark})`,
          ),
        ),
      );
    });

    it("attendance cannot be marked in someone else's name", async () => {
      denied(
        await as("manager", (s) =>
          s.attempt(
            `update attendance set marked_by = $1
             where (lesson_id, student_id) in (
               select a.lesson_id, a.student_id from attendance a join lessons l on l.id = a.lesson_id
               where l.lesson_date >= ${today} - 5 limit 1)`,
            [OWNER_ID],
          ),
        ),
      );
    });

    it("owner archives a group; manager cannot", async () => {
      const archive = (s: Session) =>
        s.attempt(`update groups set archived_at = now() where id = $1`, [groupId(10)]);
      allowed(await as("owner", archive));
      denied(await as("manager", archive));
    });
  });

  describe("Teachers — owner: full, including pay rates · manager: contact details and schedule only", () => {
    const newTeacher = (s: Session) =>
      s.attempt(`insert into teachers (full_name, phone) values ('Test Teacher', '+998900000003') returning id`);
    const newRate = (s: Session) =>
      s.attempt(
        `insert into teacher_pay_rates (teacher_id, pay_type, amount, effective_from)
         values ($1, 'per_lesson', 130000, ${month} + 40)`,
        [teacherId(3)],
      );

    it("owner creates and edits teachers and reads and sets pay rates", async () => {
      await as("owner", async (s) => {
        allowed(await newTeacher(s));
        allowed(await s.attempt(`update teachers set notes = 'x' where id = $1`, [teacherId(1)]));
        // At least the seed: end-to-end runs add teachers and rates.
        expect(await s.count("teacher_pay_rates")).toBeGreaterThanOrEqual(8);
        allowed(await newRate(s));
      });
    });

    it("manager sees teachers and their lessons but gets zero pay rates and cannot write", async () => {
      await as("manager", async (s) => {
        expect(await s.count("teachers")).toBeGreaterThanOrEqual(6);
        expect(await s.count("lessons", `teacher_id = '${teacherId(1)}'`)).toBeGreaterThan(0);
        expect(await s.count("teacher_pay_rates")).toBe(0);
        denied(await newTeacher(s));
        noEffect(await s.attempt(`update teachers set notes = 'x' where id = $1`, [teacherId(1)]));
        denied(await newRate(s));
      });
    });

    it("a pay rate is history: even the owner cannot rewrite one", async () => {
      denied(await as("owner", (s) => s.attempt(`update teacher_pay_rates set amount = 1`)));
    });
  });

  describe("Payments — owner: take and void · manager: take only", () => {
    it.each(BOTH)("%s takes a payment and gets a receipt number", async (who) => {
      await as(who, async (s) => {
        const payment = await newPayment(s);
        allowed(payment);
        expect(Number(payment.ok && payment.rows[0].receipt_no)).toBeGreaterThan(200);
      });
    });

    const anyPayment = `(select id from payments where voided_at is null order by receipt_no limit 1)`;
    const voidIt = (s: Session) =>
      s.attempt(
        `update payments set voided_at = now(), void_reason = 'Xato kiritilgan', voided_by = auth.uid()
         where id = ${anyPayment}`,
      );

    it("owner voids a payment with a reason and it drops out of the balance", async () => {
      await as("owner", async (s) => {
        const paid = () =>
          s.rows<{ paid: string }>(
            `select paid from student_balances
             where student_id = (select student_id from payments where id = ${anyPayment.replace("voided_at is null", "true")})`,
          );
        const [before] = await paid();
        const [{ amount }] = await s.rows<{ amount: string }>(`select amount from payments where id = ${anyPayment}`);
        allowed(await voidIt(s));
        const [after] = await paid();
        expect(BigInt(before.paid) - BigInt(after.paid)).toBe(BigInt(amount));
      });
    });

    it("manager cannot void a payment", async () => {
      noEffect(await as("manager", voidIt));
    });

    it("a void needs a reason and nobody can edit a payment's amount", async () => {
      await as("owner", async (s) => {
        const noReason = await s.attempt(
          `update payments set voided_at = now(), voided_by = auth.uid() where id = ${anyPayment}`,
        );
        expect(noReason.ok ? "allowed" : noReason.code).toBe("23514");
        denied(await s.attempt(`update payments set amount = 1, voided_by = auth.uid() where id = ${anyPayment}`));
      });
    });

    it("a payment cannot be taken in someone else's name or entered already voided", async () => {
      await as("manager", async (s) => {
        denied(await newPayment(s, `'${OWNER_ID}'`));
        denied(
          await s.attempt(
            `insert into payments (student_id, group_id, amount, method, received_by, voided_at, void_reason)
             values ($1, $2, 500000, 'cash', auth.uid(), now(), 'x')`,
            [studentId(1), groupId(1)],
          ),
        );
      });
    });
  });

  describe("Charges — owner: generate a month, add credits · manager: first-month amount, credit with a note", () => {
    const monthlyFee = (s: Session) =>
      s.attempt(
        `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, amount, created_by)
         values ($1, $2, $3, (${month} + interval '1 month')::date, 'monthly_fee', 500000, 500000, auth.uid())`,
        [studentId(1), enrollmentId(1), groupId(1)],
      );
    const adjustment = (s: Session, amount: number, note: string | null) =>
      s.attempt(
        `insert into charges (student_id, group_id, billing_month, type, amount, note, created_by)
         values ($1, $2, ${month}, 'adjustment', $3, $4, auth.uid())`,
        [studentId(1), groupId(1), amount, note],
      );

    it.each(BOTH)("%s adds a credit with a note", async (who) => {
      await as(who, async (s) => {
        expect(await s.count("charges")).toBeGreaterThan(200);
        allowed(await adjustment(s, -100_000, "Kasallik sababli"));
      });
    });

    it("the owner adds a monthly fee for any month; a manager only for the month an enrolment joined in", async () => {
      await as("owner", async (s) => allowed(await monthlyFee(s)));
      await as("manager", async (s) => {
        // Next month's fee for an old enrolment is the billing job's to write.
        denied(await monthlyFee(s));
        // A new enrolment: its own first month is allowed, and nothing else about it.
        const [enrolment] = await s.rows<{ id: string; student_id: string; group_id: string }>(
          `insert into enrollments (group_id, student_id, joined_on)
           select $1, st.id, ${today} from students st
           where st.id not in (select student_id from enrollments where group_id = $1) and st.archived_at is null limit 1
           returning id, student_id, group_id`,
          [groupId(1)],
        );
        const fee = (monthSql: string, student = enrolment.student_id, group = enrolment.group_id) =>
          s.attempt(
            `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, amount, created_by)
             values ($1, $2, $3, ${monthSql}, 'monthly_fee', 500000, 0, auth.uid())`,
            [student, enrolment.id, group],
          );
        denied(await fee(`(${month} + interval '1 month')::date`));
        denied(await fee(`(${month} - interval '1 month')::date`));
        denied(await fee(month, studentId(1)));
        denied(await fee(month, enrolment.student_id, groupId(2)));
        allowed(await fee(month));
      });
    });

    it("the same month cannot be billed twice for one enrolment", async () => {
      await as("owner", async (s) => {
        allowed(await monthlyFee(s));
        const again = await monthlyFee(s);
        expect(again.ok ? "allowed" : again.code).toBe("23505");
      });
    });

    it("a credit without a note is refused for both", async () => {
      for (const who of BOTH) {
        const result = await as(who, (s) => adjustment(s, -100_000, null));
        expect(result.ok ? "allowed" : result.code).toBe("23514");
      }
    });

    it("only the owner can add a positive adjustment", async () => {
      allowed(await as("owner", (s) => adjustment(s, 100_000, "Kitob uchun")));
      denied(await as("manager", (s) => adjustment(s, 100_000, "Kitob uchun")));
    });

    it.each(BOTH)("%s cannot edit or delete a charge", async (who) => {
      await as(who, async (s) => {
        denied(await s.attempt(`update charges set amount = 0`));
        denied(await s.attempt(`delete from charges`));
      });
    });
  });

  describe("Debtors list — owner: yes · manager: yes", () => {
    it.each(BOTH)("%s reads debtors with the debt and the oldest unpaid month", async (who) => {
      await as(who, async (s) => {
        const debtors = await s.rows<{ balance: string; charged: string; paid: string; oldest_unpaid_month: Date }>(
          `select * from student_balances where balance < 0`,
        );
        expect(debtors.length).toBeGreaterThan(5);
        expect(debtors.length).toBeLessThan(40);
        for (const row of debtors) {
          expect(BigInt(row.paid) - BigInt(row.charged)).toBe(BigInt(row.balance));
          expect(row.oldest_unpaid_month).not.toBeNull();
        }
      });
    });
  });

  describe("Expenses — owner: full · manager: no access", () => {
    const newExpense = (s: Session) =>
      s.attempt(
        `insert into expenses (category, amount, spent_on, created_by) values ('supplies', 90000, ${today}, auth.uid())`,
      );

    it("owner reads, adds, edits and archives expenses", async () => {
      await as("owner", async (s) => {
        expect(await s.count("expenses")).toBeGreaterThan(10);
        allowed(await newExpense(s));
        allowed(
          await s.attempt(`update expenses set note = 'x' where category = 'rent'`),
          await s.count("expenses", "category = 'rent'"),
        );
        allowed(await s.attempt(`update expenses set archived_at = now() where category = 'other'`), await s.count("expenses", "category = 'other'"));
      });
    });

    it("manager gets zero rows and cannot add or edit", async () => {
      await as("manager", async (s) => {
        expect(await s.count("expenses")).toBe(0);
        denied(await newExpense(s));
        noEffect(await s.attempt(`update expenses set note = 'x'`));
      });
    });
  });

  describe("Teacher salaries — owner: full · manager: no access", () => {
    // The seed has no payouts (Phase 8 calculates them), so each test starts with one.
    const withPayout = (a: Session) =>
      a
        .rows(
          `insert into teacher_payouts (teacher_id, month, pay_type, basis, rate, calculated, final_amount)
           values ($1, (${month} - interval '1 month')::date, 'fixed_monthly', 0, 6000000, 6000000, 6000000)`,
          [teacherId(1)],
        )
        .then(() => {});
    const newPayout = (s: Session) =>
      s.attempt(
        `insert into teacher_payouts (teacher_id, month, pay_type, basis, rate, calculated, final_amount)
         values ($1, ${month}, 'per_lesson', 12, 120000, 1440000, 1440000)`,
        [teacherId(3)],
      );

    it("owner reads payouts, creates a draft, adds a bonus and marks it paid, which locks it", async () => {
      await as(
        "owner",
        async (s) => {
          expect(await s.count("teacher_payouts")).toBeGreaterThanOrEqual(1);
          allowed(await newPayout(s));
          allowed(await s.attempt(`update teacher_payouts set bonus = 200000, final_amount = 6200000, note = 'Olimpiada' where teacher_id = '${teacherId(1)}'`));
          allowed(await s.attempt(`update teacher_payouts set status = 'paid', paid_at = now(), paid_by = auth.uid() where teacher_id = '${teacherId(1)}'`));
          denied(await s.attempt(`update teacher_payouts set bonus = 0, final_amount = 6000000 where teacher_id = '${teacherId(1)}'`));
        },
        withPayout,
      );
    });

    it("manager gets zero rows and cannot create or change a payout", async () => {
      await as(
        "manager",
        async (s) => {
          expect(await s.count("teacher_payouts")).toBe(0);
          denied(await newPayout(s));
          noEffect(await s.attempt(`update teacher_payouts set bonus = 1, final_amount = 6000001`));
        },
        withPayout,
      );
    });
  });

  describe("Reports — owner: all · manager: leads, attendance and student counts; no money figures", () => {
    // The report functions arrive in Phase 9. What the tables allow today:
    it.each(BOTH)("%s can count leads by stage, attendance and students", async (who) => {
      await as(who, async (s) => {
        expect(await s.rows(`select status, count(*)::int as n from leads group by status order by status`)).toHaveLength(5);
        expect(await s.count("attendance")).toBeGreaterThan(1000);
        expect(await s.count("students", "status = 'active'")).toBeGreaterThanOrEqual(74);
      });
    });

    it("owner can total expenses and salaries for profit; manager gets nothing to total", async () => {
      const totals = (s: Session) =>
        s.rows<{ expenses: string | null; salaries: string | null; rates: number }>(
          `select (select sum(amount) from expenses) as expenses,
                  (select sum(final_amount) from teacher_payouts) as salaries,
                  (select count(*)::int from teacher_pay_rates) as rates`,
        );
      const [owner] = await as("owner", totals);
      expect(BigInt(owner.expenses ?? 0)).toBeGreaterThan(BigInt(0));
      expect(await as("manager", totals)).toEqual([{ expenses: null, salaries: null, rates: 0 }]);
    });
  });

  describe("Messages — owner: send, edit templates · manager: send a one-off message to a student", () => {
    const send = (s: Session, type: string) =>
      s.attempt(
        `insert into messages (student_id, channel, type, recipient, body)
         values ($1, 'telegram', $2::message_type, '500007919', 'Salom')`,
        [studentId(1), type],
      );
    const editTemplate = (s: Session) =>
      s.attempt(`update message_templates set body = body || ' !' where type = 'payment_due'`);
    const newTemplate = (s: Session) =>
      s.attempt(`insert into message_templates (type, channel, language, body) values ('custom', 'sms', 'uz', 'x')`);

    it("owner sends any message and edits templates", async () => {
      await as("owner", async (s) => {
        allowed(await send(s, "custom"));
        allowed(await send(s, "payment_overdue"));
        allowed(await editTemplate(s), 6);
      });
    });

    it("manager sends a one-off message, nothing else, and cannot edit templates", async () => {
      await as("manager", async (s) => {
        allowed(await send(s, "custom"));
        denied(await send(s, "payment_overdue"));
        expect(await s.count("message_templates")).toBeGreaterThanOrEqual(24);
        noEffect(await editTemplate(s));
        denied(await newTemplate(s));
        // Delivery status belongs to the server.
        denied(await s.attempt(`update messages set status = 'sent'`));
      });
    });
  });

  describe("Settings and users — owner: full · manager: own name and language only", () => {
    it("owner changes centre settings and another user's role and active flag", async () => {
      await as("owner", async (s) => {
        allowed(await s.attempt(`update centre_settings set billing_day = 3, due_day = 10`));
        allowed(await s.attempt(`update profiles set role = 'owner' where id = $1`, [MANAGER_ID]));
        allowed(await s.attempt(`update profiles set is_active = false where id = $1`, [MANAGER_ID]));
      });
    });

    it("manager reads settings but cannot change them", async () => {
      await as("manager", async (s) => {
        expect(await s.count("centre_settings")).toBe(1);
        noEffect(await s.attempt(`update centre_settings set billing_day = 3`));
      });
    });

    it("manager changes their own name and language", async () => {
      await as("manager", async (s) => {
        allowed(await s.attempt(`update profiles set full_name = 'Madina Y.', language = 'en' where id = auth.uid()`));
      });
    });

    it("manager cannot change their own role or active flag, or anyone else's profile", async () => {
      await as("manager", async (s) => {
        denied(await s.attempt(`update profiles set role = 'owner' where id = auth.uid()`));
        denied(await s.attempt(`update profiles set is_active = false where id = auth.uid()`));
        noEffect(await s.attempt(`update profiles set full_name = 'x' where id = $1`, [OWNER_ID]));
        denied(await s.attempt(`insert into profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'owner')`));
      });
    });
  });

  describe("Archive any record — owner: yes · manager: no", () => {
    const targets = [
      ["leads", leadId(2)],
      ["students", studentId(2)],
      ["groups", groupId(2)],
      ["teachers", teacherId(2)],
    ] as const;

    it.each(targets)("owner archives and restores %s", async (table, id) => {
      await as("owner", async (s) => {
        allowed(await s.attempt(`update ${table} set archived_at = now() where id = $1`, [id]));
        allowed(await s.attempt(`update ${table} set archived_at = null where id = $1`, [id]));
      });
    });

    it.each(targets)("manager cannot archive %s", async (table, id) => {
      const result = await as("manager", (s) =>
        s.attempt(`update ${table} set archived_at = now() where id = $1`, [id]),
      );
      // Teachers are read-only for a manager, so that update finds no row at all.
      if (table === "teachers") noEffect(result);
      else denied(result);
    });

    it("manager cannot restore a record or create one already archived", async () => {
      await as(
        "manager",
        async (s) => {
          denied(await s.attempt(`update leads set archived_at = null where id = $1`, [leadId(2)]));
          denied(
            await s.attempt(
              `insert into leads (full_name, phone, source, created_by, archived_at)
               values ('x', '+998900000004', 'other', auth.uid(), now())`,
            ),
          );
        },
        (a) => a.rows(`update leads set archived_at = now() where id = $1`, [leadId(2)]).then(() => {}),
      );
    });

    it.each(BOTH)("%s cannot delete any business record", async (who) => {
      await as(who, async (s) => {
        for (const table of [
          "leads", "lead_activities", "students", "enrollments", "groups", "lessons", "attendance",
          "teachers", "teacher_pay_rates", "charges", "payments", "expenses", "teacher_payouts",
          "messages", "message_templates", "profiles", "centre_settings",
        ]) {
          denied(await s.attempt(`delete from ${table}`));
        }
      });
    });
  });

  describe("Outside the table", () => {
    const tables = [
      "profiles", "centre_settings", "message_templates", "leads", "lead_activities", "teachers",
      "teacher_pay_rates", "students", "groups", "enrollments", "lessons", "attendance", "charges",
      "payments", "expenses", "teacher_payouts", "messages", "student_balances", "student_overview",
    ];

    it("every table has row level security switched on", async () => {
      const open = await admin((s) =>
        s.rows(
          `select relname from pg_class
           where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
        ),
      );
      expect(open).toEqual([]);
    });

    it("a visitor who is not signed in can read nothing", async () => {
      await as("anon", async (s) => {
        for (const table of tables) denied(await s.attempt(`select 1 from ${table} limit 1`));
      });
    });

    it("a deactivated manager is blocked everywhere", async () => {
      await as(
        "manager",
        async (s) => {
          for (const table of tables) expect(await s.count(table), table).toBe(0);
          denied(await newLead(s));
          denied(await newPayment(s));
          noEffect(await s.attempt(`update profiles set full_name = 'x' where id = auth.uid()`));
        },
        (a) => a.rows(`update profiles set is_active = false where id = $1`, [MANAGER_ID]).then(() => {}),
      );
    });

    it("a new auth user gets a profile: role from the invite, manager by default", async () => {
      await admin(async (s) => {
        const addUser = (email: string, appMeta: object, userMeta: object, invited: boolean) =>
          s.rows(
            `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, invited_at)
             values (gen_random_uuid(), 'authenticated', 'authenticated', $1, $2, $3, case when $4 then now() end)`,
            [email, JSON.stringify(appMeta), JSON.stringify(userMeta), invited],
          );
        await addUser("invited-owner@test.local", {}, { role: "owner", full_name: "Yangi Rahbar", language: "ru" }, true);
        await addUser("invited@test.local", {}, {}, true);
        await addUser("service@test.local", { role: "owner" }, {}, false);
        // Anyone can sign themselves up with any user metadata: it must not be trusted.
        await addUser("self-signup@test.local", {}, { role: "owner" }, false);

        expect(
          await s.rows(
            `select u.email, p.full_name, p.role, p.language, p.is_active
             from auth.users u join profiles p on p.id = u.id
             where u.email like '%@test.local' order by u.email`,
          ),
        ).toEqual([
          { email: "invited-owner@test.local", full_name: "Yangi Rahbar", role: "owner", language: "ru", is_active: true },
          { email: "invited@test.local", full_name: "invited", role: "manager", language: "uz", is_active: true },
          { email: "self-signup@test.local", full_name: "self-signup", role: "manager", language: "uz", is_active: false },
          { email: "service@test.local", full_name: "service", role: "owner", language: "uz", is_active: true },
        ]);
      });
    });
  });
});
