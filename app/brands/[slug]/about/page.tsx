import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BrandJourneyTimeline from "@/components/brand/BrandJourneyTimeline";
import FoundersEditor from "@/components/brand/FoundersEditor";
import InlineEditableImage from "@/components/brand/InlineEditableImage";
import InlineEditableText from "@/components/brand/InlineEditableText";
import RichTextEditableField from "@/components/brand/RichTextEditableField";
import { getBrandContent } from "@/lib/data/brands";
import { stripRichText } from "@/lib/sanitizeRichText";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandContent(slug);

  return brand
    ? {
        title: `About ${brand.name} | Mahaly`,
        description: stripRichText(brand.aboutDescription) || brand.tagline,
      }
    : {};
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  if (!brand) notFound();

  // Generic, brand-agnostic fallback copy — never invent a specific founder
  // name, date, or stat for a real brand. Only real fields (name/city) go in.
  // aboutDescription is the one combined intro field now (rich text, see
  // RichTextEditableField) — the old separate storyBody second paragraph
  // is retired from this page (story_body itself is untouched; still used
  // by the admin BrandForm/brand-portal/mobile app).
  const introFallback = `<p>${brand.name} was born in ${brand.city} from a love of thoughtful design, honest materials, and the city it calls home — creating effortless pieces made for real life. From the sea breeze to ${brand.city}'s golden light, everything we create is inspired by our surroundings and made to move with you, wherever the day takes you.</p>`;
  const introduction = stripRichText(brand.aboutDescription).length > 40 ? brand.aboutDescription : introFallback;
  const aboutImage = brand.aboutImage || brand.storyImage;
  const headlineFallback = `Designed in ${brand.city}.\nMade for everywhere.`;
  const quoteFallback = `We started ${brand.name} to make everyday pieces feel personal again.`;

  // Only real, verifiable milestones — no invented founding story, no made-up
  // product counts. A brand with no recorded founding year just shows the
  // one milestone we can always vouch for (it did, in fact, join Mahaly).
  // An owner/admin can add their own via BrandJourneyTimeline.
  const founded = brand.foundedYear
    ? {
        year: brand.foundedYear.toString(),
        title: "Founded",
        description: `${brand.name} started here, in ${brand.city}.`,
      }
    : null;
  const joinedMahaly = {
    year: new Date(brand.createdAt).getFullYear().toString(),
    title: "Joined Mahaly",
    description: `A new chapter for ${brand.name} to reach more people, everywhere.`,
  };

  return (
    <section className="bg-[#fcf8f3] text-[#2b2521]">
      <div className="mx-auto max-w-brand px-5 pb-14 pt-10 sm:px-6 lg:px-10 lg:pb-20 lg:pt-12">
        <div className="grid items-center gap-9 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16">
          <div className="max-w-[500px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.23em] text-[#9b3440]">
              The story behind {brand.name}
            </p>
            <InlineEditableText
              field="aboutHeadline"
              value={brand.aboutHeadline || headlineFallback}
              as="h1"
              multiline
              className="mt-5 whitespace-pre-line font-serif text-[38px] leading-[1.08] tracking-[-0.025em] text-[#29231f] sm:text-[42px] lg:text-[44px]"
            />
            <div className="mt-6">
              <RichTextEditableField
                field="aboutDescription"
                value={introduction}
                className="text-[15px] leading-7 text-[#6d645d] [&_p]:mb-4 last:[&_p]:mb-0"
                canImport={brand.hasSourceApplication}
              />
            </div>
          </div>

          <div className="relative aspect-[1.5/1] min-h-[310px] overflow-hidden rounded-[18px] bg-[#e7ddd2] shadow-[0_18px_50px_rgba(74,50,36,0.08)]">
            <InlineEditableImage
              field="about"
              src={aboutImage}
              alt={`${brand.name} creative studio`}
              fill
              sizes="(max-width: 1024px) 100vw, 62vw"
              imgClassName="object-cover object-center"
              hasBackup={Boolean(brand.deletedImageBackups.about)}
            />
          </div>
        </div>

        <div className="mt-9 grid items-center gap-7 rounded-[16px] bg-[linear-gradient(105deg,#f6eee7_0%,#faf6f1_56%,#f2e8de_100%)] px-7 py-8 sm:px-10 lg:grid-cols-[1fr_240px] lg:px-11 lg:py-9">
          <blockquote className="flex gap-5">
            <span className="font-serif text-[64px] leading-[0.72] text-[#8f2634]" aria-hidden="true">
              “
            </span>
            <InlineEditableText
              field="aboutQuote"
              value={brand.aboutQuote || quoteFallback}
              as="p"
              multiline
              className="font-serif text-[31px] leading-[1.18] tracking-[-0.015em] text-[#7c2833] sm:text-[36px] lg:text-[39px]"
            />
          </blockquote>
          <FoundersEditor initial={brand.founders} />
        </div>

        <div className="mt-10 border-t border-[#e5d9ce] pt-8 lg:mt-11">
          <h2 className="font-serif text-[30px] tracking-[-0.02em] text-[#2f2824]">
            Our journey
          </h2>

          <BrandJourneyTimeline
            founded={founded}
            joinedMahaly={joinedMahaly}
            initialCustom={brand.journeyMilestones}
          />
        </div>
      </div>
    </section>
  );
}
