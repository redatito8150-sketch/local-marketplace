import Link from "next/link";
import { Compass } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto flex max-w-screen2xl flex-col items-center px-8 py-28 text-center lg:px-12 lg:py-36">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
          <Compass className="h-7 w-7 text-ink-soft/60" strokeWidth={1.5} />
        </div>

        <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          404
        </p>
        <h1 className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-tightest text-ink lg:text-4xl">
          This page wandered off the map.
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-soft/70">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
          Let&apos;s get you back to discovering local brands.
        </p>

        <Link
          href="/#home"
          className="mt-9 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.03]"
        >
          Back to Home
        </Link>
      </section>

      <Footer />
    </main>
  );
}
