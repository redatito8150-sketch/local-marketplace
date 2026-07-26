import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Web requests keep using their secure cookie session. Native clients send
// the Supabase access token, which is verified by Auth before it is trusted.
export async function getRequestUser(request: NextRequest): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    return error ? null : data.user;
  }
  return requireUser();
}
