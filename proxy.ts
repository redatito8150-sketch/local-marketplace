import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// @supabase/ssr's own cookie serialization doesn't set sameSite/secure
// explicitly, leaving auth cookies to whatever the browser/Next default is.
// Pin them here rather than rely on that implicit default — matches the
// same override in lib/supabase/server.ts.
const AUTH_COOKIE_OPTIONS = {
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

// Refreshes the Supabase auth session cookie on every request so server
// components/route handlers always see an up-to-date session, per the
// standard @supabase/ssr Next.js App Router pattern. Also forwards the
// current pathname as a request header (x-pathname) — the only way a
// Server Component/layout can know "what page was this" without a client
// hook, used by the account dashboard layout to build a safe `?next=`
// return path when it redirects a signed-out visitor to sign in.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
