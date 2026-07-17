import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FEATURED_BRANDS } from "@/data/navigation";

export const metadata = {
  title: "Brands — Local",
  description:
    "Discover independent local brands curated by Local. Support creators, wear what matters.",
};

export default function BrandsDirectoryPage() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 pb-6 pt-14 lg:px-12 lg:pt-20">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft/50">
          {FEATURED_BRANDS.length} brands and counting
        </p>
        <h1 className="mt-3 max-w-xl text-4xl font-bold leading-[1.1] tracking-tightest text-ink lg:text-5xl">
          Every brand here is independent, local, and real.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft/70">
          Local partners directly with makers and studios across Egypt.
          Every purchase supports a creator, not a warehouse.
        </p>
      </section>

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED_BRANDS.map((brand) => (
            <Link
              key={brand.slug}
              href={`/brands/${brand.slug}`}
              className="group relative flex h-64 flex-col justify-end overflow-hidden rounded-xl3 bg-stone-100 shadow-soft transition-shadow duration-500 hover:shadow-card"
            >
              <Image
                src={brand.thumbnail}
                alt={brand.name}
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />

              <div className="relative flex items-center justify-between p-6">
                <span className="text-lg font-semibold text-white">
                  {brand.name}
                </span>
                <ArrowUpRight
                  className="h-4 w-4 text-white transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
