"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Info } from "lucide-react";
import type { BrandPageContent } from "@/types";
import type { BrandSummary } from "@/lib/data/brands";

type FeaturedBrand = Pick<
  BrandPageContent,
  "slug" | "name" | "tagline" | "aboutDescription" | "heroImage" | "logoImage"
>;

export default function Sponsored({
  featuredBrand,
  sponsoredBrands,
}: {
  featuredBrand: FeaturedBrand | null;
  sponsoredBrands: BrandSummary[];
}) {
  return (
    <section id="deals" className="mx-auto max-w-screen2xl px-8 pb-24 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="grid grid-cols-1 overflow-hidden rounded-xl3 bg-beige-50 lg:grid-cols-2"
      >
        {/* Left: Featured Brand */}
        <div className="flex flex-col justify-center px-10 py-14 lg:px-14">
          <span className="text-sm font-semibold uppercase tracking-widest text-ink-soft/50">
            Featured Brand
          </span>

          {featuredBrand ? (
            <>
              <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight tracking-tightest text-ink lg:text-[2.6rem]">
                {featuredBrand.name}
              </h2>

              <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft/75">
                {featuredBrand.aboutDescription || featuredBrand.tagline}
              </p>

              <motion.div whileHover={{ x: 4 }} className="mt-8 w-fit">
                <Link
                  href={`/brands/${featuredBrand.slug}`}
                  className="inline-flex items-center gap-2 text-base font-semibold text-ink"
                >
                  Discover the collection
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            </>
          ) : (
            <p className="mt-4 text-base text-ink-soft/60">Check back soon.</p>
          )}
        </div>

        {/* Right: real campaign image from the featured brand */}
        <div className="relative min-h-[360px] lg:min-h-[520px]">
          {featuredBrand && (
            <Image
              src={featuredBrand.heroImage}
              alt={featuredBrand.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          )}
        </div>
      </motion.div>

      {/* Sponsored brand pills */}
      {sponsoredBrands.length > 0 && (
        <div className="mt-6 flex flex-col gap-4 rounded-xl3 border border-stone-150 bg-white px-8 py-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft/60">
            <Info className="h-3.5 w-3.5" />
            Sponsored
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {sponsoredBrands.map((brand) => (
              <Link
                key={brand.slug}
                href={`/brands/${brand.slug}`}
                className="flex items-center gap-2 rounded-full border border-stone-150 bg-cream px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink/20"
              >
                {brand.logoImage && (
                  <Image
                    src={brand.logoImage}
                    alt={brand.name}
                    width={20}
                    height={20}
                    className="rounded-full object-cover"
                  />
                )}
                {brand.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
