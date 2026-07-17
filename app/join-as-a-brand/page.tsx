import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JoinHero from "@/components/join/JoinHero";
import JoinBenefits from "@/components/join/JoinBenefits";
import BrandDashboardPreview from "@/components/join/BrandDashboardPreview";
import SuccessStory from "@/components/join/SuccessStory";
import JoinFAQ from "@/components/join/JoinFAQ";

export const metadata: Metadata = {
  title: "Join Local | Sell Your Brand on Local",
  description:
    "Apply to sell your brand on Local — Egypt's marketplace for independent local brands. Reach more customers, keep your identity, and manage everything from one dashboard.",
};

export default function JoinAsABrandPage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <JoinHero />
      <JoinBenefits />
      <BrandDashboardPreview />
      <section className="mx-auto max-w-screen2xl px-8 pb-24 lg:px-12">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-20">
          <SuccessStory />
          <JoinFAQ />
        </div>
      </section>
      <Footer />
    </main>
  );
}
