import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMfaUserState } from "@/lib/supabase/mfaAuth";

export type RequestIdentity =
  | { status: "authenticated"; user: User }
  | { status: "guest"; user: null }
  | { status: "invalid_credentials"; user: null };

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.toLowerCase().includes("-auth-token"));
}

export async function getRequestIdentity(request: NextRequest): Promise<RequestIdentity> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) {
      return { status: "invalid_credentials", user: null };
    }
    const token = authorization.slice(7).trim();
    if (!token) return { status: "invalid_credentials", user: null };
    const authState = await getMfaUserState(supabaseAdmin, token);
    return authState.status === "authenticated"
      ? { status: "authenticated", user: authState.user }
      : { status: "invalid_credentials", user: null };
  }

  const user = await requireUser();
  if (user) return { status: "authenticated", user };
  if (hasSupabaseAuthCookie(request)) {
    return { status: "invalid_credentials", user: null };
  }
  return { status: "guest", user: null };
}

// Web requests keep using their secure cookie session. Native clients send
// the Supabase access token, which is verified by Auth before it is trusted.
export async function getRequestUser(request: NextRequest): Promise<User | null> {
  const identity = await getRequestIdentity(request);
  return identity.status === "authenticated" ? identity.user : null;
}
