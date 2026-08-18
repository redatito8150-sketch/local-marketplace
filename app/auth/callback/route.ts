import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decidePostAuthDestination } from "@/lib/auth/postAuthDestination";

// Same cookie override as lib/supabase/server.ts and proxy.ts — kept in
// sync manually since a Route Handler can't share the Server Component
// helper (cookies() is used for direct mutation here, not just reads).
const AUTH_COOKIE_OPTIONS = {
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

// Standard Supabase SSR/PKCE OAuth callback for the App Router: the
// browser client's signInWithOAuth() call set a PKCE code_verifier cookie
// before redirecting to Google; Google/Supabase redirect back here with
// `?code=...` (and whatever `next` we asked it to echo back), and this
// exchanges that code for a session using the same cookie-backed client so
// the resulting session cookies land in the response Next.js actually
// sends back to the browser.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const nextParam = url.searchParams.get("next");
  const origin = url.origin;

  // Covers both explicit provider denial ("access_denied" when the user
  // cancels the Google consent screen) and any other error Supabase
  // reports before issuing a code — never forward the raw description.
  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}/account?error=oauth_failed`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/account?error=oauth_failed`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
        );
      },
    },
  });

  // exchangeCodeForSession covers an invalid, expired, or already-used
  // code (PKCE code_verifier mismatch, retried/replayed callback, etc) —
  // all surface as `error` here, not a thrown exception. Deliberately not
  // logging `code` or anything off `data.session` (access/refresh tokens).
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/account?error=oauth_failed`);
  }

  // The existing `on_auth_user_created` trigger (supabase/schema.sql)
  // already inserted the profiles row synchronously as part of the same
  // auth.users insert Supabase's server performed during the code
  // exchange above — nothing here creates or duplicates a profile. A
  // missing row (trigger removed/failed in some future change) degrades
  // safely: onboarding_completed_at reads as null, which just sends the
  // user through onboarding rather than erroring.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, is_admin, role")
    .eq("id", data.user.id)
    .maybeSingle();

  const destination = decidePostAuthDestination({
    onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
    isAdmin: profile?.is_admin ?? false,
    role: profile?.role ?? "customer",
  }, nextParam);
  return NextResponse.redirect(`${origin}${destination}`);
}
