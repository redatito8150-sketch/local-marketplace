import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildMfaChallengePath,
  isMfaProtectedRequest,
} from "@/lib/auth/mfaPolicy";
import { getMfaUserState } from "@/lib/supabase/mfaAuth";

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
  const authCookieWriters: Array<(target: NextResponse) => void> = [];
  const withAuthCookies = (target: NextResponse) => {
    authCookieWriters.forEach((writeCookies) => writeCookies(target));
    return target;
  };

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
        authCookieWriters.push((target) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            target.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
          );
        });
        response = withAuthCookies(
          NextResponse.next({ request: { headers: requestHeaders } })
        );
      },
    },
  });

  if (!isMfaProtectedRequest(request.nextUrl.pathname, request.method)) {
    await supabase.auth.getUser();
    return response;
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim() || undefined
    : undefined;
  const authState = await getMfaUserState(supabase, bearerToken);

  // Signed-out and invalid-token requests continue to the route's existing
  // authentication response. Only an already verified identity whose AAL
  // is incomplete is intercepted here.
  if (authState.status === "mfa_required") {
    const challengePath = buildMfaChallengePath();
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return withAuthCookies(
        NextResponse.json(
          {
            error: "Multi-factor authentication is required",
            code: "MFA_REQUIRED",
            mfaRequired: true,
            challengeUrl: challengePath,
          },
          {
            status: 403,
            headers: {
              "Cache-Control": "no-store",
              "X-Mahaly-Auth-Challenge": "mfa",
              Vary: "Cookie, Authorization",
            },
          }
        )
      );
    }

    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return withAuthCookies(
      NextResponse.redirect(
        new URL(buildMfaChallengePath(returnTo), request.url)
      )
    );
  }

  if (authState.status === "assurance_unavailable") {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return withAuthCookies(
        NextResponse.json(
          {
            error: "Authentication assurance could not be verified",
            code: "AUTH_ASSURANCE_UNAVAILABLE",
          },
          {
            status: 503,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "5",
              Vary: "Cookie, Authorization",
            },
          }
        )
      );
    }

    const params = new URLSearchParams({
      auth_error: "assurance_unavailable",
      next: `${request.nextUrl.pathname}${request.nextUrl.search}`,
    });
    return withAuthCookies(
      NextResponse.redirect(new URL(`/account?${params.toString()}`, request.url))
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
