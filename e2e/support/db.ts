import { existsSync } from "node:fs";

import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * Direct database access for test fixtures only: putting a seeded record back
 * into a known state so a test can be run again. Never used by the app.
 */
export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set (see .env.example)");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Fixed ids from supabase/seed.sql. */
export const seedStudentId = (n: number) => `00000004-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * A lesson of the group on today's date: attendance is marked on the day of
 * the lesson only. If the group has none today, its next lesson is brought
 * forward; call `restore` to put it back.
 */
export async function lessonToday(groupId: string): Promise<{ id: string; restore: () => Promise<void> }> {
  return withDb(async (db) => {
    const today = await db.query(
      "select id from lessons where group_id = $1 and status <> 'cancelled' and lesson_date = public.tashkent_today() limit 1",
      [groupId],
    );
    if (today.rows.length > 0) return { id: today.rows[0].id as string, restore: async () => {} };
    const moved = await db.query(
      `with next as (select id, lesson_date::text as original from lessons
                     where group_id = $1 and status <> 'cancelled' and lesson_date > public.tashkent_today() order by lesson_date limit 1)
       update lessons l set lesson_date = public.tashkent_today() from next where l.id = next.id
       returning l.id, next.original`,
      [groupId],
    );
    const { id, original } = moved.rows[0] as { id: string; original: string };
    return {
      id,
      restore: () => withDb((again) => again.query("update lessons set lesson_date = $2 where id = $1", [id, original])).then(() => {}),
    };
  });
}
