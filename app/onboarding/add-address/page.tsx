"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";

export default function OnboardingAddAddressPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const complete = async (next: string) => {
    setBusy(true);
    await fetch("/api/account/onboarding/complete", { method: "POST" });
    router.replace(next);
  };

  if (loading) return null;
  if (!user) {
    router.replace("/account");
    return null;
  }

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto flex max-w-screen2xl flex-col items-center px-8 py-16 text-center lg:px-12 lg:py-24">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
          <MapPin className="h-6 w-6 text-ink-soft/60" strokeWidth={1.6} />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tightest text-ink">
          Would you like to add a delivery address now?
        </h1>
        <p className="mt-2 max-w-md text-sm text-ink-soft/60">
          You can always add this later from your account — a saved address just makes
          checkout faster. It&apos;s only required when you place your first order.
        </p>

        <div className="mt-9 flex w-full max-w-sm flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => complete("/account/addresses/new")}
            className="w-full rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add delivery address
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => complete("/account/overview")}
            className="w-full rounded-md border border-stone-150 bg-white py-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip for now
          </button>
        </div>
      </section>

      <Footer />
    </main>
  );
}
