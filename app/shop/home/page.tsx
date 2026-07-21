import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Home — Mahaly",
  description: "Mahaly's Home category is coming soon.",
};

// Static placeholder — no Home category exists in the product taxonomy yet.
// This literal route wins over app/shop/[category]/page.tsx's dynamic
// segment, so no changes to CategorySlug/generateStaticParams are needed.
export default function ShopHomePage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <section className="mx-auto flex max-w-screen2xl flex-col items-center justify-center px-8 py-32 text-center lg:px-12">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft/50">
          Home
        </p>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-ink lg:text-4xl">
          Coming soon
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft/70">
          We&apos;re curating a home &amp; living collection from local
          brands. Check back soon.
        </p>
      </section>
      <Footer />
    </main>
  );
}
