import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LegalHero from "@/components/legal/LegalHero";
import LegalToc from "@/components/legal/LegalToc";
import LegalAccordion from "@/components/legal/LegalAccordion";
import { TERMS_INTRO, TERMS_SECTIONS } from "@/content/legal/terms";
import { absoluteUrl } from "@/lib/seo";

const TITLE = "Terms & Conditions — Mahaly";
const DESCRIPTION =
  "The terms that govern using Mahaly's website, mobile app, accounts, and marketplace purchases.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/terms") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/terms") },
};

export default function TermsPage() {
  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />
      <LegalHero title="Terms & Conditions" intro={TERMS_INTRO} />

      <section className="mx-auto max-w-screen2xl px-6 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="lg:flex lg:items-start lg:gap-14">
          <LegalToc sections={TERMS_SECTIONS.map(({ id, title }) => ({ id, title }))} />

          <div className="max-w-2xl rounded-xl3 border border-stone-150 bg-card px-2 lg:flex-1">
            <LegalAccordion items={TERMS_SECTIONS} />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
