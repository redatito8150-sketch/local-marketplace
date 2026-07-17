"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Store } from "lucide-react";

const MotionLink = motion(Link);

const DEPARTMENTS = [
  {
    label: "Women",
    href: "/shop/women",
    rotate: -4,
    y: 0,
    img: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80",
  },
  {
    label: "Men",
    href: "/shop/men",
    rotate: 2,
    y: -18,
    img: "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=800&q=80",
  },
  {
    label: "Kids",
    href: "/shop/kids",
    rotate: -2,
    y: 8,
    img: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=800&q=80",
  },
];

export default function Hero() {
  return (
    <section
      id="home"
      className="mx-auto grid max-w-screen2xl grid-cols-1 items-center gap-16 px-8 pb-20 pt-14 lg:grid-cols-2 lg:gap-12 lg:px-12 lg:pt-20"
    >
      {/* Left column */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="max-w-xl"
      >
        <h1 className="text-5xl font-bold leading-[1.08] tracking-tightest text-ink lg:text-[3.4rem]">
          Local brands.
          <br />
          Real stories.
          <br />
          All in one place.
        </h1>

        <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft/80">
          Discover and shop from the best local brands. Support creators.
          Wear what matters.
        </p>

        <motion.a
          href="#join"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-ink px-7 py-4 text-[15px] font-semibold text-cream shadow-soft transition-shadow hover:shadow-card"
        >
          <Store className="h-4 w-4" strokeWidth={1.8} />
          Join As Brand
        </motion.a>
      </motion.div>

      {/* Right column — Pinterest-style rotated department cards */}
      <div className="relative flex items-center justify-center gap-5 lg:gap-6">
        {DEPARTMENTS.map((dep, i) => (
          <MotionLink
            key={dep.label}
            href={dep.href}
            initial={{ opacity: 0, y: 40, rotate: 0 }}
            animate={{ opacity: 1, y: dep.y, rotate: dep.rotate }}
            transition={{
              duration: 0.8,
              delay: 0.15 * i,
              ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={{
              rotate: 0,
              scale: 1.045,
              y: dep.y - 10,
              zIndex: 20,
            }}
            className="group relative block w-[30%] min-w-[190px] cursor-pointer overflow-hidden rounded-xl3 bg-stone-100 shadow-card transition-shadow duration-500 hover:shadow-cardHover"
            style={{ aspectRatio: "3 / 4.1" }}
          >
            <Image
              src={dep.img}
              alt={`${dep.label} collection`}
              fill
              sizes="(max-width: 1024px) 40vw, 20vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              priority={i === 1}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/25 via-transparent to-transparent" />

            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-full bg-cream/95 px-4 py-2.5 shadow-soft backdrop-blur-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-ink">
                {dep.label}
              </span>
              <ArrowUpRight
                className="h-3.5 w-3.5 text-ink transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2}
              />
            </div>
          </MotionLink>
        ))}
      </div>
    </section>
  );
}
