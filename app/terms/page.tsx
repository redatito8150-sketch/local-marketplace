import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "Terms & Conditions — Mahaly" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <section className="mx-auto max-w-3xl px-8 py-16 lg:px-12 lg:py-24">
        <h1 className="text-3xl font-bold tracking-tightest text-ink">Terms &amp; Conditions</h1>
        <p className="mt-6 text-[14px] leading-relaxed text-ink-soft/70">
          By creating a Mahaly account or placing an order, you agree to shop in good faith,
          provide accurate delivery information, and use the platform only for its intended
          purpose of browsing and purchasing from our independent local brands. Full legal terms
          are being finalized — contact us if you have questions in the meantime.
        </p>
      </section>
      <Footer />
    </main>
  );
}
