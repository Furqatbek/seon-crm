import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "owner" | "manager";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

/**
 * The signed-in staff member, or null. Verified with Supabase Auth on every
 * request (cached for the duration of one render).
 *
 * Until the profiles table exists (Phase 2) the role and name come from the
 * auth user: app_metadata.role, which only the service role can write, and
 * user_metadata.full_name. Anyone without a role is a manager.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { id, email = "", app_metadata, user_metadata } = data.user;
  const fullName =
    typeof user_metadata?.full_name === "string" && user_metadata.full_name.trim() !== ""
      ? user_metadata.full_name.trim()
      : email;

  return {
    id,
    email,
    fullName,
    role: app_metadata?.role === "owner" ? "owner" : "manager",
  };
});
