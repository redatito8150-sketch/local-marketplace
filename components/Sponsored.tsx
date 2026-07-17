"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Info } from "lucide-react";

export default function Sponsored() {
  return (
    <section
      id="deals"
      className="mx-auto max-w-screen2xl px-8 pb-24 lg:px-12"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="grid grid-cols-1 overflow-hidden rounded-xl3 bg-beige-50 lg:grid-cols-2"
      >
        {/* Left: copy */}
        <div className="flex flex-col justify-center px-10 py-14 lg:px-14">
          <div className="mb-5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft/60">
            <Info className="h-3.5 w-3.5" />
            Sponsored
          </div>

          <span className="text-sm font-semibold uppercase tracking-widest text-ink-soft/50">
            Featured Brand
          </span>

          <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight tracking-tightest text-ink lg:text-[2.6rem]">
            Discover this week&apos;s spotlight collection
          </h2>

          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft/75">
            Every season we hand-pick one independent brand whose craft,
            story, and design push the local scene forward. This week,
            step into a collection built on considered tailoring and
            honest materials — made by makers you can actually meet.
          </p>

          <motion.a
            href="#"
            whileHover={{ x: 4 }}
            className="mt-8 inline-flex w-fit items-center gap-2 text-base font-semibold text-ink"
          >
            Shop now
            <ArrowRight className="h-4 w-4" />
          </motion.a>
        </div>

        {/* Right: campaign image */}
        <div className="relative min-h-[360px] lg:min-h-[520px]">
          <Image
            src="https://images.unsplash.com/photo-1490725263030-1f0521cec8ec?w=1200&q=80"
            alt="Featured brand campaign"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </motion.div>
    </section>
  );
}
