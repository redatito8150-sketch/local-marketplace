import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Parallel to requireAdminUser() but for any signed-in customer — "is
// someone signed in," nothing more. Every account/brand-follow/wishlist
// write route calls this first; the app/account layout's redirect is a UX
// nicety, not the security boundary, same convention as the admin gate.
export async function requireUser(): Promise<User | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
