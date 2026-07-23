"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase/client";
import CaptchaWidget, { type CaptchaWidgetHandle } from "@/components/account/CaptchaWidget";

const CAPTCHA_REQUIRED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const captchaRef = useRef<CaptchaWidgetHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Supabase's Attack Protection covers password-recovery requests too,
    // same as sign-in/sign-up.
    if (CAPTCHA_REQUIRED && !captchaToken) {
      setError("Please complete the verification challenge");
      return;
    }

    setSubmitting(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: captchaToken || undefined,
    });

    // Always show the same success message regardless of whether the email
    // exists — otherwise this endpoint becomes an account-enumeration oracle.
    if (error) {
      setError("Something went wrong. Please try again.");
      captchaRef.current?.reset();
      setCaptchaToken("");
    } else {
      setSent(true);
    }
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto flex max-w-screen2xl flex-col items-center px-8 py-16 lg:px-12 lg:py-24">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
          <Mail className="h-6 w-6 text-ink-soft/60" strokeWidth={1.6} />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tightest text-ink">
          Reset your password
        </h1>
        <p className="mt-2 max-w-sm text-center text-sm text-ink-soft/60">
          Enter your account email and we&apos;ll send you a link to reset your password.
        </p>

        {sent ? (
          <p className="mt-9 max-w-sm rounded-md bg-stone-100 px-4 py-3 text-center text-[13px] font-medium text-ink">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-9 w-full max-w-sm space-y-4">
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

            <CaptchaWidget ref={captchaRef} onToken={setCaptchaToken} />

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
              {submitting ? "Sending…" : "Send Reset Link"}
            </button>
          </form>
        )}

        <Link href="/account" className="mt-10 text-[12.5px] text-ink-soft/40 hover:text-ink-soft/70">
          ← Back to sign in
        </Link>
      </section>

      <Footer />
    </main>
  );
}
