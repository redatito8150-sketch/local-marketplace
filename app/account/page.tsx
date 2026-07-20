"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";

export default function AccountPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");

  // Once signed in, the dashboard shell at /account/(dashboard) takes over —
  // this page's job is only the anonymous sign-in/sign-up form.
  useEffect(() => {
    if (user) router.replace("/account/overview");
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setConfirmationMessage("");

    const result =
      mode === "sign-in"
        ? await signIn(email, password)
        : await signUp(fullName, email, password);

    if (result.error) {
      setError(result.error);
    } else if (result.needsEmailConfirmation) {
      setConfirmationMessage(
        "Check your inbox to confirm your account before signing in."
      );
    }
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
