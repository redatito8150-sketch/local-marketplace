import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaUserState, type MfaUserState } from "@/lib/supabase/mfaAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Parallel to requireAdminUser() but for any signed-in customer — "is
// someone signed in," nothing more. Every account/brand-follow/wishlist
// write route calls this first; the app/account layout's redirect is a UX
// nicety, not the security boundary, same convention as the admin gate.
export async function getUserAuthState(): Promise<MfaUserState> {
  const supabase = await createSupabaseServerClient();
  return getMfaUserState(supabase);
}

export async function requireUser(): Promise<User | null> {
  const authState = await getUserAuthState();
  return authState.status === "authenticated" ? authState.user : null;
}

export type RecentUserAuthState =
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated"; user: null }
  | { status: "mfa_required" | "assurance_unavailable" | "recent_auth_required"; user: User };

// Destructive/sensitive operations need more than a currently valid access
// token. getClaims() verifies the JWT and supplies its real Auth session_id;
// the service-only RPC then checks the immutable auth.sessions.created_at so
// an ordinary access-token refresh cannot masquerade as a fresh login.
export async function getRecentUserAuthState(): Promise<RecentUserAuthState> {
  const supabase = await createSupabaseServerClient();
  const authState = await getMfaUserState(supabase);
  if (authState.status !== "authenticated") return authState;

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const sessionId = claims?.session_id;
  if (
    claimsError ||
    claims?.sub !== authState.user.id ||
    typeof sessionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
  ) {
    return { status: "assurance_unavailable", user: authState.user };
  }

  const { data: recent, error: recentError } = await supabaseAdmin.rpc(
    "is_recent_auth_session",
    { p_user_id: authState.user.id, p_session_id: sessionId }
  );
  if (recentError) return { status: "assurance_unavailable", user: authState.user };
  if (recent !== true) return { status: "recent_auth_required", user: authState.user };
  return authState;
}
