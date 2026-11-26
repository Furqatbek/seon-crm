import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Staff: the people who run the centre. */
export type UserRole = "owner" | "manager";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

/** Anyone who can sign in: staff, or a teacher with their own small area. */
export type SignedInUser = CurrentUser | (Omit<CurrentUser, "role"> & { role: "teacher"; teacherId: string });

/**
 * The signed-in user, or null. The session token's signature is verified
 * (getClaims: on the server itself when the project signs tokens with
 * asymmetric keys, with one call to Supabase Auth otherwise), and the name,
 * role and active flag come from the user's profiles row, read through Row
 * Level Security on every request. So the database, not the token, decides
 * who someone is: a deactivated user, or one whose profile the owner has not
 * activated yet, is treated as signed out. Cached for one render.
 */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const read = await supabase
    .from("profiles")
    .select("full_name, role, is_active, teacher_id")
    .eq("id", claims.sub)
    .maybeSingle();
  let profile = read.data;
  if (read.error?.code === "42703") {
    // The app was deployed before the teacher-login migration was applied:
    // profiles has no teacher_id yet. Staff must still be able to sign in.
    const before = await supabase.from("profiles").select("full_name, role, is_active").eq("id", claims.sub).maybeSingle();
    profile = before.data ? { ...before.data, teacher_id: null } : null;
  }
  if (!profile || !profile.is_active) return null;

  const base = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName: profile.full_name,
  };
  if (profile.role === "teacher") {
    return profile.teacher_id ? { ...base, role: "teacher", teacherId: profile.teacher_id } : null;
  }
  // Students and app users sign in to the mobile app, and a kiosk only to the
  // reception scanner: none of them is staff here.
  if (profile.role !== "owner" && profile.role !== "manager") return null;
  return { ...base, role: profile.role };
});

/**
 * The signed-in staff member (owner or manager), or null. Every staff page
 * and action asks this, so a teacher gets nothing from them; the database
 * refuses a teacher the same data on its own.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getSignedInUser();
  return user && user.role !== "teacher" ? user : null;
});

export type CheckinUser = { id: string; fullName: string; role: UserRole | "kiosk" };

/**
 * Whoever may use the reception scanner at /checkin: a kiosk account (which
 * can open nothing else), the owner or a manager. The database asks the same
 * question again inside verify_checkin().
 */
export const getCheckinUser = cache(async (): Promise<CheckinUser | null> => {
  const staff = await getCurrentUser();
  if (staff) return { id: staff.id, fullName: staff.fullName, role: staff.role };
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const profile = await supabase.from("profiles").select("full_name, role, is_active").eq("id", id).maybeSingle();
  if (!profile.data?.is_active || profile.data.role !== "kiosk") return null;
  return { id, fullName: profile.data.full_name, role: "kiosk" };
});

/** The signed-in teacher, or null. */
export const getTeacherUser = cache(async () => {
  const user = await getSignedInUser();
  return user?.role === "teacher" ? user : null;
});
