import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local (see .env.local.example)."
  );
}

// @supabase/ssr's own cookie serialization doesn't set sameSite/secure
// explicitly, leaving auth cookies to whatever the browser/Next default is.
// Pin them here rather than rely on that implicit default — matches the
// same override in proxy.ts, which is the other place this project sets
// these cookies.
const AUTH_COOKIE_OPTIONS = {
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

// Cookie-backed client for Server Components and Route Handlers. Still only
// carries the anon key — RLS decides what it can read/write. Use this (not
// the browser client) anywhere you need to know the current request's
// signed-in user on the server, e.g. to attach `user_id` to a new order.
// Async since Next 15+ — `cookies()` itself is now a Promise.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
          );
        } catch {
          // Called from a Server Component render — middleware already
          // refreshes the session cookie, so this can be safely ignored.
        }
      },
    },
  });
}
