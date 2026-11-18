import { existsSync } from "node:fs";

import pg from "pg";

// Tests read the same .env.local as the app.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const DB_URL = process.env.SUPABASE_DB_URL;
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "EduCrm-demo-2026";

export const LOGINS = {
  owner: "owner@demo.educrm.uz",
  manager: "manager@demo.educrm.uz",
  // Linked to teacher 2, Nodira Saidova: IELTS 6.5 and English Kids.
  teacher: "teacher@demo.educrm.uz",
} as const;

/** Fixed ids from supabase/seed.sql: uid(kind, n). */
export function uid(kind: number, n: number): string {
  return `${String(kind).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
export const OWNER_ID = uid(1, 1);
export const MANAGER_ID = uid(1, 2);
export const TEACHER_USER_ID = uid(1, 3);
export const teacherId = (n: number) => uid(2, n);
export const groupId = (n: number) => uid(3, n);
export const studentId = (n: number) => uid(4, n);
export const enrollmentId = (n: number) => uid(5, n);
export const leadId = (n: number) => uid(6, n);
export const roomId = (n: number) => uid(7, n);

export type Attempt =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number }
  | { ok: false; code: string; message: string };

export type Session = {
  /** Runs a statement that must succeed and returns its rows. */
  rows: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Runs a statement that may be refused; never throws. */
  attempt: (sql: string, params?: unknown[]) => Promise<Attempt>;
  /** Number of rows this user can see in a table or view. */
  count: (table: string, where?: string) => Promise<number>;
};

type Who = keyof typeof LOGINS | "anon" | { userId: string };

let client: pg.Client | undefined;

export async function connect(): Promise<void> {
  if (!DB_URL) throw new Error("SUPABASE_DB_URL is not set");
  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
}

export async function disconnect(): Promise<void> {
  await client?.end();
}

function makeSession(db: pg.Client): Session {
  let savepoint = 0;
  const attempt: Session["attempt"] = async (sql, params) => {
    const name = `sp_${++savepoint}`;
    await db.query(`savepoint ${name}`);
    try {
      const result = await db.query(sql, params as unknown[]);
      await db.query(`release savepoint ${name}`);
      return { ok: true, rows: result.rows, rowCount: result.rowCount ?? 0 };
    } catch (error) {
      await db.query(`rollback to savepoint ${name}`);
      const { code, message } = error as { code?: string; message: string };
      return { ok: false, code: code ?? "", message };
    }
  };
  return {
    attempt,
    rows: async <T>(sql: string, params?: unknown[]) =>
      (await db.query(sql, params as unknown[])).rows as T[],
    count: async (table, where = "true") => {
      const result = await db.query(`select count(*)::int as n from public.${table} where ${where}`);
      return result.rows[0].n as number;
    },
  };
}

/**
 * Runs `fn` as a signed-in user, the way the Supabase API does it: check the
 * email and password against auth.users, then switch to the `authenticated`
 * role with that user's JWT claims. Everything happens in one transaction
 * that is rolled back, so the database is left exactly as it was.
 *
 * `setup` runs first, as the database owner, to prepare rows inside the same
 * transaction (it is rolled back too).
 */
export async function as<T>(
  who: Who,
  fn: (session: Session) => Promise<T>,
  setup?: (admin: Session) => Promise<void>,
): Promise<T> {
  const db = client;
  if (!db) throw new Error("connect() first");

  await db.query("begin");
  try {
    if (setup) await setup(makeSession(db));

    if (who === "anon") {
      await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      await db.query("set local role anon");
    } else {
      let userId: string;
      if (typeof who === "string") {
        const login = await db.query(
          `select id from auth.users
           where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)`,
          [LOGINS[who], SEED_PASSWORD],
        );
        if (login.rowCount !== 1) throw new Error(`Sign-in failed for ${LOGINS[who]}`);
        userId = login.rows[0].id;
      } else {
        userId = who.userId;
      }
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await db.query("set local role authenticated");
    }
    return await fn(makeSession(db));
  } finally {
    await db.query("rollback");
  }
}

/** Refused by a grant, a row level security policy or a guard trigger. */
export const DENIED = "42501";

/** Runs `fn` as the database owner, in a transaction that is rolled back. */
export async function admin<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const db = client;
  if (!db) throw new Error("connect() first");
  await db.query("begin");
  try {
    return await fn(makeSession(db));
  } finally {
    await db.query("rollback");
  }
}

/**
 * Attendance is marked on the day of the lesson only, and the seed's groups do
 * not meet every day. This gives the group a lesson today: if it has none, its
 * next one is brought forward (committed, so every rolled-back test sees it).
 * Call `restore` when the file is done.
 */
export async function lessonToday(group: string): Promise<{ id: string; restore: () => Promise<void> }> {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const today = await db.query(
      `select id from lessons where group_id = $1 and status <> 'cancelled' and lesson_date = public.tashkent_today() limit 1`,
      [group],
    );
    if (today.rows.length > 0) return { id: today.rows[0].id, restore: async () => {} };
    const moved = await db.query(
      `with next as (select id, lesson_date::text as original from lessons
                     where group_id = $1 and status <> 'cancelled' and lesson_date > public.tashkent_today() order by lesson_date limit 1)
       update lessons l set lesson_date = public.tashkent_today() from next where l.id = next.id
       returning l.id, next.original`,
      [group],
    );
    const { id, original } = moved.rows[0] as { id: string; original: string };
    return {
      id,
      restore: async () => {
        const again = new pg.Client({ connectionString: DB_URL });
        await again.connect();
        await again.query(`update lessons set lesson_date = $2 where id = $1`, [id, original]).finally(() => again.end());
      },
    };
  } finally {
    await db.end();
  }
}
