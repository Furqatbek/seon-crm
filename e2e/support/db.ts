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
