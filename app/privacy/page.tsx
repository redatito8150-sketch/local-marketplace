import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LegalHero from "@/components/legal/LegalHero";
import LegalToc from "@/components/legal/LegalToc";
import LegalSectionBody from "@/components/legal/LegalSectionBody";
import LegalSectionIcon from "@/components/legal/LegalSectionIcon";
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from "@/content/legal/privacy";
import { absoluteUrl } from "@/lib/seo";
import {
  FileText,
  Database,
  Settings2,
  Share2,
  KeyRound,
  Clock,
  ShieldCheck,
  Globe,
  Scale,
  Trash2,
  Users,
  Cookie,
  Link2,
  RefreshCw,
  Mail,
  type LucideIcon,
} from "lucide-react";

const SECTION_ICONS: Record<string, LucideIcon> = {
  "about-this-policy": FileText,
  "information-we-collect": Database,
  "how-we-use-information": Settings2,
  "how-we-share-information": Share2,
  "google-user-data": KeyRound,
  "data-retention": Clock,
  "data-security": ShieldCheck,
  "international-data-transfers": Globe,
  "your-rights-and-choices": Scale,
  "account-deletion": Trash2,
  "childrens-privacy": Users,
  cookies: Cookie,
  "third-party-links": Link2,
  "changes-to-this-policy": RefreshCw,
  "contact-us": Mail,
};

const TITLE = "Privacy Policy — Mahaly";
const DESCRIPTION =
  "How Mahaly collects, uses, shares, and protects your information across our website, mobile app, and marketplace services.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/privacy") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/privacy") },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />
      <LegalHero title="Privacy Policy" intro={PRIVACY_INTRO} />

      <section className="mx-auto max-w-screen2xl px-6 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="lg:flex lg:items-start lg:gap-14">
          <LegalToc sections={PRIVACY_SECTIONS.map(({ id, title }) => ({ id, title }))} />

          <div className="max-w-2xl space-y-12 lg:flex-1">
            {PRIVACY_SECTIONS.map((section, index) => (
              <article key={section.id} id={section.id} tabIndex={-1} className="scroll-mt-28 outline-none">
                <div className="flex items-start gap-4">
                  <LegalSectionIcon icon={SECTION_ICONS[section.id] ?? FileText} />
                  <h2 className="pt-2 text-xl font-semibold tracking-tightest text-ink">
                    {index + 1}. {section.title}
                  </h2>
                </div>
                <div className="mt-4 pl-[60px]">
                  <LegalSectionBody blocks={section.body} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
