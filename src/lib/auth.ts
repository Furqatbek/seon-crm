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
 * The signed-in staff member, or null. The session is verified with Supabase
 * Auth and the name, role and active flag come from the user's profiles row
 * (cached for the duration of one render). A deactivated user, or one whose
 * profile the owner has not activated yet, is treated as signed out.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile.full_name,
    role: profile.role === "owner" ? "owner" : "manager",
  };
});
