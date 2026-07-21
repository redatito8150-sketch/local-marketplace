import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ApplyBrandForm from "@/components/join/ApplyBrandForm";

export const metadata: Metadata = {
  title: "Apply to Sell on Mahaly | Join Mahaly",
  description:
    "Submit your brand application to start selling on Mahaly, Egypt's marketplace for independent local brands.",
};

export default function ApplyBrandPage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <section className="mx-auto max-w-screen2xl px-8 py-16 lg:px-12 lg:py-24">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft/50">
          Join Mahaly
        </p>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-ink lg:text-4xl">
          Apply to sell on Mahaly
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-soft/70">
          Tell us about your brand — we review every application personally.
        </p>
        <div className="mt-10">
          <ApplyBrandForm />
        </div>
      </section>
      <Footer />
    </main>
  );
}
