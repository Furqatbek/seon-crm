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
 * The signed-in staff member, or null. The session token's signature is
 * verified (getClaims: on the server itself when the project signs tokens
 * with asymmetric keys, with one call to Supabase Auth otherwise), and the
 * name, role and active flag come from the user's profiles row, read through
 * Row Level Security on every request. So the database, not the token, decides
 * whether someone is still staff: a deactivated user, or one whose profile the
 * owner has not activated yet, is treated as signed out. Cached for one render.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName: profile.full_name,
    role: profile.role === "owner" ? "owner" : "manager",
  };
});
