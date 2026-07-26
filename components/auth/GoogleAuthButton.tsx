"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { isGoogleAuthEnabled } from "@/lib/auth/googleAuthFlag";

// Feature flag: the Google button never renders — not even disabled — when
// the provider hasn't actually been configured in Supabase yet, so
// production never shows a control that looks like it works but can't.
const GOOGLE_AUTH_ENABLED = isGoogleAuthEnabled();

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export default function GoogleAuthButton({
  next,
  label = "Continue with Google",
}: {
  next?: string | null;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!GOOGLE_AUTH_ENABLED) return null;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError("");

    const safeNext = getSafeRedirectPath(next, "");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (safeNext) callbackUrl.searchParams.set("next", safeNext);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });

    // A successful call navigates the browser away to Google immediately —
    // this only ever runs on the failure path (network issue, provider not
    // enabled, etc). Never surface the raw Supabase/Google error text.
    if (oauthError) {
      setError("Couldn't start Google sign-in. Please try again or continue with email below.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-stone-150 bg-white py-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {loading ? "Redirecting…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
