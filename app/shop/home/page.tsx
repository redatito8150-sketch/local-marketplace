import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LampFloor, Sofa } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Home Collection — Mahaly",
  description: "Mahaly's premium Home collection is coming soon.",
};

export default function ShopHomePage() {
  return (
    <main className="min-h-screen bg-[#e9e1d5]">
      <Header />
      <section className="relative isolate flex min-h-[calc(100vh-220px)] overflow-hidden px-6 py-20 sm:px-10 lg:min-h-[680px] lg:px-16">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,.8),transparent_30%),linear-gradient(135deg,#f5efe5_0%,#ded1bf_48%,#c4b29a_100%)]" />
        <div className="absolute bottom-[-16%] left-1/2 -z-10 h-[52%] w-[92%] -translate-x-1/2 rounded-[50%] border border-white/50 bg-[#d7c7b2]/35 shadow-[0_-28px_80px_rgba(255,255,255,.35)]" />
        <div className="absolute left-[7%] top-[17%] hidden h-64 w-44 rounded-t-[90px] border border-[#796b58]/15 bg-[#eee4d5]/45 shadow-[0_28px_60px_rgba(91,72,50,.08)] md:block" />
        <div className="absolute right-[8%] top-[23%] hidden h-72 w-52 rounded-[50%_50%_16%_16%] border border-[#796b58]/10 bg-[#b6b49b]/24 md:block" />
        <LampFloor aria-hidden="true" className="absolute bottom-[12%] left-[11%] hidden h-36 w-36 text-[#806f59]/30 lg:block" strokeWidth={0.8} />
        <Sofa aria-hidden="true" className="absolute bottom-[10%] right-[10%] hidden h-40 w-40 text-[#806f59]/25 lg:block" strokeWidth={0.7} />

        <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[.32em] text-[#756652]">Mahaly Living</p>
          <h1 className="mt-6 font-serif text-[52px] font-medium leading-[.95] tracking-[-.045em] text-ink sm:text-[72px] lg:text-[88px]">Home Collection</h1>
          <div className="my-7 h-px w-14 bg-mahalyred" />
          <p className="font-serif text-2xl text-[#655746] sm:text-3xl">Coming Soon</p>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-ink-soft/65">Thoughtful objects, natural textures, and locally crafted pieces for rooms that feel distinctly yours.</p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/" className="inline-flex h-11 items-center gap-6 rounded-full bg-mahalyred px-6 text-[12px] font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-mahalyred/40">Back to Mahaly <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/shop/women" className="inline-flex h-11 items-center rounded-full border border-[#7f705e]/25 bg-white/35 px-6 text-[12px] font-semibold text-ink backdrop-blur transition-colors hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-mahalyred/30">Explore available collections</Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
