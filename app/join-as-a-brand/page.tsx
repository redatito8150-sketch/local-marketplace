import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JoinHero from "@/components/join/JoinHero";
import JoinBenefits from "@/components/join/JoinBenefits";
import BrandDashboardPreview from "@/components/join/BrandDashboardPreview";
import SuccessStory from "@/components/join/SuccessStory";
import JoinFAQ from "@/components/join/JoinFAQ";
import JoinJourney from "@/components/join/JoinJourney";
import { JOIN_HERO } from "@/content/join";

export const metadata: Metadata = {
  title: "Join Mahaly | Sell Your Brand on Mahaly",
  description:
    "Apply to sell your brand on Mahaly — Egypt's marketplace for independent local brands. Reach more customers, keep your identity, and manage everything from one dashboard.",
};

export const dynamic = "force-static";

export default function JoinAsABrandPage() {
  const heroContent = {
    label: JOIN_HERO.label,
    headingLines: JOIN_HERO.headingLines,
    subheading: JOIN_HERO.subheading,
    ctaLabel: JOIN_HERO.ctaLabel,
  };

  return (
    <main className="join-showcase-background flex min-h-screen flex-col">
      <Header />
      <JoinHero content={heroContent} />
      <JoinBenefits />
      <JoinJourney />
      <BrandDashboardPreview />
      <section className="mx-auto max-w-[1500px] px-6 pb-24 md:px-10 xl:px-12">
        <div className="grid grid-cols-1 gap-12 rounded-[34px] border border-white/45 bg-white/40 p-8 shadow-[0_25px_80px_rgba(45,28,20,.1)] backdrop-blur-xl lg:grid-cols-2 lg:gap-20 lg:p-12">
          <SuccessStory />
          <JoinFAQ />
        </div>
      </section>
      <Footer homeGradient />
    </main>
  );
}
