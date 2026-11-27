/**
 * Card payments and receipts — docs/STUDENT_APP_SPEC.md → "Rules → Receipts".
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const STUDENT = "00000000-0000-4000-8000-00000000c101";
const OTHER = "00000000-0000-4000-8000-00000000c102";
const APP_USER = "00000000-0000-4000-8000-00000000c103";
const HASH = (digit: string) => digit.repeat(64);
const today = "public.tashkent_today()";

async function actAs(s: Session, userId: string) {
  await s.rows(`reset role`);
  await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await s.rows(`set local role authenticated`);
}
const asDb = async <T>(s: Session, fn: () => Promise<T>): Promise<T> => {
  await s.rows(`reset role`);
  try {
    return await fn();
  } finally {
    await s.rows(`set local role authenticated`);
  }
};

/** Two students, each in one running group, with app accounts linked by phone; and an App user. */
let one = { student: "", group: "" };
let two = { student: "", group: "" };
const people = async (s: Session) => {
  const rows = await s.rows<{ student: string; grp: string }>(
    `select e.student_id as student, min(e.group_id::text) as grp from enrollments e join students st on st.id = e.student_id
     where e.status = 'active' and st.archived_at is null and st.status = 'active'
     group by e.student_id having count(distinct e.group_id) = 1 order by e.student_id limit 2`,
  );
  one = { student: rows[0].student, group: rows[0].grp };
  two = { student: rows[1].student, group: rows[1].grp };
  await s.rows(`update students set phone = '+998770007001' where id = $1`, [one.student]);
  await s.rows(`update students set phone = '+998770007002' where id = $1`, [two.student]);
  const user = `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), '{"full_name":"Receipt Sender","korean_level":"topik1"}')`;
  await s.rows(user, [STUDENT, "998770007001"]);
  await s.rows(user, [OTHER, "998770007002"]);
  await s.rows(user, [APP_USER, "998770007003"]);
};

type Draft = { profile?: string; group?: string | null; amount?: number; paidOn?: string; path?: string; type?: string; hash?: string; comment?: string | null };
/** The server's call, after it has checked the file. */
const submit = (s: Session, draft: Draft = {}) =>
  asDb(s, () =>
    s.attempt(`select public.submit_receipt($1, $2, $3, ${draft.paidOn ?? today}, $4, $5, $6, $7) as id`, [
      draft.profile ?? STUDENT,
      draft.group === undefined ? one.group : draft.group,
      draft.amount ?? 600_000,
      draft.path ?? `${one.student}/a.jpg`,
      draft.type ?? "jpg",
      draft.hash ?? HASH("a"),
      draft.comment ?? null,
    ]),
  );
const receiptId = async (s: Session, path: string) => (await asDb(s, () => s.rows<{ id: string }>(`select id from payment_receipts where file_path = $1`, [path])))[0].id;
const payments = (s: Session, student: string) => asDb(s, () => s.rows<Record<string, unknown>>(`select amount::int as amount, method, received_by, group_id from payments where student_id = $1 and created_at >= now() - interval '1 minute' order by created_at`, [student]));

describe.skipIf(!DB_URL)("Receipts", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("sending", () => {
    it("only the server writes a receipt: a student cannot call submit_receipt or insert a row", async () => {
      await as({ userId: STUDENT }, async (s) => {
        expect(code(await s.attempt(`select public.submit_receipt($1, $2, 600000, ${today}, $3, 'jpg', $4)`, [STUDENT, one.group, `${one.student}/a.jpg`, HASH("a")]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into payment_receipts (student_id, group_id, amount, paid_on, file_path, file_type, file_hash) values ($1, $2, 1, ${today}, 'x', 'jpg', $3)`, [one.student, one.group, HASH("a")]))).toBe(DENIED);
        expect(code(await submit(s, { comment: "  Dekabr uchun  " }))).toBe("allowed");
        const [row] = await asDb(s, () => s.rows(`select student_id, profile_id, group_id, amount::int as amount, file_type, comment, status from payment_receipts`));
        expect(row).toEqual({ student_id: one.student, profile_id: STUDENT, group_id: one.group, amount: 600_000, file_type: "jpg", comment: "Dekabr uchun", status: "pending" });
      }, people);
    });

    it("the group defaults to the student's only running one; what does not belong is refused", async () => {
      await as({ userId: STUDENT }, async (s) => {
        expect(code(await submit(s, { group: null }))).toBe("allowed");
        expect((await asDb(s, () => s.rows(`select group_id from payment_receipts`)))[0].group_id).toBe(one.group);
        const refuse = async (draft: Draft) => code(await submit(s, { path: `${one.student}/b.jpg`, ...draft }));
        // An App user has no receipts; another student's group; nothing, too much; tomorrow, long ago; the file.
        expect(await refuse({ profile: APP_USER })).toBe("ER001");
        expect(await refuse({ group: two.group === one.group ? "00000000-0000-4000-8000-000000000000" : two.group })).toBe("ER002");
        expect(await refuse({ amount: 0 })).toBe("ER003");
        expect(await refuse({ amount: 2_000_000_000 })).toBe("ER003");
        expect(await refuse({ paidOn: `${today} + 1` })).toBe("ER004");
        expect(await refuse({ paidOn: `${today} - 91` })).toBe("ER004");
        expect(await refuse({ type: "exe" })).toBe("ER005");
        expect(await refuse({ hash: "abc" })).toBe("ER005");
        expect(await refuse({ path: `${two.student}/b.jpg` })).toBe("ER005");
        // The same file path twice.
        expect(await refuse({ path: `${one.student}/a.jpg` })).toBe("ER005");
        expect((await asDb(s, () => s.rows(`select count(*)::int as n from payment_receipts`)))[0].n).toBe(1);
      }, people);
    });

    it("a student puts files in their own folder of the bucket only", async () => {
      await as({ userId: STUDENT }, async (s) => {
        const put = (name: string) => s.attempt(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [name]);
        expect(code(await put(`${one.student}/mine.jpg`))).toBe("allowed");
        expect(code(await put(`${two.student}/theirs.jpg`))).toBe(DENIED);
        expect((await s.rows(`select name from storage.objects where bucket_id = 'receipts'`)).map((row) => row.name)).toEqual([`${one.student}/mine.jpg`]);
        await actAs(s, OTHER);
        expect(await s.rows(`select name from storage.objects where bucket_id = 'receipts'`)).toEqual([]);
        await actAs(s, APP_USER);
        expect(code(await put(`${one.student}/again.jpg`))).toBe(DENIED);
        await actAs(s, MANAGER_ID);
        expect((await s.rows(`select name from storage.objects where bucket_id = 'receipts'`)).length).toBe(1);
      }, people);
    });
  });

  describe("who reads what", () => {
    it("a student reads only their own receipts; an App user and a teacher read none; staff read all", async () => {
      await as({ userId: STUDENT }, async (s) => {
        await submit(s);
        await submit(s, { profile: OTHER, group: two.group, path: `${two.student}/b.jpg`, hash: HASH("b") });
        const mine = async (who: string) => {
          await actAs(s, who);
          return (await s.rows<{ student_id: string }>(`select student_id from payment_receipts order by created_at`)).map((row) => row.student_id);
        };
        expect(await mine(STUDENT)).toEqual([one.student]);
        expect(await mine(OTHER)).toEqual([two.student]);
        expect(await mine(APP_USER)).toEqual([]);
        expect(await mine(TEACHER_USER_ID)).toEqual([]);
        expect((await mine(MANAGER_ID)).sort()).toEqual([one.student, two.student].sort());
        // A student cannot change one, or look at the review list.
        await actAs(s, STUDENT);
        expect(code(await s.attempt(`update payment_receipts set status = 'approved'`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.receipts_for_review()`))).toBe(DENIED);
      }, people);
    });

    it("Pay by card tells a student the card, the instructions and what they owe", async () => {
      await as({ userId: STUDENT }, async (s) => {
        await asDb(s, async () => {
          await s.rows(`update centre_settings set payment_card = '{"number":"8600123456789012","holder":"SEON TOPIK MCHJ","bank":"Kapitalbank"}', payment_instructions = '{"uz":"Chekni yuklang","en":"Upload the receipt"}'`);
          await s.rows(`insert into charges (student_id, billing_month, type, base_amount, amount, note) values ($1, date_trunc('month', ${today})::date, 'adjustment', 0, 10000000, 'Test debt')`, [one.student]);
        });
        const info = (await s.rows<{ r: { card: Record<string, string>; instructions: Record<string, string>; amount_due: number; submit_url: string | null } }>(`select public.pay_by_card_info() as r`))[0].r;
        expect(info.card).toEqual({ number: "8600123456789012", holder: "SEON TOPIK MCHJ", bank: "Kapitalbank" });
        expect(info.instructions).toEqual({ uz: "Chekni yuklang", en: "Upload the receipt" });
        expect(info.amount_due).toBeGreaterThanOrEqual(400_000);
        const before = info.amount_due;
        // An approved receipt is a payment: the amount due goes down by exactly that.
        await submit(s, { amount: 400_000 });
        await actAs(s, MANAGER_ID);
        await s.rows(`select public.review_receipt($1, 'approve')`, [await receiptId(s, `${one.student}/a.jpg`)]);
        await actAs(s, STUDENT);
        expect((await s.rows<{ due: number }>(`select (public.pay_by_card_info() ->> 'amount_due')::int as due`))[0].due).toBe(before - 400_000);
        await actAs(s, APP_USER);
        expect(code(await s.attempt(`select public.pay_by_card_info()`))).toBe(DENIED);
      }, people);
    });
  });

  describe("duplicates", () => {
    it("the same file from anyone, or the same amount and date from the same student, is flagged; a rejected receipt is not counted", async () => {
      await as("manager", async (s) => {
        await submit(s);
        const flags = async () => {
          await actAs(s, MANAGER_ID);
          return Object.fromEntries((await s.rows<{ file_path: string; same_file: boolean; same_amount_date: boolean }>(`select file_path, same_file, same_amount_date from public.receipts_for_review('pending')`)).map((row) => [row.file_path.split("/")[1], [row.same_file, row.same_amount_date]]));
        };
        expect(await flags()).toEqual({ "a.jpg": [false, false] });
        // The same file sent by another student; the same amount and day again from the first.
        await submit(s, { profile: OTHER, group: two.group, path: `${two.student}/same-file.jpg`, hash: HASH("a"), amount: 123_000 });
        await submit(s, { path: `${one.student}/same-day.png`, type: "png", hash: HASH("c") });
        await submit(s, { path: `${one.student}/other.pdf`, type: "pdf", hash: HASH("d"), amount: 50_000, paidOn: `${today} - 1` });
        expect(await flags()).toEqual({ "a.jpg": [true, true], "same-file.jpg": [true, false], "same-day.png": [false, true], "other.pdf": [false, false] });
        // The first is rejected: the others no longer look like duplicates of it.
        await s.rows(`select public.review_receipt($1, 'reject', 'Chek oʻqilmaydi')`, [await receiptId(s, `${one.student}/a.jpg`)]);
        expect(await flags()).toEqual({ "same-file.jpg": [false, false], "same-day.png": [false, false], "other.pdf": [false, false] });
      }, people);
    });
  });

  describe("review", () => {
    it("approving records exactly one payment by transfer, linked to the receipt; a second review is refused", async () => {
      await as("manager", async (s) => {
        await submit(s, { paidOn: `${today} - 2` });
        const id = await receiptId(s, `${one.student}/a.jpg`);
        const [{ payment }] = await s.rows<{ payment: string }>(`select public.review_receipt($1, 'approve') as payment`, [id]);
        expect(await payments(s, one.student)).toEqual([{ amount: 600_000, method: "transfer", received_by: MANAGER_ID, group_id: one.group }]);
        const [row] = await s.rows(`select status, payment_id, reviewed_by, reviewed_at is not null as reviewed, (select (paid_at at time zone 'Asia/Tashkent')::date = ${today} - 2 from payments where id = payment_id) as on_the_day from payment_receipts where id = $1`, [id]);
        expect(row).toEqual({ status: "approved", payment_id: payment, reviewed_by: MANAGER_ID, reviewed: true, on_the_day: true });
        // Again, by the owner at the same moment or later: nothing more is recorded.
        await actAs(s, OWNER_ID);
        expect(code(await s.attempt(`select public.review_receipt($1, 'approve')`, [id]))).toBe("ER006");
        expect(code(await s.attempt(`select public.review_receipt($1, 'reject', 'Kech')`, [id]))).toBe("ER006");
        expect((await payments(s, one.student)).length).toBe(1);
        expect((await s.rows(`select count(*)::int as n from public.receipts_for_review('approved') where receipt_no is not null`))[0].n).toBe(1);
      }, people);
    });

    it("Take payment may correct the amount, the group's note and the time before it is saved", async () => {
      await as("owner", async (s) => {
        await submit(s);
        const id = await receiptId(s, `${one.student}/a.jpg`);
        await s.rows(`select public.review_receipt($1, 'approve', null, $2, 550000, now() - interval '1 hour', 'Chek boʻyicha')`, [id, one.group]);
        expect((await asDb(s, () => s.rows(`select amount::int as amount, note from payments where id = (select payment_id from payment_receipts where id = $1)`, [id])))[0]).toEqual({ amount: 550_000, note: "Chek boʻyicha" });
        // A group that is not the student's, a payment in the future, nothing at all.
        await submit(s, { path: `${one.student}/b.jpg`, hash: HASH("b") });
        const next = await receiptId(s, `${one.student}/b.jpg`);
        await actAs(s, OWNER_ID);
        expect(code(await s.attempt(`select public.review_receipt($1, 'approve', null, gen_random_uuid())`, [next]))).toBe("ER002");
        expect(code(await s.attempt(`select public.review_receipt($1, 'approve', null, null, 0)`, [next]))).toBe("ER003");
        expect(code(await s.attempt(`select public.review_receipt($1, 'approve', null, null, null, now() + interval '1 day')`, [next]))).toBe("ER004");
        expect(code(await s.attempt(`select public.review_receipt($1, 'archive')`, [next]))).toBe("22023");
        expect((await asDb(s, () => s.rows(`select status from payment_receipts where id = $1`, [next])))[0].status).toBe("pending");
      }, people);
    });

    it("rejecting needs a reason and records no payment; teachers and students cannot review", async () => {
      await as("manager", async (s) => {
        await submit(s);
        const id = await receiptId(s, `${one.student}/a.jpg`);
        expect(code(await s.attempt(`select public.review_receipt($1, 'reject', '   ')`, [id]))).toBe("ER007");
        for (const who of [TEACHER_USER_ID, STUDENT, APP_USER]) {
          await actAs(s, who);
          expect(code(await s.attempt(`select public.review_receipt($1, 'approve')`, [id]))).toBe(DENIED);
        }
        await actAs(s, MANAGER_ID);
        expect(code(await s.attempt(`select public.review_receipt(gen_random_uuid(), 'approve')`))).toBe("P0002");
        await s.rows(`select public.review_receipt($1, 'reject', ' Summa toʻliq emas ')`, [id]);
        expect((await s.rows(`select status, reject_reason, payment_id, reviewed_by from payment_receipts where id = $1`, [id]))[0]).toEqual({ status: "rejected", reject_reason: "Summa toʻliq emas", payment_id: null, reviewed_by: MANAGER_ID });
        expect(await payments(s, one.student)).toEqual([]);
        // The student sees why.
        await actAs(s, STUDENT);
        expect((await s.rows(`select status, reject_reason from payment_receipts`))[0]).toEqual({ status: "rejected", reject_reason: "Summa toʻliq emas" });
      }, people);
    });

    it("deleting the account keeps the receipt and its payment with the student", async () => {
      await as("manager", async (s) => {
        await submit(s);
        const id = await receiptId(s, `${one.student}/a.jpg`);
        await s.rows(`select public.review_receipt($1, 'approve')`, [id]);
        await actAs(s, STUDENT);
        await s.rows(`select public.delete_my_account()`);
        expect((await asDb(s, () => s.rows(`select profile_id, student_id, status from payment_receipts where id = $1`, [id])))[0]).toEqual({ profile_id: null, student_id: one.student, status: "approved" });
      }, people);
    });
  });
});
