"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Phone } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import CaptchaWidget, { type CaptchaWidgetHandle } from "@/components/account/CaptchaWidget";

const CAPTCHA_REQUIRED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function AccountPage() {
  const { user, profile, loading, mfaChallenge, signIn, signUp, verifyMfaChallenge } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const captchaRef = useRef<CaptchaWidgetHandle>(null);

  // Once signed in, the dashboard shell at /account/(dashboard) takes over —
  // this page's job is only the anonymous sign-in/sign-up form. A brand-new
  // account (profile loaded, onboarding never marked complete) gets routed
  // through the one-time "add a delivery address / skip" step instead —
  // wait for profile to actually load so a returning user with it already
  // set isn't sent through onboarding on this one tick. A pending MFA
  // challenge blocks the redirect entirely until it's cleared.
  useEffect(() => {
    if (!user || loading || mfaChallenge) return;
    if (profile && !profile.onboardingCompletedAt) {
      router.replace("/onboarding/add-address");
    } else if (profile) {
      router.replace("/account/overview");
    }
  }, [user, profile, loading, mfaChallenge, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      if (!acceptedTerms) {
        setError("Please accept the Terms and Privacy Policy to continue");
        return;
      }
      if (CAPTCHA_REQUIRED && !captchaToken) {
        setError("Please complete the verification challenge");
        return;
      }
    }

    setSubmitting(true);
    setError("");
    setConfirmationMessage("");

    const result =
      mode === "sign-in"
        ? await signIn(email, password)
        : await signUp(fullName, email, phone, password, captchaToken || undefined);

    if (result.error) {
      setError(result.error);
      // A Turnstile token is single-use — whether signUp succeeded or
      // failed, the token just spent is no longer valid, so the widget
      // must issue a fresh one before the user can retry.
      if (mode === "create") {
        captchaRef.current?.reset();
        setCaptchaToken("");
      }
    } else if (result.needsEmailConfirmation) {
      setConfirmationMessage(
        "Check your inbox to confirm your account before signing in."
      );
    }
    setSubmitting(false);
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await verifyMfaChallenge(mfaCode);
    if (result.error) setError(result.error);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-cream">
        <Header />
        <div className="mx-auto max-w-screen2xl px-8 py-24 text-center text-sm text-ink-soft/60 lg:px-12">
          Loading…
        </div>
        <Footer />
      </main>
    );
  }

  if (user && mfaChallenge) {
    return (
      <main className="min-h-screen bg-cream">
        <Header />
        <section className="mx-auto flex max-w-screen2xl flex-col items-center px-8 py-16 lg:px-12 lg:py-24">
          <h1 className="text-2xl font-bold tracking-tightest text-ink">
            Enter your authenticator code
          </h1>
          <p className="mt-2 text-sm text-ink-soft/60">
            Open your authenticator app and enter the 6-digit code.
          </p>
          <form onSubmit={handleMfaSubmit} className="mt-9 w-full max-w-sm space-y-4">
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="w-full rounded-md border border-stone-150 bg-white py-3 px-4 text-center text-[18px] tracking-[0.3em] text-ink outline-none focus:border-ink/30"
            />
            {error && (
              <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Verifying…" : "Verify"}
            </button>
          </form>
        </section>
        <Footer />
      </main>
    );
  }

  if (user) {
    // The useEffect above already kicked off the redirect — this only
    // covers the one-tick gap before it lands.
    return (
      <main className="min-h-screen bg-cream">
        <Header />
        <div className="mx-auto max-w-screen2xl px-8 py-24 text-center text-sm text-ink-soft/60 lg:px-12">
          Taking you to your account…
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto flex max-w-screen2xl flex-col items-center px-8 py-16 lg:px-12 lg:py-24">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
          <User className="h-6 w-6 text-ink-soft/60" strokeWidth={1.6} />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tightest text-ink">
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft/60">
          {mode === "sign-in"
            ? "Sign in to view your orders and wishlist."
            : "Join Local to save your favorites and track orders."}
        </p>

        <form onSubmit={handleSubmit} className="mt-9 w-full max-w-sm space-y-4">
          {mode === "create" && (
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <input
                type="text"
                placeholder="Full name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <input
              type="email"
              placeholder="Email address"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </div>

          {mode === "create" && (
            <div className="relative">
              <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <input
                type="tel"
                placeholder="Phone number"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
              />
            </div>
          )}

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </div>

          {mode === "sign-in" && (
            <div className="text-right">
              <Link href="/forgot-password" className="text-[12.5px] font-medium text-ink-soft/60 hover:text-ink hover:underline">
                Forgot password?
              </Link>
            </div>
          )}

          {mode === "create" && (
            <>
              <label className="flex items-start gap-2 text-[12.5px] text-ink-soft/70">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="font-semibold text-ink hover:underline">
                    Terms &amp; Conditions
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-semibold text-ink hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <CaptchaWidget ref={captchaRef} onToken={setCaptchaToken} />
            </>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
              {error}
            </p>
          )}
          {confirmationMessage && (
            <p className="rounded-md bg-stone-100 px-3.5 py-2.5 text-[13px] font-medium text-ink">
              {confirmationMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Please wait…"
              : mode === "sign-in"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-[13px] text-ink-soft/60">
          {mode === "sign-in" ? (
            <>
              New to Local?{" "}
              <button
                onClick={() => {
                  setMode("create");
                  setError("");
                  setConfirmationMessage("");
                }}
                className="font-semibold text-ink hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("sign-in");
                  setError("");
                  setConfirmationMessage("");
                }}
                className="font-semibold text-ink hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <Link
          href="/"
          className="mt-10 text-[12.5px] text-ink-soft/40 hover:text-ink-soft/70"
        >
          ← Back to Local
        </Link>
      </section>

      <Footer />
    </main>
  );
}
