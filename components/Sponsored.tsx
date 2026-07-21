import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BrandPageContent } from "@/types";
import type { BrandSummary } from "@/lib/data/brands";

type FeaturedBrand = Pick<BrandPageContent, "slug" | "name" | "tagline" | "aboutDescription" | "heroImage" | "logoImage">;

export default function Sponsored({ featuredBrand, sponsoredBrands }: { featuredBrand: FeaturedBrand | null; sponsoredBrands: BrandSummary[] }) {
  return (
    <section id="deals" className="mx-auto grid max-w-[1920px] gap-4 px-6 pb-3 md:px-10 lg:grid-cols-2 xl:px-16">
      <div className="relative min-h-[195px] overflow-hidden rounded-[9px] bg-beige-50">
        {featuredBrand && <Image src={featuredBrand.heroImage} alt="" fill sizes="50vw" className="object-cover opacity-75" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#f6eee5] via-[#f6eee5]/90 to-transparent" />
        <div className="relative z-10 max-w-[370px] px-8 py-5">
          <p className="text-[11px] font-medium">Featured brand</p>
          <h2 className="mt-1 font-serif text-[35px] font-semibold leading-none">{featuredBrand?.name ?? "NOLA"}</h2>
          <p className="mt-3 text-[11px] leading-[1.55] text-ink-soft/75">{featuredBrand?.aboutDescription || featuredBrand?.tagline || "Timeless pieces, thoughtfully made in Egypt."}</p>
          {featuredBrand && <Link href={`/brands/${featuredBrand.slug}`} className="mt-3 inline-flex items-center gap-5 text-[11px] font-semibold text-mahalyred">Discover the collection <ArrowRight className="h-3.5 w-3.5" /></Link>}
        </div>
      </div>
      <div className="relative min-h-[195px] overflow-hidden rounded-[9px] bg-[#f6eee5] px-10 py-6">
        <div className="absolute -right-4 -top-16 h-[290px] w-[260px] opacity-35"><Image src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80" alt="" fill sizes="260px" className="object-cover" /></div>
        <div className="relative z-10"><h2 className="font-serif text-[25px] font-semibold">Sponsored brands</h2><p className="mt-2 text-[11px] leading-5 text-ink-soft/70">Discover selected partner brands<br />we love and trust.</p>
          <div className="mt-4 flex items-end gap-8"><Link href="/brands" className="inline-flex h-11 items-center gap-6 rounded-[8px] bg-mahalyred px-5 text-[11px] font-semibold text-white">Explore sponsors <ArrowRight className="h-4 w-4" /></Link>
            <div className="hidden flex-1 items-end justify-around gap-4 sm:flex">{sponsoredBrands.slice(0,4).map((brand) => <Link key={brand.slug} href={`/brands/${brand.slug}`} className="text-center"><span className="block font-serif text-[20px] uppercase tracking-wide">{brand.name}</span><span className="text-[9px] text-ink-soft/65">Local brand</span></Link>)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
