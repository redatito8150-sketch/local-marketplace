"use client";

import Image from "next/image";
import { useState } from "react";
import { BrandPageContent } from "@/types";

export default function BrandHero({ brand }: { brand: BrandPageContent }) {
  const [following, setFollowing] = useState(false);

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
            Made in Egypt
          </span>

          <h1 className="mt-7 text-[2.75rem] font-medium leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[5rem]">
            {brand.name}
          </h1>

          <p className="mx-auto mt-6 max-w-md text-[15px] font-light leading-relaxed text-white/85 lg:text-base">
            {brand.tagline}
          </p>

          <div className="mt-9 flex items-center justify-center gap-3">
            <button
              onClick={() => setFollowing((f) => !f)}
              className="rounded-full bg-white px-7 py-3 text-[13px] font-medium tracking-wide text-charcoal transition-all hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {following ? "Following" : "Follow Brand"}
            </button>
            <a
              href="#"
              className="rounded-full border border-white/50 px-7 py-3 text-[13px] font-medium tracking-wide text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Visit Website
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
