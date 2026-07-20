import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { BrandPageContent } from "@/types";
import FollowBrandButton from "@/components/brand/FollowBrandButton";

export default function BrandHero({
  brand,
  isFollowing,
  signedIn,
  isOwnBrand,
}: {
  brand: BrandPageContent;
  isFollowing: boolean;
  signedIn: boolean;
  isOwnBrand: boolean;
}) {
  return (
    <section className="relative flex h-[86vh] min-h-[640px] w-full items-end overflow-hidden lg:min-h-[760px]">
      <Image
        src={brand.heroImage}
        alt={brand.name}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* soft bottom-only readability gradient — never a full-image overlay */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-brand px-6 pb-16 lg:px-10 lg:pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-white/95 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy">
            {brand.category} · {brand.city}
          </span>

          <h1 className="mt-7 text-[2.75rem] font-medium leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[5rem]">
            {brand.name}
          </h1>

          <p className="mx-auto mt-6 max-w-md text-[15px] font-light leading-relaxed text-white/85 lg:text-base">
            {brand.tagline}
          </p>

          <div className="mt-9 flex items-center justify-center gap-3">
            {isOwnBrand && (
              <Link
                href="/brand-portal"
                className="flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[13px] font-semibold tracking-wide text-navy transition-transform hover:scale-[1.03]"
              >
                <LayoutDashboard className="h-4 w-4" strokeWidth={1.8} />
                Go to My Dashboard
              </Link>
            )}
            <FollowBrandButton
              brandSlug={brand.slug}
              initialFollowing={isFollowing}
              signedIn={signedIn}
            />
            {brand.websiteUrl && (
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/50 px-7 py-3 text-[13px] font-medium tracking-wide text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Visit Website
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
