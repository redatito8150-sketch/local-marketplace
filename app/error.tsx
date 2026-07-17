"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
        <AlertTriangle className="h-7 w-7 text-ink-soft/60" strokeWidth={1.5} />
      </div>
      <h1 className="mt-8 max-w-md text-2xl font-bold tracking-tightest text-ink">
        Something went wrong.
      </h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-soft/70">
       We couldn’t load this page. This is usually temporary — try again in a moment.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          Try again
        </button>
        <Link
          href="/#home"
          className="inline-flex items-center gap-2 rounded-full border border-stone-150 px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-stone-100"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
