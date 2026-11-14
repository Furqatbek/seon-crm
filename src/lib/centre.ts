import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * The centre's name from Settings, for the sign-in card and the sidebar.
 * Readable before sign-in (only the name is). Null when it cannot be read,
 * and the app's own name is shown instead.
 */
export const getCentreName = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("centre_name");
  return error || !data ? null : data;
});
