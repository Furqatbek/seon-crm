/**
 * The 1v1 game — docs/STUDENT_APP_SPEC.md → "Rules → 1v1 game". Question
 * banks, matchmaking, the engine and coins. Time is moved by shifting what the
 * database wrote into the past. Most tests are rolled back; the one about two
 * answers at the same moment needs two real connections and commits, and
 * deletes what it made.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);

const U = (n: number) => `0000000f-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Three classmates, a student of a TOPIK I group, and three App users (TOPIK I, Beginner, TOPIK II). */
const [S1, S2, S3, S4, A1, A2, A3] = [1, 2, 3, 4, 5, 6, 7].map(U);
const BANK = { subject: "Game Test", level: "L1" };

let group = "";
let topikGroup = "";
let students: string[] = [];

type State = {
  id: string;
  status: string;
  kind: string;
  you: "a" | "b";
  rope: number;
  current_index: number;
  coins_eligible: boolean;
  opponent: { computer: boolean; name: string | null };
  question: { index: number; text: string; options: Array<{ id: string; text: string }> } | null;
  answered: { you: boolean; your_option: string | null; opponent: boolean } | null;
  previous: { index: number; correct_option_id: string; your_option: string | null; opponent_option: string | null; pull: number } | null;
  result: { outcome: string; forfeit: boolean; rewarded: boolean; coins: number; review: Array<Record<string, unknown>> } | null;
};
type Answer = { accepted: boolean; is_correct?: boolean; reason?: string; state: State };

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
/** One call as a player. */
async function call<T>(s: Session, user: string, sql: string, params: unknown[] = []): Promise<T> {
  await actAs(s, user);
  return (await s.rows<{ r: T }>(`select ${sql} as r`, params))[0].r;
}
async function refused(s: Session, user: string, sql: string, params: unknown[] = []): Promise<string> {
  await actAs(s, user);
  return code(await s.attempt(`select ${sql}`, params));
}

/**
 * Seconds pass. Everything the game wrote moves into the past; a player who
 * is `silent` sends no heartbeat meanwhile, the others are still there.
 */
const pass = (s: Session, seconds: number, silent: "none" | "a" | "b" | "both" = "none") =>
  asDb(s, async () => {
    const by = [seconds];
    await s.rows(
      `update matches set question_started_at = question_started_at - $1 * interval '1 second', created_at = created_at - $1 * interval '1 second',
         last_seen_a = last_seen_a - (case when $2 in ('a', 'both') then $1 else 0 end) * interval '1 second',
         last_seen_b = last_seen_b - (case when $2 in ('b', 'both') then $1 else 0 end) * interval '1 second'
       where status in ('countdown', 'playing')`,
      [seconds, silent],
    );
    await s.rows(`update match_answers set answered_at = answered_at - $1 * interval '1 second' where match_id in (select id from matches where status in ('countdown', 'playing'))`, by);
    await s.rows(`update match_queue set joined_at = joined_at - $1 * interval '1 second', last_seen = last_seen - $1 * interval '1 second'`, by);
    await s.rows(`update match_invites set expires_at = expires_at - $1 * interval '1 second', created_at = created_at - $1 * interval '1 second'`, by);
  });

const state = (s: Session, user: string, match: string) => call<State>(s, user, `public.match_state($1)`, [match]);
const submit = (s: Session, user: string, match: string, index: number, option: string) =>
  call<Answer>(s, user, `public.submit_answer($1, $2, $3)`, [match, index, option]);

/** 'right' and 'wrong' answer in time; 'late' answers after the 10 seconds; 'none' never answers. */
type Move = "right" | "wrong" | "late" | "none";
/** Every question in the test banks has the right answer "a". */
const optionOf = (move: Move) => (move === "wrong" ? "b" : "a");

/**
 * One question of a match between `a` and `b`: A answers 2 seconds in and B 4
 * seconds in (or the other way round with `bFirst`). Returns A's view once the
 * question is over, with the next question on screen if there is one.
 */
async function round(s: Session, match: string, a: string, b: string, moveA: Move, moveB: Move, bFirst = false): Promise<State> {
  const index = (await state(s, a, match)).current_index;
  const order: Array<[string, Move]> = bFirst ? [[b, moveB], [a, moveA]] : [[a, moveA], [b, moveB]];
  let elapsed = 0;
  for (const [player, move] of order) {
    await pass(s, 2);
    elapsed += 2;
    if (move === "right" || move === "wrong") {
      const answer = await submit(s, player, match, index, optionOf(move));
      expect(answer).toMatchObject({ accepted: true, is_correct: move === "right" });
    }
  }
  if (moveA !== "right" && moveA !== "wrong" || moveB !== "right" && moveB !== "wrong") {
    // The 10 seconds run out.
    await pass(s, 10.5 - elapsed);
    for (const [player, move] of order) {
      if (move === "late") expect(await submit(s, player, match, index, "a")).toMatchObject({ accepted: false, reason: "late" });
    }
    await call(s, a, `public.advance_match($1)`, [match]);
  }
  // The pause before the next question.
  await pass(s, 2);
  return state(s, a, match);
}

/** The group a player plays from: none for an App user. */
const lobbyOf = (user: string) => (user === S4 ? topikGroup : [A1, A2, A3].includes(user) ? null : group);

/** A match made for two players, with its first question on screen. */
async function matchOf(s: Session, a: string, b: string): Promise<string> {
  expect(await call<{ queued_at?: string }>(s, a, `public.join_queue($1)`, [lobbyOf(a)])).toHaveProperty("queued_at");
  const joined = await call<{ match_id: string }>(s, b, `public.join_queue($1)`, [lobbyOf(b)]);
  expect(joined.match_id).toEqual(expect.any(String));
  await pass(s, 3);
  return joined.match_id;
}

/** `winner` answers five in a row right while the other is wrong: the rope reaches the end. */
async function quickWin(s: Session, winner: string, loser: string): Promise<State> {
  const match = await matchOf(s, winner, loser);
  let view = await state(s, winner, match);
  for (let i = 0; i < 5; i++) view = await round(s, match, winner, loser, "right", "wrong");
  return view;
}

const coinsOf = (s: Session, student: string) =>
  asDb(s, async () => (await s.rows<{ n: number }>(`select coalesce(sum(delta), 0)::int as n from points_ledger where student_id = $1 and source = 'game_win'`, [student]))[0].n);

const questions = (subject: string, level: string, count: number, prefix = "Q") =>
  `insert into questions (subject, level, text, options, correct_option_id, explanation)
   select '${subject}', '${level}', '${prefix} ' || n, '[{"id":"a","text":"Right"},{"id":"b","text":"Wrong"},{"id":"c","text":"Also wrong"},{"id":"d","text":"Wrong too"}]', 'a', 'Because.'
   from generate_series(1, ${count}) n`;

const setup = async (s: Session) => {
  // A group with three students becomes the test bank's group; another group becomes a TOPIK I group.
  const groups = await s.rows<{ group_id: string; students: string[] }>(
    `select e.group_id, array_agg(e.student_id order by e.student_id) as students
     from enrollments e join groups g on g.id = e.group_id and g.archived_at is null join students st on st.id = e.student_id and st.archived_at is null
     where e.status = 'active' group by e.group_id having count(*) >= 3 order by count(*) desc, e.group_id limit 2`,
  );
  group = groups[0].group_id;
  topikGroup = groups[1].group_id;
  const fourth = groups[1].students.find((id) => !groups[0].students.includes(id))!;
  students = [...groups[0].students.slice(0, 3), fourth];
  await s.rows(`update groups set subject = $2, level = $3 where id = $1`, [group, BANK.subject, BANK.level]);
  await s.rows(`update groups set subject = 'Koreys tili', level = 'TOPIK I' where id = $1`, [topikGroup]);
  for (const [index, id] of students.entries()) {
    const phone = `99877000300${index + 1}`;
    await s.rows(`update students set phone = $2 where id = $1`, [id, `+${phone}`]);
    await s.rows(`insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), '{"full_name":"Player"}')`, [U(index + 1), phone]);
  }
  for (const [user, level, phone] of [[A1, "topik1", "998770003011"], [A2, "beginner", "998770003012"], [A3, "topik2", "998770003013"]]) {
    await s.rows(
      `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), jsonb_build_object('full_name', 'App User', 'korean_level', $3::text))`,
      [user, phone, level],
    );
  }
  await s.rows(`delete from questions`);
  await s.rows(questions(BANK.subject, BANK.level, 60));
  await s.rows(questions("TOPIK", "topik1", 40, "T1"));
  await s.rows(questions("TOPIK", "topik2", 12, "T2"));
  await s.rows(`update points_settings set enabled = true, game_win_coins = 5, game_daily_rewarded_wins = 5, game_pair_daily_cap = 2, game_min_questions = 30`);
};

const game = <T>(fn: (s: Session) => Promise<T>) => as({ userId: S1 }, fn, setup);

describe.skipIf(!DB_URL)("The 1v1 game", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("scoring", () => {
    it("one question pulls the rope as the rules say, for every pair of answers", async () => {
      await game(async (s) => {
        const pull = async (aOk: boolean | null, aMs: number | null, bOk: boolean | null, bMs: number | null) =>
          asDb(s, async () => (await s.rows<{ p: number }>(`select public.game_pull($1, $2, $3, $4) as p`, [aOk, aMs, bOk, bMs]))[0].p);
        // Right against wrong, against nothing, and against right (the faster one pulls the extra step).
        expect(await pull(true, 4000, false, 1000)).toBe(1);
        expect(await pull(true, 9999, null, null)).toBe(1);
        expect(await pull(false, 1000, true, 4000)).toBe(-1);
        expect(await pull(null, null, true, 9999)).toBe(-1);
        expect(await pull(true, 2000, true, 4000)).toBe(1);
        expect(await pull(true, 4000, true, 2000)).toBe(-1);
        expect(await pull(true, 3000, true, 3000)).toBe(0);
        // Wrong and missing pull nothing.
        expect(await pull(false, 1000, false, 2000)).toBe(0);
        expect(await pull(false, 1000, null, null)).toBe(0);
        expect(await pull(null, null, null, null)).toBe(0);
      });
    });

    it("a whole match: right, wrong, late and missing answers in every mix", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        // [A's answer, B's answer, B answers first?, what the question does to the rope from A's side]
        const script: Array<[Move, Move, boolean, number]> = [
          ["right", "wrong", false, 1],
          ["wrong", "right", false, -1],
          ["right", "right", false, 1], // both right, A faster
          ["right", "right", true, -1], // both right, B faster
          ["wrong", "wrong", false, 0],
          ["right", "none", false, 1],
          ["none", "right", false, -1],
          ["right", "late", false, 1],
          ["late", "late", false, 0],
          ["none", "none", false, 0],
        ];
        let rope = 0;
        for (const [index, [a, b, bFirst, expected]] of script.entries()) {
          const before = await state(s, S1, match);
          expect(before).toMatchObject({ status: "playing", current_index: index, rope });
          const after = await round(s, match, S1, S2, a, b, bFirst);
          rope += expected;
          expect(after.previous, `question ${index + 1}: ${a} against ${b}`).toMatchObject({ index, pull: expected, correct_option_id: "a" });
          expect(after.rope).toBe(rope);
          // The other player sees the same rope from their side.
          expect((await state(s, S2, match)).rope).toBe(rope === 0 ? 0 : -rope);
        }
        // +1 −1 +1 −1 0 +1 −1 +1 0 0: A is one step ahead after ten questions.
        const end = await state(s, S1, match);
        expect(end).toMatchObject({ status: "finished", rope: 1, result: { outcome: "win", forfeit: false, rewarded: true, coins: 5 } });
        expect(await state(s, S2, match)).toMatchObject({ status: "finished", rope: -1, result: { outcome: "loss", rewarded: false, coins: 0 } });
        expect(end.result?.review).toHaveLength(10);
        // The answers were timed by the server: 2 and 4 seconds in.
        const times = await asDb(s, () => s.rows<{ player: string; ms_taken: number }>(`select player, ms_taken from match_answers where match_id = $1 and question_index = 0 order by player`, [match]));
        expect(times).toEqual([{ player: "a", ms_taken: 2000 }, { player: "b", ms_taken: 4000 }]);
      });
    });

    it("reaching the end of the rope wins at once: five right in a row end the match on the fifth question", async () => {
      await game(async (s) => {
        const end = await quickWin(s, S1, S2);
        expect(end).toMatchObject({ status: "finished", rope: 5, current_index: 4, result: { outcome: "win", rewarded: true, coins: 5 } });
        expect(end.result?.review).toHaveLength(5);
        const row = await asDb(s, () => s.rows(`select winner, rewarded, rope, current_index from matches where id = $1`, [end.id]));
        expect(row).toEqual([{ winner: "a", rewarded: true, rope: 5, current_index: 4 }]);
        expect(await coinsOf(s, students[0])).toBe(5);
        expect(await coinsOf(s, students[1])).toBe(0);
        // The coins are written under the group the winner played from.
        expect(await asDb(s, () => s.rows(`select group_id, delta from points_ledger where dedupe_key = $1`, [`game:${end.id}`]))).toEqual([{ group_id: group, delta: 5 }]);
      });
    });

    it("the rope at dead centre after ten questions is a draw, and a draw pays nobody", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        for (let i = 0; i < 5; i++) {
          await round(s, match, S1, S2, "right", "wrong");
          if (i < 4) await round(s, match, S1, S2, "wrong", "right");
        }
        // Four each way and one more for A, then B evens it on the last question.
        const end = await round(s, match, S1, S2, "none", "right");
        expect(end).toMatchObject({ status: "finished", rope: 0, result: { outcome: "draw", rewarded: false, coins: 0 } });
        expect(await state(s, S2, match)).toMatchObject({ result: { outcome: "draw", coins: 0 } });
        expect(await coinsOf(s, students[0])).toBe(0);
        expect(await coinsOf(s, students[1])).toBe(0);
      });
    });

    it("the side the rope is on wins after ten questions, even by one step", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        let view = await round(s, match, S1, S2, "wrong", "right");
        for (let i = 0; i < 9; i++) view = await round(s, match, S1, S2, "wrong", "wrong");
        expect(view).toMatchObject({ status: "finished", rope: -1, result: { outcome: "loss" } });
        expect(await coinsOf(s, students[1])).toBe(5);
      });
    });
  });

  describe("heartbeat and forfeit", () => {
    it("20 seconds without a heartbeat forfeits; the player who stayed wins", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        await round(s, match, S1, S2, "wrong", "right");
        // 19 seconds of silence is not enough.
        await pass(s, 19, "b");
        expect(await call<State>(s, S1, `public.heartbeat($1)`, [match])).toMatchObject({ status: "playing" });
        await pass(s, 2, "b");
        const end = await call<State>(s, S1, `public.heartbeat($1)`, [match]);
        // B was a step ahead, and still loses.
        expect(end).toMatchObject({ status: "finished", result: { outcome: "win", forfeit: true, rewarded: true, coins: 5 } });
        // Coming back does not undo it.
        expect(await call<State>(s, S2, `public.heartbeat($1)`, [match])).toMatchObject({ status: "finished", result: { outcome: "loss", forfeit: true } });
        expect(await asDb(s, () => s.rows(`select winner, forfeited_by from matches where id = $1`, [match]))).toEqual([{ winner: "a", forfeited_by: "b" }]);
      });
    });

    it("a match forfeited before its question was shown reviews nothing, and that question is not counted as seen", async () => {
      await game(async (s) => {
        expect(await call(s, S1, `public.join_queue($1)`, [group])).toHaveProperty("queued_at");
        const match = (await call<{ match_id: string }>(s, S2, `public.join_queue($1)`, [group])).match_id;
        // B goes silent during the countdown. The clock is put back so the first question was never on screen.
        await pass(s, 21, "b");
        await asDb(s, () => s.rows(`update matches set question_started_at = now() + interval '1 second' where id = $1`, [match]));
        const end = await call<State>(s, S1, `public.heartbeat($1)`, [match]);
        expect(end).toMatchObject({ status: "finished", previous: null, result: { outcome: "win", forfeit: true, review: [] } });
        // With only ten questions on, a new match must use that very question again: it was never seen.
        const first = await asDb(s, async () => (await s.rows<{ id: string }>(`select question_ids[1] as id from matches where id = $1`, [match]))[0].id);
        await asDb(s, () => s.rows(`update questions set is_active = false where subject = $1 and id not in (select id from questions where subject = $1 and id <> $2 order by id limit 10)`, [BANK.subject, first]));
        await asDb(s, () => s.rows(`update questions set is_active = true where id = $1`, [first]));
        await asDb(s, () => s.rows(`update points_settings set game_min_questions = 10`));
        const next = await matchOf(s, S1, S3);
        const drawn = await asDb(s, async () => (await s.rows<{ ids: string[] }>(`select question_ids::text[] as ids from matches where id = $1`, [next]))[0].ids);
        expect(drawn).toContain(first);
      });
    });

    it("a match forfeited in the middle of a question reviews what was shown, and tells the last settled question", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        await round(s, match, S1, S2, "right", "wrong");
        await pass(s, 1);
        await submit(s, S1, match, 1, "a");
        await pass(s, 21, "b");
        const end = await call<State>(s, S1, `public.heartbeat($1)`, [match]);
        expect(end).toMatchObject({ status: "finished", rope: 1, previous: { index: 0, pull: 1 }, result: { forfeit: true } });
        expect(end.result?.review.map((row) => row.index)).toEqual([0, 1]);
      });
    });

    it("a heartbeat keeps a player in the match", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        for (let i = 0; i < 4; i++) {
          await pass(s, 15, "both");
          await call(s, S1, `public.heartbeat($1)`, [match]);
          await call(s, S2, `public.heartbeat($1)`, [match]);
        }
        expect((await state(s, S1, match)).status).not.toBe("finished");
        expect(await asDb(s, () => s.rows(`select forfeited_by from matches where id = $1`, [match]))).toEqual([{ forfeited_by: null }]);
      });
    });

    it("the job closes abandoned matches: one silent player forfeits, two silent players cancel it", async () => {
      await game(async (s) => {
        const first = await matchOf(s, S1, S2);
        await pass(s, 25, "both");
        const second = await matchOf(s, S3, S1);
        await pass(s, 25, "a");
        // Not something a player can run.
        expect(await refused(s, S1, `public.close_abandoned_matches()`)).toBe(DENIED);
        await asDb(s, () => s.rows(`select public.close_abandoned_matches()`));
        const rows = await asDb(s, () => s.rows<{ id: string; status: string; winner: string | null; forfeited_by: string | null }>(`select id, status, winner, forfeited_by from matches where id in ($1, $2)`, [first, second]));
        expect(rows.find((row) => row.id === first)).toMatchObject({ status: "cancelled", winner: null });
        expect(rows.find((row) => row.id === second)).toMatchObject({ status: "finished", winner: "b", forfeited_by: "a" });
        expect(await coinsOf(s, students[1])).toBe(0);
      });
    });
  });

  describe("coins", () => {
    it("at most the daily number of rewarded wins: the next win pays nothing", async () => {
      await game(async (s) => {
        await asDb(s, () => s.rows(`update points_settings set game_daily_rewarded_wins = 2, game_pair_daily_cap = 5`));
        expect(await quickWin(s, S1, S2)).toMatchObject({ result: { outcome: "win", rewarded: true, coins: 5 } });
        expect(await quickWin(s, S1, S3)).toMatchObject({ result: { rewarded: true, coins: 5 } });
        // The third win of the day.
        expect(await quickWin(s, S1, S2)).toMatchObject({ result: { outcome: "win", rewarded: false, coins: 0 } });
        expect(await coinsOf(s, students[0])).toBe(10);
        // Someone else's wins are their own count.
        expect(await quickWin(s, S3, S1)).toMatchObject({ result: { rewarded: true, coins: 5 } });
        // Yesterday's wins do not count today.
        await asDb(s, () => s.rows(`update points_ledger set created_at = created_at - interval '1 day' where source = 'game_win'`));
        await asDb(s, () => s.rows(`update matches set finished_at = finished_at - interval '1 day' where status = 'finished'`));
        expect(await quickWin(s, S1, S2)).toMatchObject({ result: { rewarded: true, coins: 5 } });
      });
    });

    it("at most two rewarded games a day between the same two students, whoever wins", async () => {
      await game(async (s) => {
        expect(await quickWin(s, S1, S2)).toMatchObject({ result: { rewarded: true } });
        expect(await quickWin(s, S2, S1)).toMatchObject({ result: { rewarded: true } });
        // The third game between them today.
        expect(await quickWin(s, S1, S2)).toMatchObject({ result: { outcome: "win", rewarded: false, coins: 0 } });
        expect(await quickWin(s, S2, S1)).toMatchObject({ result: { rewarded: false } });
        expect(await coinsOf(s, students[0])).toBe(5);
        expect(await coinsOf(s, students[1])).toBe(5);
        // Against someone else the wins are rewarded again.
        expect(await quickWin(s, S1, S3)).toMatchObject({ result: { rewarded: true, coins: 5 } });
      });
    });

    it("nobody gets coins in a match with an App user, and App users never do", async () => {
      await game(async (s) => {
        // A student of a TOPIK I group meets an App user of that level.
        const mixed = await quickWin(s, S4, A1);
        expect(mixed).toMatchObject({ coins_eligible: false, result: { outcome: "win", rewarded: false, coins: 0 } });
        expect(await coinsOf(s, students[3])).toBe(0);
        const lost = await quickWin(s, A1, S4);
        expect(lost).toMatchObject({ coins_eligible: false, result: { outcome: "win", rewarded: false, coins: 0 } });
        // Two App users.
        expect(await quickWin(s, A1, A2)).toMatchObject({ coins_eligible: false, result: { rewarded: false, coins: 0 } });
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from points_ledger where source = 'game_win'`))).toEqual([{ n: 0 }]);
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from matches where rewarded or coins_eligible`))).toEqual([{ n: 0 }]);
      });
    });

    it("pays nothing while the coins programme is off", async () => {
      await game(async (s) => {
        await asDb(s, () => s.rows(`update points_settings set enabled = false`));
        expect(await quickWin(s, S1, S2)).toMatchObject({ result: { outcome: "win", rewarded: false, coins: 0 } });
      });
    });
  });

  describe("what a player can read", () => {
    it("there is no way to read the right answer before the question is over", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        // The tables are closed: the questions, the answers and the queue.
        for (const user of [S1, A1]) {
          await actAs(s, user);
          const read = await s.attempt(`select * from questions`);
          expect(read.ok ? read.rowCount : 0, user).toBe(0);
          expect(code(await s.attempt(`select * from match_answers`)), user).toBe(DENIED);
          expect(code(await s.attempt(`select * from match_queue`)), user).toBe(DENIED);
          expect(code(await s.attempt(`update matches set rope = 5`)), user).toBe(DENIED);
          expect(code(await s.attempt(`insert into match_answers (match_id, player, question_index, option_id, is_correct, answered_at, ms_taken) values ($1, 'a', 0, 'a', true, now(), 1)`, [match])), user).toBe(DENIED);
        }
        for (const internal of [`public.game_tick('${match}')`, `public.game_finish('${match}', 'a')`, `public.game_computer_answer('${match}', 0, '${match}', now())`, `public.game_create_match('random', 'x', 'y', '${S1}', '${S2}', null, null)`]) {
          expect(await refused(s, S1, internal), internal).toBe(DENIED);
        }
        // The match row a player follows live names question ids only, and they cannot open them.
        await actAs(s, S1);
        expect(Object.keys((await s.rows(`select * from matches where id = $1`, [match]))[0])).not.toContain("correct_option_id");

        // The question on screen: its text and choices, nothing about which is right.
        const before = await state(s, S1, match);
        expect(before.question).toEqual({ index: 0, text: expect.any(String), image_path: null, options: expect.any(Array) });
        expect(before.question?.options).toHaveLength(4);
        expect(JSON.stringify(before)).not.toMatch(/correct|explanation|is_correct/);
        expect(before.previous).toBeNull();

        // The other player answers first. Their answer is not shown: only that they have answered.
        await pass(s, 2);
        await submit(s, S2, match, 0, "a");
        const waiting = await state(s, S1, match);
        expect(waiting.answered).toEqual({ you: false, your_option: null, opponent: true });
        expect(JSON.stringify(waiting)).not.toMatch(/correct|explanation|is_correct|opponent_option/);
        // An outsider is told nothing at all.
        expect(await refused(s, S3, `public.match_state($1)`, [match])).toBe(DENIED);
        expect(await refused(s, MANAGER_ID, `public.match_state($1)`, [match])).toBe(DENIED);
        expect(await refused(s, S3, `public.submit_answer($1, 0, 'a')`, [match])).toBe(DENIED);
        await actAs(s, S3);
        expect(await s.rows(`select * from matches where id = $1`, [match])).toEqual([]);

        // Once both have answered the question is over, and its answer is told.
        const mine = await submit(s, S1, match, 0, "b");
        expect(mine).toMatchObject({ accepted: true, is_correct: false });
        expect(mine.state.previous).toEqual({ index: 0, correct_option_id: "a", your_option: "b", opponent_option: "a", pull: -1 });
        // The next question is not shown before its moment.
        expect(mine.state.question).toBeNull();
        await pass(s, 2);
        const next = await state(s, S1, match);
        expect(next.question?.index).toBe(1);
        expect(JSON.stringify(next.question)).not.toMatch(/correct/);
      });
    });

    it("an answer is taken once, in time, for the question on screen, from its choices", async () => {
      await game(async (s) => {
        const joined = await call<{ queued_at: string }>(s, S1, `public.join_queue($1)`, [group]);
        expect(joined.queued_at).toEqual(expect.any(String));
        const match = (await call<{ match_id: string }>(s, S2, `public.join_queue($1)`, [group])).match_id;
        // During the countdown there is no question yet.
        expect(await state(s, S1, match)).toMatchObject({ status: "countdown", question: null });
        expect(await submit(s, S1, match, 0, "a")).toMatchObject({ accepted: false, reason: "not_open" });
        await pass(s, 3);
        expect(await submit(s, S1, match, 0, "z")).toMatchObject({ accepted: false, reason: "invalid" });
        expect(await submit(s, S1, match, 3, "a")).toMatchObject({ accepted: false, reason: "not_open" });
        expect(await submit(s, S1, match, 0, "b")).toMatchObject({ accepted: true, is_correct: false });
        // Changing one's mind is not possible.
        expect(await submit(s, S1, match, 0, "a")).toMatchObject({ accepted: false, reason: "already" });
        expect(await asDb(s, () => s.rows(`select option_id from match_answers where match_id = $1 and player = 'a'`, [match]))).toEqual([{ option_id: "b" }]);
        // The other player answers after the 10 seconds: too late, and the question is settled without it.
        await pass(s, 10.2);
        const late = await submit(s, S2, match, 0, "a");
        expect(late).toMatchObject({ accepted: false, reason: "late" });
        expect(late.state.previous).toMatchObject({ index: 0, your_option: null, pull: 0 });
        // A question that is over cannot be answered again.
        await pass(s, 2);
        expect(await submit(s, S1, match, 0, "a")).toMatchObject({ accepted: false, reason: "late" });
      });
    });

    it("a finished match is reviewed with every answer, by its players only", async () => {
      await game(async (s) => {
        const end = await quickWin(s, S1, S2);
        expect(end.result?.review[0]).toEqual({
          index: 0, text: expect.any(String), image_path: null, options: expect.any(Array),
          correct_option_id: "a", explanation: "Because.", your_option: "a", opponent_option: "b",
        });
        expect(await refused(s, S3, `public.match_state($1)`, [end.id])).toBe(DENIED);
        // Each question's counters moved once per player who was shown it.
        const used = await asDb(s, () => s.rows(`select sum(times_used)::int as used, sum(times_correct)::int as correct from questions`));
        expect(used).toEqual([{ used: 10, correct: 5 }]);
      });
    });
  });

  describe("questions drawn", () => {
    it("ten active questions of the bank, avoiding what either player saw in the last 7 days", async () => {
      await game(async (s) => {
        const ids = (match: string) => asDb(s, async () => (await s.rows<{ question_ids: string[] }>(`select question_ids::text[] as question_ids from matches where id = $1`, [match]))[0].question_ids);
        const seen = new Set<string>();
        // 60 questions: three matches that S1 plays to the end share none; S2 and S3 each bring what they saw.
        for (const opponent of [S2, S3, S2]) {
          const match = await matchOf(s, S1, opponent);
          const drawn = await ids(match);
          expect(new Set(drawn).size).toBe(10);
          for (const id of drawn) expect(seen.has(id)).toBe(false);
          for (let i = 0; i < 10; i++) await round(s, match, S1, opponent, "none", "none");
          drawn.forEach((id) => seen.add(id));
        }
        expect(seen.size).toBe(30);
        // Only this bank's active questions are drawn.
        const foreign = await asDb(s, () => s.rows<{ n: number }>(`select count(*)::int as n from questions where id = any($1::uuid[]) and (subject <> $2 or level <> $3 or not is_active)`, [[...seen], BANK.subject, BANK.level]));
        expect(foreign).toEqual([{ n: 0 }]);
        // Eight days later everything may come again.
        await asDb(s, () => s.rows(`update matches set created_at = created_at - interval '8 days'`));
        await asDb(s, () => s.rows(`update questions set is_active = false where not (id = any($1::uuid[]))`, [[...seen].slice(0, 10)]));
        await asDb(s, () => s.rows(`update points_settings set game_min_questions = 10`));
        const again = await ids(await matchOf(s, S1, S2));
        expect([...again].sort()).toEqual([...seen].slice(0, 10).sort());
      });
    });

    it("with too few fresh questions it still draws ten, old ones last", async () => {
      await game(async (s) => {
        await asDb(s, () => s.rows(`update questions set is_active = false where subject = $1 and id not in (select id from questions where subject = $1 order by id limit 15)`, [BANK.subject]));
        await asDb(s, () => s.rows(`update points_settings set game_min_questions = 15`));
        const ids = (match: string) => asDb(s, async () => (await s.rows<{ question_ids: string[] }>(`select question_ids::text[] as question_ids from matches where id = $1`, [match]))[0].question_ids);
        const first = await matchOf(s, S1, S2);
        const drawn = await ids(first);
        for (let i = 0; i < 10; i++) await round(s, first, S1, S2, "none", "none");
        const second = await ids(await matchOf(s, S1, S2));
        // The five nobody saw are all in, and five seen ones fill the rest.
        expect(second.filter((id) => !drawn.includes(id))).toHaveLength(5);
        expect(new Set(second).size).toBe(10);
      });
    });
  });

  describe("matchmaking", () => {
    it("pairs the first two waiting for the same bank; another bank waits on", async () => {
      await game(async (s) => {
        expect(await call(s, S1, `public.join_queue($1)`, [group])).toHaveProperty("queued_at");
        // A TOPIK I student and App user are another bank.
        expect(await call(s, S4, `public.join_queue($1)`, [topikGroup])).toHaveProperty("queued_at");
        await pass(s, 5);
        // S2 meets S1, who is waiting for this bank, not S4.
        const made = await call<{ match_id: string }>(s, S2, `public.join_queue($1)`, [group]);
        expect(await call(s, S3, `public.join_queue($1)`, [group])).toHaveProperty("queued_at");
        const row = await asDb(s, () => s.rows(`select kind, subject, level, player_a, player_b, group_a, group_b, coins_eligible, status from matches where id = $1`, [made.match_id]));
        expect(row).toEqual([{ kind: "random", subject: BANK.subject, level: BANK.level, player_a: S1, player_b: S2, group_a: group, group_b: group, coins_eligible: true, status: "countdown" }]);
        // The waiting player finds the match by asking again, and both have left the queue.
        expect(await call(s, S1, `public.join_queue($1)`, [group])).toEqual({ match_id: made.match_id });
        expect(await asDb(s, () => s.rows(`select profile_id from match_queue order by joined_at`))).toEqual([{ profile_id: S4 }, { profile_id: S3 }]);
        // Names are a first name and an initial.
        const view = await state(s, S1, made.match_id);
        expect(view.opponent.computer).toBe(false);
        expect(view.opponent.name).toMatch(/^\S+( \S\.)?$/);
      });
    });

    it("App users play at their level: Beginner and TOPIK I share a bank, TOPIK II is its own", async () => {
      await game(async (s) => {
        await asDb(s, () => s.rows(`update points_settings set game_min_questions = 10`));
        expect(await call(s, A3, `public.join_queue()`)).toHaveProperty("queued_at");
        expect(await call(s, A2, `public.join_queue()`)).toHaveProperty("queued_at");
        const made = await call<{ match_id: string }>(s, A1, `public.join_queue()`);
        expect(await asDb(s, () => s.rows(`select subject, level, player_a, player_b, group_a, coins_eligible from matches where id = $1`, [made.match_id]))).toEqual([
          { subject: "TOPIK", level: "topik1", player_a: A2, player_b: A1, group_a: null, coins_eligible: false },
        ]);
        // The TOPIK II player is still waiting, in the other bank.
        expect(await asDb(s, () => s.rows(`select profile_id, level from match_queue`))).toEqual([{ profile_id: A3, level: "topik2" }]);
        // A group whose level says TOPIK I plays that same bank.
        const lobby = await call<{ subject: string; level: string }>(s, S4, `public.game_lobby($1)`, [topikGroup]);
        expect(lobby).toMatchObject({ subject: "TOPIK", level: "topik1" });
        // A student plays from one of their own groups only.
        expect(await refused(s, S1, `public.join_queue($1)`, [topikGroup])).toBe(DENIED);
        expect(await refused(s, S1, `public.join_queue()`)).toBe(DENIED);
      });
    });

    it("random matches open once the bank has the minimum number of active questions", async () => {
      await game(async (s) => {
        await asDb(s, () => s.rows(`update questions set is_active = false where subject = $1 and id not in (select id from questions where subject = $1 order by id limit 29)`, [BANK.subject]));
        expect(await call(s, S1, `public.game_lobby($1)`, [group])).toMatchObject({ random_open: false, challenge_open: true });
        expect(await refused(s, S1, `public.join_queue($1)`, [group])).toBe("EG001");
        await asDb(s, () => s.rows(`update questions set is_active = true where id = (select id from questions where subject = $1 and not is_active limit 1)`, [BANK.subject]));
        expect(await call(s, S1, `public.game_lobby($1)`, [group])).toMatchObject({ random_open: true });
        expect(await call(s, S1, `public.join_queue($1)`, [group])).toHaveProperty("queued_at");
      });
    });

    it("the game is for students and App users only", async () => {
      await game(async (s) => {
        for (const user of [OWNER_ID, MANAGER_ID, TEACHER_USER_ID]) {
          expect(await refused(s, user, `public.join_queue($1)`, [group]), user).toBe(DENIED);
          expect(await refused(s, user, `public.game_lobby($1)`, [group]), user).toBe(DENIED);
          expect(await refused(s, user, `public.start_practice()`), user).toBe(DENIED);
        }
        await actAs(s, S1);
        expect(code(await s.attempt(`select public.join_queue($1)`, [group]))).toBe("allowed");
      });
    });

    it("a player who keeps asking keeps their place and their waiting time, however long they wait", async () => {
      await game(async (s) => {
        const first = await call<{ queued_at: string }>(s, S1, `public.join_queue($1)`, [group]);
        // Five minutes of waiting, asking again every minute and a half.
        for (let i = 0; i < 4; i++) {
          await pass(s, 90);
          await asDb(s, () => s.rows(`select public.close_abandoned_matches()`));
          const again = await call<{ queued_at: string }>(s, S1, `public.join_queue($1)`, [group]);
          expect(Date.parse(first.queued_at) - Date.parse(again.queued_at)).toBe((i + 1) * 90_000);
        }
        // Still first in line: the next player meets them.
        const made = await call<{ match_id: string }>(s, S2, `public.join_queue($1)`, [group]);
        expect(await asDb(s, () => s.rows(`select player_a, player_b from matches where id = $1`, [made.match_id]))).toEqual([{ player_a: S1, player_b: S2 }]);
      });
    });

    it("a player is in one match at a time, however the second one would be made", async () => {
      await game(async (s) => {
        await matchOf(s, S1, S2);
        // What a pairing that raced past the checks would do.
        await asDb(s, async () => {
          expect(code(await s.attempt(`select public.game_create_match('friend', $1, $2, $3, $4, null, null)`, [BANK.subject, BANK.level, S3, S1]))).toBe("EG002");
        });
      });
    });

    it("leaving the queue, and a place nobody refreshed for two minutes, are not paired", async () => {
      await game(async (s) => {
        await call(s, S1, `public.join_queue($1)`, [group]);
        await call(s, S1, `public.leave_queue()`);
        expect(await call(s, S2, `public.join_queue($1)`, [group])).toHaveProperty("queued_at");
        await pass(s, 121);
        expect(await call(s, S3, `public.join_queue($1)`, [group])).toHaveProperty("queued_at");
        expect(await asDb(s, () => s.rows(`select profile_id from match_queue`))).toEqual([{ profile_id: S3 }]);
      });
    });
  });

  describe("practice against the computer", () => {
    it("opens after 30 seconds of waiting, and never pays", async () => {
      await game(async (s) => {
        expect(await refused(s, S1, `public.start_practice()`)).toBe("EG005");
        await call(s, S1, `public.join_queue($1)`, [group]);
        await pass(s, 29);
        expect(await refused(s, S1, `public.start_practice()`)).toBe("EG005");
        await pass(s, 1);
        const match = (await call<{ match_id: string }>(s, S1, `public.start_practice()`)).match_id;
        expect(await asDb(s, () => s.rows(`select kind, player_b, coins_eligible from matches where id = $1`, [match]))).toEqual([{ kind: "practice", player_b: null, coins_eligible: false }]);
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from match_queue`))).toEqual([{ n: 0 }]);
        await pass(s, 3);
        expect(await state(s, S1, match)).toMatchObject({ kind: "practice", opponent: { computer: true, name: null }, coins_eligible: false });

        // The computer answers 3 to 8 seconds in. Before that it has not answered, and what it will answer is not told.
        await pass(s, 2.9);
        const early = await state(s, S1, match);
        expect(early.answered?.opponent).toBe(false);
        expect(JSON.stringify(early)).not.toMatch(/correct|opponent_option/);
        const planned = await asDb(s, () => s.rows<{ ms_taken: number }>(`select ms_taken from match_answers where match_id = $1 and player = 'b'`, [match]));
        expect(planned).toHaveLength(1);
        expect(planned[0].ms_taken).toBeGreaterThanOrEqual(3000);
        expect(planned[0].ms_taken).toBeLessThanOrEqual(8000);
        await pass(s, 5.2);
        expect((await state(s, S1, match)).answered?.opponent).toBe(true);

        // The student wins every question the computer gets wrong or is slower on: play it out.
        let view = await state(s, S1, match);
        for (let i = 0; i < 10 && view.status !== "finished"; i++) {
          await pass(s, 0.5);
          const answer = await submit(s, S1, match, view.current_index, "a");
          view = answer.state;
          if (view.status !== "finished") {
            await pass(s, 10);
            view = await call<State>(s, S1, `public.advance_match($1)`, [match]);
            await pass(s, 2);
            view = await state(s, S1, match);
          }
        }
        expect(view.status).toBe("finished");
        expect(view.result).toMatchObject({ rewarded: false, coins: 0 });
        expect(await coinsOf(s, students[0])).toBe(0);
        expect(await call(s, S1, `public.game_lobby($1)`, [group])).toMatchObject({ recent: [expect.objectContaining({ computer: true, opponent: null, coins: 0 })] });
      });
    });

    it("the computer is right about 60% of the time", async () => {
      await game(async (s) => {
        await asDb(s, async () => {
          const match = (await s.rows<{ id: string }>(`select public.game_create_match('practice', $1, $2, $3, null, null, null) as id`, [BANK.subject, BANK.level, S1]))[0].id;
          const question = (await s.rows<{ id: string }>(`select question_ids[1] as id from matches where id = $1`, [match]))[0].id;
          let right = 0;
          const tries = 400;
          for (let i = 0; i < tries; i++) {
            await s.rows(`delete from match_answers where match_id = $1`, [match]);
            await s.rows(`select public.game_computer_answer($1, 0, $2, now())`, [match, question]);
            const row = (await s.rows<{ is_correct: boolean; option_id: string }>(`select is_correct, option_id from match_answers where match_id = $1`, [match]))[0];
            expect(row.is_correct).toBe(row.option_id === "a");
            if (row.is_correct) right++;
          }
          // 60% of 400 is 240; five standard deviations either way is about 49.
          expect(right).toBeGreaterThan(190);
          expect(right).toBeLessThan(290);
        });
      });
    });
  });

  describe("classmate challenges", () => {
    it("a student challenges a classmate; accepting within 60 seconds starts a friend match for coins", async () => {
      await game(async (s) => {
        const classmates = await (async () => {
          await actAs(s, S1);
          return s.rows<{ profile_id: string; display_name: string }>(`select * from public.game_classmates($1)`, [group]);
        })();
        expect(classmates.map((row) => row.profile_id).sort()).toEqual([S2, S3].sort());
        const invite = await call<string>(s, S1, `public.send_invite($1, $2)`, [S2, group]);
        // Both see it; nobody else does.
        expect(await call(s, S2, `public.game_lobby($1)`, [group])).toMatchObject({ invites: [{ id: invite, subject: BANK.subject, level: BANK.level, from: expect.any(String) }] });
        await actAs(s, S3);
        expect(await s.rows(`select id from match_invites`)).toEqual([]);
        expect(await refused(s, S3, `public.answer_invite($1, true)`, [invite])).toBe(DENIED);

        await pass(s, 59);
        const accepted = await call<{ match_id: string }>(s, S2, `public.answer_invite($1, true)`, [invite]);
        expect(await asDb(s, () => s.rows(`select kind, player_a, player_b, coins_eligible, group_a, group_b from matches where id = $1`, [accepted.match_id]))).toEqual([
          { kind: "friend", player_a: S1, player_b: S2, coins_eligible: true, group_a: group, group_b: group },
        ]);
        // The challenger learns of it from the invite itself.
        await actAs(s, S1);
        expect(await s.rows(`select status, match_id from match_invites where id = $1`, [invite])).toEqual([{ status: "accepted", match_id: accepted.match_id }]);
        // It cannot be answered twice.
        expect(await call(s, S2, `public.answer_invite($1, true)`, [invite])).toEqual({ match_id: null, expired: true });
      });
    });

    it("a challenge expires after 60 seconds, can be declined, and a new one replaces the last", async () => {
      await game(async (s) => {
        const first = await call<string>(s, S1, `public.send_invite($1, $2)`, [S2, group]);
        await pass(s, 60);
        expect(await call(s, S2, `public.answer_invite($1, true)`, [first])).toEqual({ match_id: null, expired: true });
        expect(await asDb(s, () => s.rows(`select status from match_invites where id = $1`, [first]))).toEqual([{ status: "expired" }]);
        expect(await call(s, S2, `public.game_lobby($1)`, [group])).toMatchObject({ invites: [] });

        const second = await call<string>(s, S1, `public.send_invite($1, $2)`, [S2, group]);
        expect(await call(s, S2, `public.answer_invite($1, false)`, [second])).toEqual({ match_id: null });
        const third = await call<string>(s, S1, `public.send_invite($1, $2)`, [S2, group]);
        const fourth = await call<string>(s, S1, `public.send_invite($1, $2)`, [S3, group]);
        expect(await asDb(s, () => s.rows(`select id, status from match_invites where id in ($1, $2, $3) order by created_at, status`, [second, third, fourth]))).toEqual(
          expect.arrayContaining([{ id: second, status: "declined" }, { id: third, status: "expired" }, { id: fourth, status: "pending" }]),
        );
        // The job expires what nobody answered.
        await pass(s, 61);
        await asDb(s, () => s.rows(`select public.close_abandoned_matches()`));
        expect(await asDb(s, () => s.rows(`select status from match_invites where id = $1`, [fourth]))).toEqual([{ status: "expired" }]);
        expect(await asDb(s, () => s.rows(`select count(*)::int as n from matches`))).toEqual([{ n: 0 }]);
      });
    });

    it("challenges are for students and their classmates only", async () => {
      await game(async (s) => {
        // An App user cannot challenge, list classmates or be challenged.
        expect(await refused(s, A1, `public.send_invite($1, null)`, [A2])).toBe(DENIED);
        expect(await refused(s, A1, `public.game_classmates($1)`, [group])).toBe(DENIED);
        expect(await refused(s, S1, `public.send_invite($1, $2)`, [A1, group])).toBe("EG004");
        // Someone from another group is not a classmate; oneself is not either.
        expect(await refused(s, S1, `public.send_invite($1, $2)`, [S4, group])).toBe("EG004");
        expect(await refused(s, S1, `public.send_invite($1, $2)`, [S1, group])).toBe("EG004");
        // From a group that is not one's own.
        expect(await refused(s, S1, `public.send_invite($1, $2)`, [S4, topikGroup])).toBe(DENIED);
        // A challenge needs ten questions, not the full bank.
        await asDb(s, () => s.rows(`update questions set is_active = false where subject = $1 and id not in (select id from questions where subject = $1 order by id limit 9)`, [BANK.subject]));
        expect(await refused(s, S1, `public.send_invite($1, $2)`, [S2, group])).toBe("EG001");
      });
    });

    it("a player in a match cannot start another", async () => {
      await game(async (s) => {
        const match = await matchOf(s, S1, S2);
        expect(await refused(s, S1, `public.send_invite($1, $2)`, [S3, group])).toBe("EG002");
        // Play now leads back to the match in progress.
        expect(await call(s, S1, `public.join_queue($1)`, [group])).toEqual({ match_id: match });
        expect(await call(s, S1, `public.start_practice()`)).toEqual({ match_id: match });
        const invite = await call<string>(s, S3, `public.send_invite($1, $2)`, [S1, group]);
        expect(await refused(s, S1, `public.answer_invite($1, true)`, [invite])).toBe("EG002");
      });
    });
  });

  describe("the lobby", () => {
    it("shows today's rewarded wins and the last matches, with the coins each paid", async () => {
      await game(async (s) => {
        await quickWin(s, S1, S2);
        await quickWin(s, S2, S1);
        const lobby = await call<{ recent: Array<Record<string, unknown>> }>(s, S1, `public.game_lobby($1)`, [group]);
        expect(lobby).toMatchObject({ subject: BANK.subject, level: BANK.level, random_open: true, challenge_open: true, coins: true, win_coins: 5, daily_rewarded_wins: 5, rewarded_wins_today: 1, active_match_id: null, queued_at: null });
        expect(lobby.recent).toHaveLength(2);
        expect(lobby.recent.map((row) => [row.outcome, row.coins, row.kind, row.computer])).toEqual(expect.arrayContaining([["win", 5, "random", false], ["loss", 0, "random", false]]));
        // An App user's lobby never promises coins.
        expect(await call(s, A1, `public.game_lobby()`)).toMatchObject({ subject: "TOPIK", level: "topik1", coins: false, challenge_open: false, rewarded_wins_today: 0, recent: [] });
      });
    });
  });

  describe("the question bank", () => {
    const options = `'[{"id":"a","text":"One"},{"id":"b","text":"Two"}]'`;
    /** The seed teacher's own subject, and a question in it and in another subject. */
    const bank = async (s: Session) => {
      await setup(s);
      const subject = (await s.rows<{ subject: string }>(`select subjects[1] as subject from teachers where id = (select teacher_id from profiles where id = $1)`, [TEACHER_USER_ID]))[0].subject;
      const own = (await s.rows<{ id: string }>(`insert into questions (subject, level, text, options, correct_option_id) values ($1, 'B2', 'Own subject', ${options}, 'a') returning id`, [subject]))[0].id;
      return { subject, own };
    };

    it("a teacher reads, writes and edits the questions of their own subjects only", async () => {
      let fixture = { subject: "", own: "" };
      await as({ userId: TEACHER_USER_ID }, async (s) => {
        const { subject, own } = fixture;
        expect((await s.rows<{ subject: string }>(`select distinct subject from questions`)).map((row) => row.subject)).toEqual([subject]);
        // A new question is theirs, starts unused and is on, whatever they send.
        const made = await s.rows(
          `insert into questions (subject, level, text, options, correct_option_id, is_active, times_used, times_correct, created_by)
           values ($1, 'B2', 'New', ${options}, 'b', false, 50, 50, $2) returning is_active, times_used, times_correct, created_by`,
          [subject, OWNER_ID],
        );
        expect(made).toEqual([{ is_active: true, times_used: 0, times_correct: 0, created_by: TEACHER_USER_ID }]);
        expect(code(await s.attempt(`update questions set text = 'Edited', correct_option_id = 'b' where id = $1`, [own]))).toBe("allowed");
        // Not another subject's, by insert or by moving one there.
        expect(code(await s.attempt(`insert into questions (subject, level, text, options, correct_option_id) values ($1, $2, 'X', ${options}, 'a')`, [BANK.subject, BANK.level]))).toBe(DENIED);
        expect(code(await s.attempt(`update questions set subject = $2 where id = $1`, [own, BANK.subject]))).toBe(DENIED);
        // On and off is staff's, archiving the owner's, and the counters nobody's.
        expect(code(await s.attempt(`update questions set is_active = false where id = $1`, [own]))).toBe(DENIED);
        expect(code(await s.attempt(`update questions set archived_at = now() where id = $1`, [own]))).toBe(DENIED);
        await s.rows(`update questions set times_used = 99, times_correct = 99 where id = $1`, [own]);
        expect(await s.rows(`select times_used, times_correct from questions where id = $1`, [own])).toEqual([{ times_used: 0, times_correct: 0 }]);
        expect(code(await s.attempt(`delete from questions where id = $1`, [own]))).toBe(DENIED);
        // Their banks, and nobody else's.
        const banks = await s.rows<{ subject: string }>(`select * from public.game_banks()`);
        expect(banks.length).toBeGreaterThan(0);
        expect(banks.every((row) => row.subject === subject || row.subject !== BANK.subject)).toBe(true);
        expect(banks.some((row) => row.subject === BANK.subject)).toBe(false);
        expect(code(await s.attempt(`insert into question_imports (file_name, rows, created) values ('x.csv', 1, 1)`))).toBe(DENIED);
      }, async (s) => {
        fixture = await bank(s);
      });
    });

    it("a question needs two to four choices, each with a text, and a right answer among them", async () => {
      await as("manager", async (s) => {
        const insert = (choices: string, right: string) =>
          s.attempt(`insert into questions (subject, level, text, options, correct_option_id) values ('S', 'L', 'T', $1, $2)`, [choices, right]);
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"b","text":"Two"}]`, "a"))).toBe("allowed");
        expect(code(await insert(`[{"id":"a","text":"One"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"1"},{"id":"b","text":"2"},{"id":"c","text":"3"},{"id":"d","text":"4"},{"id":"e","text":"5"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"a","text":"Two"}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"b","text":" "}]`, "a"))).toBe("23514");
        expect(code(await insert(`[{"id":"a","text":"One"},{"id":"b","text":"Two"}]`, "c"))).toBe("23514");
        expect(code(await insert(`{"a":"One"}`, "a"))).toBe("23514");
      }, setup);
    });

    it("managers see every question and switch it on or off; only the owner archives; imports are logged by staff", async () => {
      let fixture = { subject: "", own: "" };
      await as("manager", async (s) => {
        const { own } = fixture;
        expect(await s.count("questions")).toBe(113);
        expect(code(await s.attempt(`update questions set is_active = false where id = $1`, [own]))).toBe("allowed");
        expect(code(await s.attempt(`update questions set archived_at = now() where id = $1`, [own]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into question_imports (file_name, rows, created, errors) values ('bank.xlsx', 12, 10, '[{"row":3,"error":"noText"}]')`))).toBe("allowed");
        expect(code(await s.attempt(`insert into question_imports (file_name, rows, created, imported_by) values ('bank.xlsx', 1, 1, $1)`, [OWNER_ID]))).toBe(DENIED);
        expect(await s.rows(`select file_name, rows, created, imported_by from question_imports`)).toEqual([{ file_name: "bank.xlsx", rows: 12, created: 10, imported_by: MANAGER_ID }]);
        // Every bank with how many questions are on: the two TOPIK banks are always listed.
        const banks = await s.rows<{ subject: string; level: string; active_questions: number }>(`select * from public.game_banks()`);
        expect(banks).toEqual(expect.arrayContaining([
          { subject: "TOPIK", level: "topik1", active_questions: 40 },
          { subject: "TOPIK", level: "topik2", active_questions: 12 },
          { subject: BANK.subject, level: BANK.level, active_questions: 60 },
        ]));
        await actAs(s, OWNER_ID);
        expect(code(await s.attempt(`update questions set archived_at = now() where id = $1`, [own]))).toBe("allowed");
        // An archived or switched-off question is no longer drawn or counted.
        expect((await s.rows<{ n: number }>(`select count(*)::int as n from public.game_banks() where active_questions > 0 and subject = $1`, [fixture.subject]))[0].n).toBe(0);
      }, async (s) => {
        fixture = await bank(s);
      });
    });

    it("which bank a group plays: TOPIK by its level, subject or name, otherwise its own subject and level", async () => {
      await as("manager", async (s) => {
        const of = async (subject: string, level: string | null, name: string) => (await s.rows(`select * from public.game_bank_of($1, $2, $3)`, [subject, level, name]))[0];
        expect(await of("Koreys tili", "TOPIK II", "K-21")).toEqual({ subject: "TOPIK", level: "topik2" });
        expect(await of("Koreys tili", "topik 1", "K-22")).toEqual({ subject: "TOPIK", level: "topik1" });
        expect(await of("TOPIK I", null, "Morning")).toEqual({ subject: "TOPIK", level: "topik1" });
        expect(await of("Koreys tili", null, "TOPIK II · Kechki")).toEqual({ subject: "TOPIK", level: "topik2" });
        // The level decides before the name does.
        expect(await of("Koreys tili", "TOPIK I", "Future TOPIK II")).toEqual({ subject: "TOPIK", level: "topik1" });
        expect(await of("Matematika", "7-sinf", "M-7")).toEqual({ subject: "Matematika", level: "7-sinf" });
        // The numeral is a whole word: an ordinary word after TOPIK, or another numeral, is not a level.
        expect(await of("TOPIK imtihoni", null, "Kechki")).toEqual({ subject: "TOPIK imtihoni", level: "" });
        expect(await of("Koreys tili", "TOPIK IV", "K-4")).toEqual({ subject: "Koreys tili", level: "TOPIK IV" });
        expect(await of("Koreys tili", null, "TOPIK intensiv")).toEqual({ subject: "Koreys tili", level: "" });
        expect(await of("TOPIK imtihoni", "TOPIK II", "Kechki")).toEqual({ subject: "TOPIK", level: "topik2" });
        expect(await of("Koreys tili", "TOPIK 1-daraja", "K")).toEqual({ subject: "TOPIK", level: "topik1" });
        expect(await of(" Matematika ", null, "M")).toEqual({ subject: "Matematika", level: "" });
      }, setup);
    });
  });

  describe("two answers at the same moment", () => {
    const marker = `Race ${Date.now()}`;
    const [P1, P2] = [U(101), U(102)];
    let setupDb: pg.Client;
    let one: pg.Client;
    let two: pg.Client;

    const asPlayer = async (db: pg.Client, user: string) => {
      await db.query("begin");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
      await db.query("set local role authenticated");
    };
    const cleanup = async () => {
      await setupDb.query(`delete from matches where subject = $1`, [marker]);
      await setupDb.query(`delete from questions where subject = $1`, [marker]);
      await setupDb.query(`delete from leads where id in (select lead_id from profiles where id in ($1, $2))`, [P1, P2]).catch(() => {});
      await setupDb.query(`delete from auth.users where id in ($1, $2)`, [P1, P2]);
    };

    beforeAll(async () => {
      if (!DB_URL) return;
      [setupDb, one, two] = [new pg.Client({ connectionString: DB_URL }), new pg.Client({ connectionString: DB_URL }), new pg.Client({ connectionString: DB_URL })];
      await Promise.all([setupDb.connect(), one.connect(), two.connect()]);
      await cleanup();
    });
    afterAll(async () => {
      if (!DB_URL) return;
      await cleanup();
      await Promise.all([setupDb.end(), one.end(), two.end()]);
    });

    it("two submits for one question count once", async () => {
      for (const [user, phone] of [[P1, "998770003101"], [P2, "998770003102"]]) {
        await setupDb.query(`insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), '{"full_name":"Race Player"}')`, [user, phone]);
      }
      await setupDb.query(questions(marker, "L", 10));
      const match = (await setupDb.query(`select public.game_create_match('random', $1, 'L', $2, $3, null, null) as id`, [marker, P1, P2])).rows[0].id as string;
      // The first question is on screen.
      await setupDb.query(`update matches set question_started_at = now() - interval '1 second' where id = $1`, [match]);

      // The same player taps two different choices at once, on two connections. The first is not committed yet.
      await asPlayer(one, P1);
      await asPlayer(two, P1);
      const first = (await one.query(`select public.submit_answer($1, 0, 'a') as r`, [match])).rows[0].r as Answer;
      let settled = false;
      const waiting = two
        .query(`select public.submit_answer($1, 0, 'b') as r`, [match])
        .then((result) => result.rows[0].r as Answer)
        .finally(() => (settled = true));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blocked = !settled;
      await one.query("commit");
      const second = await waiting;
      await two.query("commit");

      expect(blocked).toBe(true);
      expect(first).toMatchObject({ accepted: true, is_correct: true });
      expect(second).toMatchObject({ accepted: false, reason: "already" });
      const { rows } = await setupDb.query(`select player, option_id, is_correct from match_answers where match_id = $1`, [match]);
      expect(rows).toEqual([{ player: "a", option_id: "a", is_correct: true }]);

      // The other player answers; the question is settled once, and its counters move once.
      await asPlayer(one, P2);
      await one.query(`select public.submit_answer($1, 0, 'b')`, [match]);
      await one.query("commit");
      const after = await setupDb.query(
        `select m.rope, m.current_index, (select times_used from questions where id = m.question_ids[1]) as used, (select times_correct from questions where id = m.question_ids[1]) as correct
         from matches m where m.id = $1`,
        [match],
      );
      expect(after.rows).toEqual([{ rope: 1, current_index: 1, used: 2, correct: 1 }]);
    });
  });
});
