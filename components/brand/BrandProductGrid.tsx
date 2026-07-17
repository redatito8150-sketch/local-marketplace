"use client";

import { SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { BrandProduct } from "@/types";
import BrandProductCard from "./BrandProductCard";

export default function BrandProductGrid({
  brandName,
  products,
}: {
  brandName: string;
  products: BrandProduct[];
}) {
  return (
    <section className="mx-auto max-w-brand px-6 py-24 lg:px-10 lg:py-32">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-[1.75rem] font-medium tracking-tight text-charcoal lg:text-3xl">
          Shop {brandName}
        </h2>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-charcoal/80 transition-colors hover:border-charcoal/30">
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
            Filter
          </button>
          <button className="flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-charcoal/80 transition-colors hover:border-charcoal/30">
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.6} />
            Sort
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-14 lg:grid-cols-4 lg:gap-x-8">
        {products.map((product) => (
          <BrandProductCard key={product.id} product={product} brandName={brandName} />
        ))}
      </div>
    </section>
  );
}
