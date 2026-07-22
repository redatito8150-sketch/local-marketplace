import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "Privacy Policy — Mahaly" };

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <section className="mx-auto max-w-3xl px-8 py-16 lg:px-12 lg:py-24">
        <h1 className="text-3xl font-bold tracking-tightest text-ink">Privacy Policy</h1>
        <p className="mt-6 text-[14px] leading-relaxed text-ink-soft/70">
          Mahaly collects the account and delivery details you provide (name, email, phone,
          address) only to operate your account and fulfill orders, and never sells your
          personal data to third parties. Full policy details are being finalized — contact us
          if you have questions in the meantime.
        </p>
      </section>
      <Footer />
    </main>
  );
}
