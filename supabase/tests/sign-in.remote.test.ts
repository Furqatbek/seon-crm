/**
 * The same promise as permissions.test.ts, but through the real front door:
 * Supabase Auth sign-in and the REST API, with the publishable key the
 * browser uses. Runs only when NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set (the dev project with the seed
 * loaded). It only reads.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { LOGINS, SEED_PASSWORD } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function signIn(who: keyof typeof LOGINS): Promise<SupabaseClient> {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({
    email: LOGINS[who],
    password: SEED_PASSWORD,
  });
  if (error) throw new Error(`Sign-in failed for ${LOGINS[who]}: ${error.message}`);
  return supabase;
}

async function count(supabase: SupabaseClient, table: string): Promise<number | string> {
  const { count: rows, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return error ? `error: ${error.message}` : (rows ?? 0);
}

const OWNER_ONLY = ["teacher_pay_rates", "expenses"];
const SHARED = ["leads", "students", "groups", "teachers", "lessons", "attendance", "charges", "payments", "student_balances"];

describe.skipIf(!url || !key)("Sign-in through Supabase Auth and the API", () => {
  it("owner signs in and sees everything, including pay rates and expenses", async () => {
    const owner = await signIn("owner");
    const { data: role } = await owner.rpc("app_role");
    expect(role).toBe("owner");
    for (const table of [...SHARED, ...OWNER_ONLY]) {
      expect(await count(owner, table), table).toBeGreaterThan(0);
    }
  });

  it("manager signs in and gets zero rows from pay rates, expenses and payouts", async () => {
    const manager = await signIn("manager");
    const { data: role } = await manager.rpc("app_role");
    expect(role).toBe("manager");
    for (const table of SHARED) expect(await count(manager, table), table).toBeGreaterThan(0);
    for (const table of [...OWNER_ONLY, "teacher_payouts"]) {
      expect(await count(manager, table), table).toBe(0);
    }
  });

  it("a visitor with only the publishable key reads nothing", async () => {
    const visitor = createClient(url!, key!, { auth: { persistSession: false } });
    for (const table of [...SHARED, ...OWNER_ONLY]) {
      const result = await count(visitor, table);
      expect(typeof result === "string" || result === 0, `${table}: ${result}`).toBe(true);
    }
  });
});
