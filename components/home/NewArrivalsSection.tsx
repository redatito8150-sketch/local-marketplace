import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CompactProductCard from "@/components/shared/CompactProductCard";
import type { Product } from "@/types";

export default function NewArrivalsSection({
  title,
  products,
  viewAllHref,
}: {
  title: string;
  products: Product[];
  viewAllHref: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-screen2xl px-8 py-20 lg:px-12">
      <div className="mb-10 flex items-end justify-between">
        <h2 className="text-4xl font-bold tracking-tightest text-ink">{title}</h2>
        <Link
          href={viewAllHref}
          className="group flex items-center gap-1.5 text-sm font-semibold text-ink-soft/70 transition-colors hover:text-ink"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <CompactProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
