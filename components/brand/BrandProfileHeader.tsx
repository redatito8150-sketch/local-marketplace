import { Layers3, MapPin, Package, Users } from "lucide-react";
import type { BrandPageContent } from "@/types";
import { formatCompactNumber } from "@/lib/format";
import BrandHeroActions from "./BrandHeroActions";
import BrandShareButton from "./BrandShareButton";
import BrandProfileNav from "./BrandProfileNav";
import InlineEditableImage from "./InlineEditableImage";
import InlineEditableText from "./InlineEditableText";
import PartnerBadge from "@/components/shared/PartnerBadge";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default function BrandProfileHeader({ brand }: { brand: BrandPageContent }) {
  const stats = [
    { icon: Package, value: brand.products.length, label: "Products" },
    { icon: Users, value: formatCompactNumber(brand.followerCount), label: "Followers" },
    { icon: Layers3, value: brand.collectionsCount, label: "Collections" },
  ];
  return (
    <header className="bg-[#f5eee5] pt-3">
      <div className="mx-auto max-w-brand px-4 sm:px-6 lg:px-10">
        <div className="relative min-h-[280px] overflow-hidden rounded-[28px] sm:min-h-[350px]">
          <InlineEditableImage
            field="hero"
            src={brand.heroImage}
            alt={`${brand.name} cover`}
            fill
            priority
            sizes="(max-width: 1440px) 100vw, 1360px"
            imgClassName="object-cover"
            hasBackup={Boolean(brand.deletedImageBackups.hero)}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-black/10" />
          {/* Absolutely positioned and sized to its own content (not the
              full min-h box) so it doesn't intercept clicks/hover across
              the whole hero. z-30 — deliberately *above*
              InlineEditableImage's own z-20 overlay, since the logo/name/
              Follow/Share here live in the one region where the two boxes
              still do overlap (the bottom strip) and must win there, or
              none of them would be clickable at all. */}
          <div className="absolute inset-x-0 bottom-0 z-30 flex items-end p-5 sm:p-8 lg:p-10">
            <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-[#fffaf4] font-serif text-xl text-[#7f1d2d] shadow-xl sm:h-24 sm:w-24">
                  <InlineEditableImage
                    field="logo"
                    src={brand.logoImage}
                    alt={`${brand.name} logo`}
                    fill
                    sizes="96px"
                    imgClassName="object-cover"
                    emptyPlaceholder={initials(brand.name)}
                    hasBackup={Boolean(brand.deletedImageBackups.logo)}
                  />
                </div>
                <div className="pb-1 text-white">
                  <div className="flex items-center gap-2">
                    <InlineEditableText
                      field="name"
                      value={brand.name}
                      as="h1"
                      className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl"
                      requireAdmin
                    />
                    {brand.isMahalyPartner && <PartnerBadge className="h-5 w-5" />}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/80">
                    <span className="inline-flex items-center gap-1.5">
                      {brand.category}
                      {brand.additionalCategories.length > 0 && (
                        <span className="group/categories relative">
                          <span className="cursor-default rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold">
                            +{brand.additionalCategories.length}
                          </span>
                          <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-[#211d1a] px-3 py-2 text-[11px] leading-5 text-white opacity-0 shadow-xl transition-opacity group-hover/categories:opacity-100">
                            {brand.additionalCategories.join(", ")}
                          </span>
                        </span>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <InlineEditableText field="city" value={brand.city} as="span" className="text-[12px] text-white/80" />
                    </span>
                    <InlineEditableText
                      field="foundedYear"
                      value={brand.foundedYear}
                      as="span"
                      className="text-[12px] text-white/80"
                      placeholder="Add founding year"
                      prefix="Since "
                    />
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2"><BrandHeroActions brandSlug={brand.slug} /><BrandShareButton brandName={brand.name} /></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 py-5 sm:flex sm:gap-8">
          {stats.map(({ icon: Icon, value, label }) => <div key={label} className="flex items-center justify-center gap-2 rounded-2xl bg-white/60 px-3 py-3 sm:justify-start sm:bg-transparent sm:px-0"><Icon className="hidden h-4 w-4 text-[#8f2335] sm:block" /><p className="text-center sm:text-left"><strong className="block text-sm text-[#211d1a] sm:inline">{value}</strong>{" "}<span className="text-[11px] text-[#786e65] sm:text-xs">{label}</span></p></div>)}
        </div>
      </div>
      <BrandProfileNav slug={brand.slug} />
    </header>
  );
}
