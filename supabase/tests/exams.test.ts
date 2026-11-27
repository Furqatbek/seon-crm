/**
 * Mock exams — docs/STUDENT_APP_SPEC.md → "Rules → Mock exams" and "Rules →
 * Coins". The builder's rules and the engine. Time is moved by shifting what
 * the database wrote into the past. Everything is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);

const U = (n: number) => `00000010-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A linked student, an App user and a kiosk. */
const [STUDENT, APP_USER, KIOSK] = [1, 2, 3].map(U);

let student = "";
let exam = "";
/** Listening: l1 and l2 share a recording, l3 has its own. Reading: r1, r2. The right answer of every question is "a". */
const q: Record<"l1" | "l2" | "l3" | "r1" | "r2", string> = { l1: "", l2: "", l3: "", r1: "", r2: "" };

type State = {
  attempt_id: string;
  status: string;
  current_section: string | null;
  deadline: string | null;
  server_now: string;
  passages: Array<{ id: string; kind: string; plays_left: number | null; audio_path: string | null }> | null;
  questions: Array<{ id: string; position: number; your_option: string | null; flagged: boolean; options: Array<{ id: string }> }> | null;
  result: null | {
    correct_listening: number; correct_reading: number; correct: number; questions: number; coins: number; coins_locked: boolean;
    first_attempt: boolean; estimated_level: number | null; review: Array<Record<string, unknown>>;
  };
};

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
async function call<T>(s: Session, user: string, sql: string, params: unknown[] = []): Promise<T> {
  await actAs(s, user);
  return (await s.rows<{ r: T }>(`select ${sql} as r`, params))[0].r;
}
async function refused(s: Session, user: string, sql: string, params: unknown[] = []): Promise<string> {
  await actAs(s, user);
  return code(await s.attempt(`select ${sql}`, params));
}
/** Seconds pass for every attempt in progress. */
const pass = (s: Session, seconds: number) =>
  asDb(s, () =>
    s.rows(
      `update exam_attempts set started_at = started_at - $1 * interval '1 second',
         section_deadlines = jsonb_build_object(
           'listening', (section_deadlines ->> 'listening')::timestamptz - $1 * interval '1 second',
           'reading', (section_deadlines ->> 'reading')::timestamptz - $1 * interval '1 second')
       where status = 'in_progress'`,
      [seconds],
    ),
  );
const start = (s: Session, user: string, id = exam) => call<string>(s, user, `public.start_exam($1)`, [id]);
const state = (s: Session, user: string, attempt: string) => call<State>(s, user, `public.exam_state($1)`, [attempt]);
const answer = (s: Session, user: string, attempt: string, question: string, option: string | null, flagged: boolean | null = null) =>
  call<{ saved: boolean; reason: string | null; status: string; current_section: string | null }>(s, user, `public.answer_exam($1, $2, $3, $4)`, [attempt, question, option, flagged]);
const play = (s: Session, user: string, attempt: string, question: string) =>
  call<{ allowed: boolean; reason: string | null; plays_left: number }>(s, user, `public.record_audio_play($1, $2)`, [attempt, question]);
const secondsTo = (view: State) => Math.round((Date.parse(view.deadline!) - Date.parse(view.server_now)) / 1000);
const examCoins = (s: Session, id: string) =>
  asDb(s, async () => (await s.rows<{ n: number }>(`select coalesce(sum(delta), 0)::int as n from points_ledger where student_id = $1 and source = 'exam'`, [id]))[0].n);

const OPTIONS = `'[{"id":"a","text":"Right"},{"id":"b","text":"Wrong"},{"id":"c","text":"Also wrong"}]'`;

/** An exam of 3 listening questions (10 minutes) and 2 reading questions (15 minutes), written as the database owner. */
async function writeExam(s: Session, title: string): Promise<{ id: string; listening: string; reading: string }> {
  const id = (await s.rows<{ id: string }>(`insert into exams (title, level, audio_max_plays, level_thresholds) values ($1, 'topik1', 1, '[{"level":1,"min_correct":2},{"level":2,"min_correct":4}]') returning id`, [title]))[0].id;
  const listening = (await s.rows<{ id: string }>(`insert into exam_sections (exam_id, kind, position, time_limit_sec, question_count) values ($1, 'listening', 1, 600, 3) returning id`, [id]))[0].id;
  const reading = (await s.rows<{ id: string }>(`insert into exam_sections (exam_id, kind, position, time_limit_sec, question_count) values ($1, 'reading', 2, 900, 2) returning id`, [id]))[0].id;
  return { id, listening, reading };
}

const setup = async (s: Session) => {
  student = (await s.rows<{ id: string }>(`select s.id from students s where s.archived_at is null order by s.id limit 1`))[0].id;
  await s.rows(`update students set phone = '+998770004001' where id = $1`, [student]);
  const user = `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), '{"full_name":"Exam Player","korean_level":"topik1"}')`;
  await s.rows(user, [STUDENT, "998770004001"]);
  await s.rows(user, [APP_USER, "998770004002"]);
  await s.rows(`insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', 'kiosk-exam@test.local', '{"role":"kiosk"}', '{"full_name":"Tablet"}')`, [KIOSK]);
  await s.rows(`update points_settings set enabled = true, exam_coins_per_correct = 1`);

  const made = await writeExam(s, "TOPIK I practice 1");
  exam = made.id;
  const shared = (await s.rows<{ id: string }>(`insert into exam_passages (exam_id, section_id, kind, audio_path, position) values ($1, $2, 'audio', $3, 1) returning id`, [exam, made.listening, `${exam}/one.mp3`]))[0].id;
  const own = (await s.rows<{ id: string }>(`insert into exam_passages (exam_id, section_id, kind, audio_path, position) values ($1, $2, 'audio', $3, 2) returning id`, [exam, made.listening, `${exam}/two.mp3`]))[0].id;
  const text = (await s.rows<{ id: string }>(`insert into exam_passages (exam_id, section_id, kind, text, position) values ($1, $2, 'text', 'A short text.', 1) returning id`, [exam, made.reading]))[0].id;
  const add = async (section: string, passage: string, position: number) =>
    (await s.rows<{ id: string }>(`insert into exam_questions (section_id, passage_id, position, prompt, options, correct_option_id, explanation) values ($1, $2, $3, $4, ${OPTIONS}, 'a', 'Because.') returning id`, [section, passage, position, `Question ${position}`]))[0].id;
  q.l1 = await add(made.listening, shared, 1);
  q.l2 = await add(made.listening, shared, 2);
  q.l3 = await add(made.listening, own, 3);
  q.r1 = await add(made.reading, text, 1);
  q.r2 = await add(made.reading, text, 2);
  await s.rows(`update exams set status = 'published', published_at = now() where id = $1`, [exam]);
};

const exams = <T>(fn: (s: Session) => Promise<T>) => as({ userId: STUDENT }, fn, setup);

/** A whole attempt: the listed questions answered right, the others wrong, then handed in. */
async function sit(s: Session, user: string, right: Array<keyof typeof q>, id = exam): Promise<State> {
  const attempt = await start(s, user, id);
  for (const key of ["l1", "l2", "l3"] as const) await answer(s, user, attempt, q[key], right.includes(key) ? "a" : "b");
  await call(s, user, `public.submit_section($1)`, [attempt]);
  for (const key of ["r1", "r2"] as const) await answer(s, user, attempt, q[key], right.includes(key) ? "a" : "b");
  return call<State>(s, user, `public.submit_section($1)`, [attempt]);
}

describe.skipIf(!DB_URL)("Mock exams", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("building and publishing", () => {
    it("a teacher builds a draft; only the owner and managers publish, once it is complete", async () => {
      await as({ userId: TEACHER_USER_ID }, async (s) => {
        const made = (await s.rows<{ id: string; status: string; created_by: string }>(
          `insert into exams (title, level, status, published_at, created_by) values ('Draft', 'topik2', 'published', now(), $1) returning id, status, created_by`, [OWNER_ID],
        ))[0];
        // Whatever is sent, a new exam is the author's own draft.
        expect(made).toMatchObject({ status: "draft", created_by: TEACHER_USER_ID });
        const listening = (await s.rows<{ id: string }>(`insert into exam_sections (exam_id, kind, position, time_limit_sec, question_count) values ($1, 'listening', 1, 1800, 1) returning id`, [made.id]))[0].id;
        const reading = (await s.rows<{ id: string }>(`insert into exam_sections (exam_id, kind, position, time_limit_sec, question_count) values ($1, 'reading', 2, 2400, 1) returning id`, [made.id]))[0].id;
        const audio = (await s.rows<{ id: string }>(`insert into exam_passages (exam_id, section_id, kind, position) values ($1, $2, 'audio', 1) returning id`, [made.id, listening]))[0].id;
        await s.rows(`insert into exam_questions (section_id, passage_id, position, prompt, options, correct_option_id) values ($1, $2, 1, 'L', ${OPTIONS}, 'a')`, [listening, audio]);

        // Not theirs to publish, by the function or by hand.
        expect(code(await s.attempt(`select public.publish_exam($1)`, [made.id]))).toBe(DENIED);
        expect(code(await s.attempt(`update exams set status = 'published' where id = $1`, [made.id]))).toBe(DENIED);
        expect(code(await s.attempt(`update exams set archived_at = now() where id = $1`, [made.id]))).toBe(DENIED);

        // Reading has none of its questions yet; then the recording is missing.
        expect(await refused(s, MANAGER_ID, `public.publish_exam($1)`, [made.id])).toBe("EX001");
        await actAs(s, TEACHER_USER_ID);
        await s.rows(`insert into exam_questions (section_id, position, prompt, options, correct_option_id) values ($1, 1, 'R', ${OPTIONS}, 'b')`, [reading]);
        expect(await refused(s, MANAGER_ID, `public.publish_exam($1)`, [made.id])).toBe("EX002");
        await actAs(s, TEACHER_USER_ID);
        await s.rows(`update exam_passages set audio_path = $1 where id = $2`, [`${made.id}/a.mp3`, audio]);
        // One question too many is not complete either.
        await s.rows(`insert into exam_questions (section_id, position, prompt, options, correct_option_id) values ($1, 2, 'R2', ${OPTIONS}, 'b')`, [reading]);
        expect(await refused(s, MANAGER_ID, `public.publish_exam($1)`, [made.id])).toBe("EX001");
        await actAs(s, TEACHER_USER_ID);
        await s.rows(`delete from exam_questions where prompt = 'R2'`);

        await call(s, MANAGER_ID, `public.publish_exam($1)`, [made.id]);
        expect(await s.rows(`select status, published_by from exams where id = $1`, [made.id])).toEqual([{ status: "published", published_by: MANAGER_ID }]);

        // Published: nothing about it changes until it is a draft again.
        await actAs(s, TEACHER_USER_ID);
        expect(code(await s.attempt(`update exams set title = 'Changed' where id = $1`, [made.id]))).toBe(DENIED);
        expect(code(await s.attempt(`update exam_questions set correct_option_id = 'c' where section_id = $1`, [listening]))).toBe(DENIED);
        expect(code(await s.attempt(`delete from exam_questions where section_id = $1`, [listening]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into exam_passages (exam_id, section_id, kind, text, position) values ($1, $2, 'text', 'T', 9)`, [made.id, reading]))).toBe(DENIED);
        expect(code(await s.attempt(`update exam_sections set question_count = 9 where exam_id = $1`, [made.id]))).toBe(DENIED);
        expect(code(await s.attempt(`select public.unpublish_exam($1)`, [made.id]))).toBe(DENIED);
        await call(s, OWNER_ID, `public.unpublish_exam($1)`, [made.id]);
        await actAs(s, TEACHER_USER_ID);
        expect(code(await s.attempt(`update exams set title = 'Changed' where id = $1`, [made.id]))).toBe("allowed");
        // Archiving is the owner's.
        await actAs(s, MANAGER_ID);
        expect(code(await s.attempt(`update exams set archived_at = now() where id = $1`, [made.id]))).toBe(DENIED);
        await actAs(s, OWNER_ID);
        expect(code(await s.attempt(`update exams set archived_at = now() where id = $1`, [made.id]))).toBe("allowed");
      }, setup);
    });

    it("a question needs two to four choices of text or a picture, and its right answer among them", async () => {
      await as("manager", async (s) => {
        const made = await asDb(s, () => writeExam(s, "Shapes"));
        const insert = (options: string, right: string) => s.attempt(`insert into exam_questions (section_id, position, prompt, options, correct_option_id) values ($1, 1, 'P', $2, $3)`, [made.reading, options, right]);
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"b","image_path":"x/b.png"}]`, "b"))).toBe("allowed");
        expect(code(await insert(`[{"id":"a","text":"One"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"1"},{"id":"b","text":"2"},{"id":"c","text":"3"},{"id":"d","text":"4"},{"id":"e","text":"5"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"b"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"a","text":"Two"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"b","text":"Two"}]`, "z"))).toBe("23514");
        expect(code(await insert(`"text"`, "a"))).toBe("23514");
        // A passage of the other section cannot be its passage.
        const passage = (await s.rows<{ id: string }>(`insert into exam_passages (exam_id, section_id, kind, text, position) values ($1, $2, 'text', 'T', 1) returning id`, [made.id, made.listening]))[0].id;
        expect(code(await s.attempt(`insert into exam_questions (section_id, passage_id, position, prompt, options, correct_option_id) values ($1, $2, 2, 'P', ${OPTIONS}, 'a')`, [made.reading, passage]))).toBe("23514");
      }, setup);
    });

    it("players and a kiosk read nothing of the exams, the attempts or the answers", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        for (const user of [STUDENT, APP_USER, KIOSK]) {
          await actAs(s, user);
          for (const table of ["exams", "exam_sections", "exam_passages", "exam_questions", "exam_attempts"]) {
            const read = await s.attempt(`select * from ${table}`);
            expect(read.ok ? read.rowCount : 0, `${user} ${table}`).toBe(0);
          }
          expect(code(await s.attempt(`select * from exam_answers`)), user).toBe(DENIED);
          expect(code(await s.attempt(`insert into exam_answers (attempt_id, question_id, option_id) values ($1, $2, 'a')`, [attempt, q.l1])), user).toBe(DENIED);
          expect(code(await s.attempt(`update exam_attempts set correct_reading = 99`)), user).toBe(DENIED);
          for (const internal of [`public.exam_finish('${attempt}', 'submitted')`, `public.exam_sync('${attempt}')`, `public.exam_my_attempt('${attempt}')`, `public.publish_exam('${exam}')`, `public.exam_stats()`]) {
            expect(code(await s.attempt(`select ${internal}`)), `${user} ${internal}`).toBe(DENIED);
          }
        }
        // The engine is for students and App users: not a kiosk, and not staff.
        for (const user of [KIOSK, MANAGER_ID, TEACHER_USER_ID]) {
          expect(await refused(s, user, `public.start_exam($1)`, [exam]), user).toBe(DENIED);
          expect(await refused(s, user, `public.exam_list()`), user).toBe(DENIED);
          expect(await refused(s, user, `public.exam_state($1)`, [attempt]), user).toBe(DENIED);
        }
        // Somebody else's attempt is closed to another player.
        for (const fn of [`public.exam_state($1)`, `public.answer_exam($1, '${q.l1}', 'a')`, `public.record_audio_play($1, '${q.l1}')`, `public.submit_section($1)`, `public.finish_exam($1)`]) {
          expect(await refused(s, APP_USER, fn, [attempt]), fn).toBe(DENIED);
        }
      });
    });
  });

  describe("an attempt", () => {
    it("starts with listening and shows its questions without any answer", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        // Starting again is the same attempt.
        expect(await start(s, STUDENT)).toBe(attempt);
        const view = await state(s, STUDENT, attempt);
        expect(view).toMatchObject({ status: "in_progress", current_section: "listening", result: null });
        expect(secondsTo(view)).toBe(600);
        expect(view.questions?.map((question) => question.id)).toEqual([q.l1, q.l2, q.l3]);
        expect(view.questions?.[0]).toEqual({ id: q.l1, position: 1, passage_id: expect.any(String), prompt: "Question 1", options: expect.any(Array), your_option: null, flagged: false });
        expect(view.questions?.[0].options).toEqual([{ id: "a", text: "Right", image_path: null }, { id: "b", text: "Wrong", image_path: null }, { id: "c", text: "Also wrong", image_path: null }]);
        expect(view.passages).toHaveLength(2);
        expect(view.passages?.[0]).toMatchObject({ kind: "audio", plays_left: 1 });
        // Nothing of the reading section, and nothing that says which choice is right.
        expect(JSON.stringify(view)).not.toMatch(/correct|explanation|Because|A short text/);
        expect(JSON.stringify(await answer(s, STUDENT, attempt, q.l1, "a"))).not.toMatch(/correct|explanation/);
        expect(JSON.stringify(await play(s, STUDENT, attempt, q.l1))).not.toMatch(/correct|explanation/);
        expect(JSON.stringify(await call(s, STUDENT, `public.exam_list()`))).not.toMatch(/correct_option|explanation/);
      });
    });

    it("an answer can be chosen, changed, cleared and flagged, in the open section only", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        expect(await answer(s, STUDENT, attempt, q.l1, "b")).toEqual({ saved: true, reason: null, status: "in_progress", current_section: "listening" });
        expect(await answer(s, STUDENT, attempt, q.l1, "a")).toMatchObject({ saved: true });
        expect(await answer(s, STUDENT, attempt, q.l2, null, true)).toMatchObject({ saved: true });
        // A flag set earlier stays when only the answer changes.
        expect(await answer(s, STUDENT, attempt, q.l2, "c")).toMatchObject({ saved: true });
        expect(await answer(s, STUDENT, attempt, q.l3, "c")).toMatchObject({ saved: true });
        expect(await answer(s, STUDENT, attempt, q.l3, null)).toMatchObject({ saved: true });
        const view = await state(s, STUDENT, attempt);
        expect(view.questions?.map((question) => [question.your_option, question.flagged])).toEqual([["a", false], ["c", true], [null, false]]);
        // What a recording says is not sent while it is being listened to.
        await asDb(s, () => s.rows(`alter table exam_passages disable trigger user; update exam_passages set text = 'What is said.' where kind = 'audio'; alter table exam_passages enable trigger user`));
        expect(JSON.stringify(await state(s, STUDENT, attempt))).not.toContain("What is said.");
        // Not a choice of this question; a reading question while listening is open; a question of no exam.
        expect(await answer(s, STUDENT, attempt, q.l1, "z")).toMatchObject({ saved: false, reason: "invalid" });
        expect(await answer(s, STUDENT, attempt, q.r1, "a")).toMatchObject({ saved: false, reason: "closed" });
        expect(await answer(s, STUDENT, attempt, "00000000-0000-4000-8000-000000000000", "a")).toMatchObject({ saved: false, reason: "closed" });
      });
    });

    it("an exam that is a draft, archived or unknown cannot be started", async () => {
      await exams(async (s) => {
        expect(await refused(s, STUDENT, `public.start_exam('00000000-0000-4000-8000-000000000000')`)).toBe("EX003");
        await asDb(s, () => s.rows(`update exams set status = 'draft' where id = $1`, [exam]));
        expect(await refused(s, STUDENT, `public.start_exam($1)`, [exam])).toBe("EX003");
        expect(await call(s, STUDENT, `public.exam_list()`)).toEqual([]);
        await asDb(s, () => s.rows(`update exams set status = 'published', archived_at = now() where id = $1`, [exam]));
        expect(await refused(s, STUDENT, `public.start_exam($1)`, [exam])).toBe("EX003");
      });
    });
  });

  describe("fixes after review", () => {
    it("an exam stays published while someone is taking it; attempts out of time are closed first", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        expect(await refused(s, OWNER_ID, `public.unpublish_exam($1)`, [exam])).toBe("EX004");
        // Both sections' time has run out, and the player never came back.
        await pass(s, 1501);
        await call(s, OWNER_ID, `public.unpublish_exam($1)`, [exam]);
        const view = await state(s, STUDENT, attempt);
        expect(view.status).toBe("expired");
      });
    });

    it("a question that was answered cannot be removed; its number is its place in the section", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        await answer(s, STUDENT, attempt, q.l1, "a");
        await call(s, STUDENT, `public.finish_exam($1)`, [attempt]);
        await call(s, OWNER_ID, `public.unpublish_exam($1)`, [exam]);
        await actAs(s, TEACHER_USER_ID);
        expect(code(await s.attempt(`delete from exam_questions where id = $1`, [q.l1]))).toBe("23503");
        // Nobody answered the second: it goes, and the third is now number 2.
        expect(code(await s.attempt(`delete from exam_questions where id = $1`, [q.l2]))).toBe("allowed");
        await s.rows(`update exam_sections set question_count = 2 where exam_id = $1 and kind = 'listening'`, [exam]);
        await call(s, OWNER_ID, `public.publish_exam($1)`, [exam]);
        const again = await start(s, STUDENT);
        expect((await state(s, STUDENT, again)).questions?.map((question) => [question.id, question.position])).toEqual([[q.l1, 1], [q.l3, 2]]);
      });
    });

    it("an import is saved whole or not at all; the settings and both sections are saved together", async () => {
      await as({ userId: TEACHER_USER_ID }, async (s) => {
        await s.rows(`reset role`);
        const made = await writeExam(s, "Import");
        await actAs(s, TEACHER_USER_ID);
        const passages = JSON.stringify([{ key: "p1", section: "listening", kind: "audio", text: null, audio_path: `${made.id}/a.mp3` }, { key: "p2", section: "reading", kind: "text", text: "T", audio_path: null }]);
        const row = (section: string, passage: string | null, correct: string) => ({ section, passage, prompt: "P", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct_option_id: correct, explanation: null });
        // The last row's right answer is not one of its choices: nothing is added.
        expect(code(await s.attempt(`select public.import_exam($1, $2, $3)`, [made.id, passages, JSON.stringify([row("listening", "p1", "a"), row("reading", "p2", "z")])]))).toBe("23514");
        expect((await s.rows<{ n: number }>(`select count(*)::int as n from exam_passages where exam_id = $1`, [made.id]))[0].n).toBe(0);
        expect((await s.rows<{ r: number }>(`select public.import_exam($1, $2, $3) as r`, [made.id, passages, JSON.stringify([row("listening", "p1", "a"), row("listening", "p1", "b"), row("reading", "p2", "a"), row("reading", null, "a")])]))[0].r).toBe(4);
        expect(await s.rows(`select s.kind, q.position, q.passage_id is not null as linked from exam_questions q join exam_sections s on s.id = q.section_id where s.exam_id = $1 order by s.position, q.position`, [made.id])).toEqual([
          { kind: "listening", position: 1, linked: true }, { kind: "listening", position: 2, linked: true }, { kind: "reading", position: 1, linked: true }, { kind: "reading", position: 2, linked: false },
        ]);

        // A section's minutes out of range: the title stays as it was.
        expect(code(await s.attempt(`select public.save_exam_settings($1, 'New', 'topik1', 2, null, null, 30, 2400, 40, 5)`, [made.id]))).toBe("23514");
        expect((await s.rows<{ title: string }>(`select title from exams where id = $1`, [made.id]))[0].title).toBe("Import");
        await s.rows(`select public.save_exam_settings($1, 'New', 'topik1', 2, 3, null, 30, 2400, 40, 3600)`, [made.id]);
        expect(await s.rows(`select e.title, e.audio_max_plays, e.coins_per_correct, s.kind, s.question_count, s.time_limit_sec from exams e join exam_sections s on s.exam_id = e.id where e.id = $1 order by s.position`, [made.id])).toEqual([
          { title: "New", audio_max_plays: 2, coins_per_correct: 3, kind: "listening", question_count: 30, time_limit_sec: 2400 },
          { title: "New", audio_max_plays: 2, coins_per_correct: 3, kind: "reading", question_count: 40, time_limit_sec: 3600 },
        ]);
        // Players have no part in either.
        await actAs(s, STUDENT);
        expect(code(await s.attempt(`select public.save_exam_settings($1, 'X', 'topik1', 1, null, null, 30, 2400, 40, 3600)`, [made.id]))).toBe("P0002");
        expect(code(await s.attempt(`select public.import_exam($1, '[]', '[]')`, [made.id]))).toBe("P0002");
      }, setup);
    });
  });

  describe("deadlines", () => {
    it("at listening's deadline reading is already running; listening can no longer be answered", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        await answer(s, STUDENT, attempt, q.l1, "a");
        await pass(s, 599);
        expect(await answer(s, STUDENT, attempt, q.l2, "a")).toMatchObject({ saved: true, current_section: "listening" });
        // The player was away for a while. Ten minutes and half a minute after the start:
        await pass(s, 31);
        const late = await answer(s, STUDENT, attempt, q.l3, "a");
        expect(late).toEqual({ saved: false, reason: "closed", status: "in_progress", current_section: "reading" });
        const view = await state(s, STUDENT, attempt);
        expect(view.current_section).toBe("reading");
        expect(view.questions?.map((question) => question.id)).toEqual([q.r1, q.r2]);
        // Reading began when listening ended, not when the player came back: 15 minutes less the 30 seconds.
        expect(secondsTo(view)).toBe(870);
        expect(await play(s, STUDENT, attempt, q.l3)).toMatchObject({ allowed: false, reason: "closed" });
      });
    });

    it("any call after reading's deadline ends the attempt and scores what was answered", async () => {
      for (const after of [`public.exam_state($1)`, `public.answer_exam($1, '__r2__', 'a')`, `public.submit_section($1)`, `public.finish_exam($1)`, `public.record_audio_play($1, '__r2__')`]) {
        await exams(async (s) => {
          const attempt = await start(s, STUDENT);
          await answer(s, STUDENT, attempt, q.l1, "a");
          await pass(s, 600);
          await answer(s, STUDENT, attempt, q.r1, "a");
          await pass(s, 901);
          await call(s, STUDENT, after.replace("__r2__", q.r2), [attempt]);
          const view = await state(s, STUDENT, attempt);
          expect(view, after).toMatchObject({ status: "expired", current_section: null, deadline: null, questions: null });
          // What was answered in time counts; the answer sent after the deadline does not.
          expect(view.result, after).toMatchObject({ correct_listening: 1, correct_reading: 1, correct: 2, questions: 5, coins: 2 });
          expect(await examCoins(s, student)).toBe(2);
        });
      }
    });

    it("an attempt left alone for a day is closed by the next look at it, and a new one can be started", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        await pass(s, 86400);
        const next = await start(s, STUDENT);
        expect(next).not.toBe(attempt);
        expect(await state(s, STUDENT, attempt)).toMatchObject({ status: "expired", result: { correct: 0, coins: 0, first_attempt: true } });
        // The first attempt was completed, with nothing: the second is not the first.
        expect((await state(s, STUDENT, next)).status).toBe("in_progress");
        expect(await asDb(s, () => s.rows(`select first_attempt from exam_attempts where id = $1`, [next]))).toEqual([{ first_attempt: false }]);
      });
    });

    it("handing listening in early starts reading at once, with its full time", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        await pass(s, 120);
        const reading = await call<State>(s, STUDENT, `public.submit_section($1)`, [attempt]);
        expect(reading).toMatchObject({ status: "in_progress", current_section: "reading" });
        expect(secondsTo(reading)).toBe(900);
        expect(await answer(s, STUDENT, attempt, q.l1, "a")).toMatchObject({ saved: false, reason: "closed" });
        await pass(s, 899);
        expect(await answer(s, STUDENT, attempt, q.r1, "a")).toMatchObject({ saved: true });
        const done = await call<State>(s, STUDENT, `public.submit_section($1)`, [attempt]);
        expect(done).toMatchObject({ status: "submitted", result: { correct_listening: 0, correct_reading: 1 } });
        // Over is over.
        expect(await answer(s, STUDENT, attempt, q.r2, "a")).toMatchObject({ saved: false, reason: "over", status: "submitted" });
        expect(await play(s, STUDENT, attempt, q.l1)).toMatchObject({ allowed: false, reason: "over" });
        expect((await call<State>(s, STUDENT, `public.finish_exam($1)`, [attempt])).result?.correct).toBe(1);
      });
    });
  });

  describe("listening audio", () => {
    it("is played as many times as the exam allows, counted on the server, one count per recording", async () => {
      await exams(async (s) => {
        const attempt = await start(s, STUDENT);
        expect(await play(s, STUDENT, attempt, q.l1)).toEqual({ allowed: true, reason: null, plays_left: 0 });
        // The same recording, from either of its questions: the limit of one is used up.
        expect(await play(s, STUDENT, attempt, q.l1)).toEqual({ allowed: false, reason: "limit", plays_left: 0 });
        expect(await play(s, STUDENT, attempt, q.l2)).toEqual({ allowed: false, reason: "limit", plays_left: 0 });
        // Another recording has its own count.
        expect(await play(s, STUDENT, attempt, q.l3)).toMatchObject({ allowed: true, plays_left: 0 });
        const view = await state(s, STUDENT, attempt);
        expect(view.passages?.map((passage) => passage.plays_left)).toEqual([0, 0]);
        expect(await asDb(s, () => s.rows(`select sum(audio_plays)::int as plays from exam_answers where attempt_id = $1`, [attempt]))).toEqual([{ plays: 2 }]);
        // Listening to a question does not answer it, and answering does not reset the count.
        expect(view.questions?.map((question) => question.your_option)).toEqual([null, null, null]);
        await answer(s, STUDENT, attempt, q.l1, "a");
        expect(await play(s, STUDENT, attempt, q.l1)).toMatchObject({ allowed: false, reason: "limit" });
        // A reading question has no audio.
        await call(s, STUDENT, `public.submit_section($1)`, [attempt]);
        expect(await play(s, STUDENT, attempt, q.r1)).toMatchObject({ allowed: false, reason: "closed" });
      });
    });

    it("with a limit of two, the third start is refused", async () => {
      await exams(async (s) => {
        await asDb(s, () => s.rows(`update exams set audio_max_plays = 2 where id = $1`, [exam]));
        const attempt = await start(s, STUDENT);
        expect((await state(s, STUDENT, attempt)).passages?.[0].plays_left).toBe(2);
        expect(await play(s, STUDENT, attempt, q.l1)).toMatchObject({ allowed: true, plays_left: 1 });
        expect(await play(s, STUDENT, attempt, q.l2)).toMatchObject({ allowed: true, plays_left: 0 });
        expect(await play(s, STUDENT, attempt, q.l1)).toMatchObject({ allowed: false, reason: "limit" });
        // Each attempt counts for itself.
        const other = await start(s, APP_USER);
        expect(await play(s, APP_USER, other, q.l1)).toMatchObject({ allowed: true, plays_left: 1 });
      });
    });
  });

  describe("the result", () => {
    it("counts right answers per section, estimates a level from the exam's thresholds, and only then shows the answers", async () => {
      await exams(async (s) => {
        const done = await sit(s, STUDENT, ["l1", "l3", "r1", "r2"]);
        expect(done).toMatchObject({ status: "submitted", result: { correct_listening: 2, correct_reading: 2, correct: 4, questions: 5, first_attempt: true, estimated_level: 2 } });
        expect(done.result?.review).toHaveLength(5);
        expect(done.result?.review[1]).toMatchObject({ id: q.l2, section: "listening", position: 2, correct_option_id: "a", explanation: "Because.", your_option: "b" });
        // Two right is level 1; one right is below every threshold.
        expect((await sit(s, APP_USER, ["l1", "r1"])).result?.estimated_level).toBe(1);
        await asDb(s, () => s.rows(`delete from exam_attempts where profile_id = $1`, [APP_USER]));
        expect((await sit(s, APP_USER, ["r2"])).result?.estimated_level).toBeNull();
      });
    });

    it("without thresholds there is no estimate", async () => {
      await exams(async (s) => {
        await asDb(s, () => s.rows(`update exams set level_thresholds = null where id = $1`, [exam]));
        expect((await sit(s, STUDENT, ["l1", "l2", "l3", "r1", "r2"])).result).toMatchObject({ correct: 5, estimated_level: null });
      });
    });
  });

  describe("coins", () => {
    it("a student gets correct × rate at once, for the first completed attempt only", async () => {
      await exams(async (s) => {
        const first = await sit(s, STUDENT, ["l1", "l2", "r1"]);
        expect(first.result).toMatchObject({ correct: 3, coins: 3, coins_locked: false, first_attempt: true });
        expect(await asDb(s, () => s.rows(`select delta, source, dedupe_key, group_id from points_ledger where student_id = $1 and source = 'exam'`, [student]))).toEqual([
          { delta: 3, source: "exam", dedupe_key: `exam:${first.attempt_id}`, group_id: null },
        ]);
        // An hour later, a better second attempt is practice: no coins.
        await asDb(s, () => s.rows(`update exam_attempts set started_at = started_at - interval '1 hour', submitted_at = submitted_at - interval '1 hour'`));
        const second = await sit(s, STUDENT, ["l1", "l2", "l3", "r1", "r2"]);
        expect(second.attempt_id).not.toBe(first.attempt_id);
        expect(second.result).toMatchObject({ correct: 5, coins: 0, first_attempt: false });
        expect(await examCoins(s, student)).toBe(3);
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from locked_coins`))).toEqual([{ n: 0 }]);
        // The list remembers the last result.
        expect(await call(s, STUDENT, `public.exam_list()`)).toEqual([
          expect.objectContaining({ id: exam, title: "TOPIK I practice 1", level: "topik1", coins_per_correct: 1, open_attempt_id: null, attempts: 2, last: expect.objectContaining({ attempt_id: second.attempt_id, correct: 5 }) }),
        ]);
      });
    });

    it("the exam's own rate replaces the one in Settings; nothing right, or the programme off, pays nothing", async () => {
      await exams(async (s) => {
        await asDb(s, () => s.rows(`update exams set coins_per_correct = 3 where id = $1`, [exam]));
        expect((await sit(s, STUDENT, ["l1", "r1"])).result).toMatchObject({ correct: 2, coins: 6 });
        expect(await examCoins(s, student)).toBe(6);
        // Another exam, with the coins programme off; then on again, with nothing right.
        for (const [title, enabled] of [["Second", false], ["Third", true]] as const) {
          await asDb(s, async () => {
            const other = await writeExam(s, title);
            await s.rows(`update exam_sections set question_count = 1 where exam_id = $1`, [other.id]);
            await s.rows(`insert into exam_questions (section_id, position, prompt, options, correct_option_id) values ($1, 1, 'L', ${OPTIONS}, 'a'), ($2, 1, 'R', ${OPTIONS}, 'a')`, [other.listening, other.reading]);
            await s.rows(`update exams set status = 'published', published_at = now() where id = $1`, [other.id]);
            await s.rows(`update points_settings set enabled = $1`, [enabled]);
            exam = other.id;
          });
          const attempt = await start(s, STUDENT);
          const questions = (await state(s, STUDENT, attempt)).questions!;
          await answer(s, STUDENT, attempt, questions[0].id, enabled ? "b" : "a");
          const done = await call<State>(s, STUDENT, `public.finish_exam($1)`, [attempt]);
          expect(done.result, title).toMatchObject({ correct: enabled ? 0 : 1, coins: 0, first_attempt: true });
        }
        expect(await examCoins(s, student)).toBe(6);
      });
    });

    it("an App user's coins are locked, and linking moves them into the ledger once", async () => {
      await exams(async (s) => {
        const done = await sit(s, APP_USER, ["l1", "l2", "l3", "r1"]);
        expect(done.result).toMatchObject({ correct: 4, coins: 4, coins_locked: true, first_attempt: true });
        expect(await asDb(s, () => s.rows(`select profile_id, amount, exam_attempt_id, moved_at from locked_coins`))).toEqual([{ profile_id: APP_USER, amount: 4, exam_attempt_id: done.attempt_id, moved_at: null }]);
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from points_ledger where source = 'exam'`))).toEqual([{ n: 0 }]);
        // A second attempt locks nothing more.
        expect((await sit(s, APP_USER, ["l1"])).result).toMatchObject({ coins: 0, coins_locked: false, first_attempt: false });

        // They join the centre: their account is linked to a student record.
        const joined = await asDb(s, async () => {
          const id = (await s.rows<{ id: string }>(`insert into students (full_name, phone) values ('New Student', '+998770004009') returning id`))[0].id;
          await s.rows(`select public.link_profile_to_student($1, $2)`, [APP_USER, id]);
          // Linking again changes nothing.
          await s.rows(`select public.link_profile_to_student($1, $2)`, [APP_USER, id]);
          return id;
        });
        expect(await asDb(s, () => s.rows(`select delta, source from points_ledger where student_id = $1`, [joined]))).toEqual([{ delta: 4, source: "exam" }]);
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from locked_coins where moved_at is null`))).toEqual([{ n: 0 }]);
        // As a student now: another exam's first attempt pays into the ledger at once.
        await asDb(s, () => s.rows(`delete from exam_attempts where profile_id = $1`, [APP_USER]));
        const again = await sit(s, APP_USER, ["r1", "r2"]);
        expect(again.result).toMatchObject({ coins: 2, coins_locked: false });
        expect(await examCoins(s, joined)).toBe(6);
      });
    });
  });

  describe("around the engine", () => {
    it("staff see how many attempts each exam has and the average score", async () => {
      await exams(async (s) => {
        await sit(s, STUDENT, ["l1", "l2", "l3", "r1", "r2"]);
        await sit(s, APP_USER, ["l1", "r1"]);
        await sit(s, APP_USER, ["l1", "r1", "r2"]);
        await start(s, STUDENT);
        await actAs(s, TEACHER_USER_ID);
        // An attempt still in progress is not counted.
        expect(await s.rows(`select * from public.exam_stats()`)).toEqual([{ exam_id: exam, attempts: 3, players: 2, average_correct: "3.3" }]);
      });
    });

    it("a player reads the files of an exam they have an attempt on, and no other's", async () => {
      await exams(async (s) => {
        await actAs(s, STUDENT);
        const can = async (name: string) => (await s.rows<{ ok: boolean }>(`select public.has_exam_attempt($1) as ok`, [name]))[0].ok;
        expect(await can(`${exam}/one.mp3`)).toBe(false);
        await start(s, STUDENT);
        expect(await can(`${exam}/one.mp3`)).toBe(true);
        expect(await can(`00000000-0000-4000-8000-000000000000/one.mp3`)).toBe(false);
        expect(await can(`one.mp3`)).toBe(false);
        await actAs(s, APP_USER);
        expect(await can(`${exam}/one.mp3`)).toBe(false);
      });
    });
  });
});
