import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Every admin Route Handler calls this first and bails if it returns null —
// the app/admin/** layout redirect is a UX nicety, not a security boundary,
// since API routes are directly callable regardless of what the UI shows.
export async function requireAdminUser(): Promise<User | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.is_admin ? user : null;
}
