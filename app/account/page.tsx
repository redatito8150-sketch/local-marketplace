"use client";

import { useState } from "react";
import Link from "next/link";
import { User, Mail, Lock } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AccountPage() {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");

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

        <form
          onSubmit={(e) => e.preventDefault()}
          className="mt-9 w-full max-w-sm space-y-4"
        >
          {mode === "create" && (
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <input
                type="text"
                placeholder="Full name"
                className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <input
              type="email"
              placeholder="Email address"
              className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <input
              type="password"
              placeholder="Password"
              className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
          >
            {mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-[13px] text-ink-soft/60">
          {mode === "sign-in" ? (
            <>
              New to Local?{" "}
              <button
                onClick={() => setMode("create")}
                className="font-semibold text-ink hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("sign-in")}
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
