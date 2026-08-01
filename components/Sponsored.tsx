import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SponsoredBrandSlide } from "@/lib/data/brands";
import BrandCarousel from "@/components/shared/BrandCarousel";

// Renders whichever brand(s) the admin marked "Sponsored" for the
// homepage_banner placement (BrandForm's Sponsorship section) — a
// crossfading carousel when more than one, a single static tile when
// exactly one, and nothing at all when none are configured.
export default function Sponsored({ sponsoredBrands }: { sponsoredBrands: SponsoredBrandSlide[] }) {
  if (sponsoredBrands.length === 0) return null;

  return (
    <section id="deals" className="mx-auto max-w-[1920px] px-6 py-5 md:px-10 xl:px-16">
      <div className="relative min-h-[195px] overflow-hidden rounded-[9px] bg-beige-50">
        <BrandCarousel slides={sponsoredBrands}>
          {(brand) => (
            <div className="relative min-h-[195px]">
              <Image src={brand.heroImage} alt="" fill sizes="100vw" className="object-cover opacity-75" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f6eee5] via-[#f6eee5]/90 to-transparent" />
              <div className="relative z-10 max-w-[370px] px-8 py-5">
                <p className="text-[11px] font-medium">Sponsored brand</p>
                <h2 className="mt-1 font-serif text-[35px] font-semibold leading-none">{brand.name}</h2>
                <p className="mt-3 text-[11px] leading-[1.55] text-ink-soft/75">{brand.aboutDescription || brand.tagline}</p>
                <Link href={`/brands/${brand.slug}`} className="mt-3 inline-flex items-center gap-5 text-[11px] font-semibold text-mahalyred">
                  Discover the collection <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </BrandCarousel>
      </div>
    </section>
  );
}
