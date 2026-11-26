#!/usr/bin/env node
// Changes the email a person signs in with. Everything else stays: the same
// account, name, role, password and history.
//
//   node scripts/change-login-email.mjs <old email> <new email>
//   node scripts/change-login-email.mjs <old email> <new email> --yes   (do it)
//
// Without --yes it only shows what it would change.
//
// It works on the database named in .env.local (NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SECRET_KEY), so check the address it prints before adding --yes.
// No confirmation email is sent: the new address works at once, the old one stops.

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const [oldEmail, newEmail] = args.filter((arg) => !arg.startsWith("--")).map((value) => value.trim().toLowerCase());
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!oldEmail || !newEmail) fail("Usage: node scripts/change-login-email.mjs <old email> <new email> [--yes]");
if (!EMAIL.test(oldEmail) || !EMAIL.test(newEmail)) fail("Both must be email addresses.");
if (oldEmail === newEmail) fail("The two addresses are the same.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(`Database: ${new URL(url).host}`);

// Every login, a page at a time, to find the two addresses.
const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail(`Reading the logins: ${error.message}`);
  users.push(...data.users);
  if (data.users.length < 200) break;
}
const user = users.find((entry) => entry.email?.toLowerCase() === oldEmail);
if (!user) fail(`No login has the email ${oldEmail}.`);
if (users.some((entry) => entry.email?.toLowerCase() === newEmail)) fail(`${newEmail} already belongs to another login.`);

const profile = await db.from("profiles").select("full_name, role, is_active").eq("id", user.id).maybeSingle();
console.log(`Login:    ${profile.data?.full_name ?? "(no profile)"} · ${profile.data?.role ?? "—"}${profile.data?.is_active === false ? " · deactivated" : ""}`);
console.log(`Change:   ${oldEmail}  →  ${newEmail}`);

if (!confirmed) {
  console.log("\nNothing was changed. Run it again with --yes to change the email.");
  process.exit(0);
}

const { error } = await db.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: true });
if (error) fail(`The email was not changed: ${error.message}`);
console.log(`✓ Done. Sign in with ${newEmail} and the same password as before.`);
