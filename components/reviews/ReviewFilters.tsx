"use client";

import Link from "next/link";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { useRef } from "react";

export default function ReviewFilters({
  products,
  values,
  basePath,
  total,
}: {
  products: { id: string; name: string }[];
  values: Record<string, string | undefined>;
  basePath: string;
  total: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitFilters = () => formRef.current?.requestSubmit();
  const controlClass = "min-h-11 appearance-none rounded-[10px] border border-[#ddd4cc] bg-[#fffdfa] px-4 pr-9 text-[12px] font-medium text-[#4c433e] outline-none transition focus:border-[#9d4853]";

  return (
    <form ref={formRef} action={basePath} className="flex flex-wrap items-center gap-2.5">
      <label className="relative min-w-[210px] flex-1 lg:max-w-[310px]">
        <span className="sr-only">Search reviews</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e847d]" />
        <input
          name="q"
          defaultValue={values.q}
          placeholder="Search reviews"
          className="min-h-11 w-full rounded-[10px] border border-[#ddd4cc] bg-[#fffdfa] pl-10 pr-4 text-[12px] outline-none transition placeholder:text-[#8e847d] focus:border-[#9d4853]"
        />
      </label>

      <label className="relative">
        <span className="sr-only">Filter by rating</span>
        <select name="rating" defaultValue={values.rating ?? ""} onChange={submitFilters} className={controlClass}>
          <option value="">Rating</option>
          {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#80766f]" />
      </label>

      <label className="relative">
        <span className="sr-only">Filter by product</span>
        <select name="product" defaultValue={values.product ?? ""} onChange={submitFilters} className={`${controlClass} max-w-48`}>
          <option value="">Product</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#80766f]" />
      </label>

      <details className="relative">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[#ddd4cc] bg-[#fffdfa] px-4 text-[12px] font-medium text-[#4c433e]">
          <SlidersHorizontal className="h-3.5 w-3.5" /> More filters
        </summary>
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-48 space-y-3 rounded-xl border border-[#e1d7ce] bg-white p-4 shadow-xl">
          <label className="flex items-center gap-2 text-xs text-[#5f554f]"><input type="checkbox" name="photos" value="1" defaultChecked={values.photos === "1"} />With photos</label>
          <label className="flex items-center gap-2 text-xs text-[#5f554f]"><input type="checkbox" name="replied" value="1" defaultChecked={values.replied === "1"} />Brand replied</label>
          <button className="min-h-9 w-full rounded-lg bg-[#8f2634] px-3 text-xs font-bold text-white">Apply</button>
          <Link href={basePath} className="block text-center text-xs font-semibold text-[#8f2634]">Reset filters</Link>
        </div>
      </details>

      <div className="ml-auto flex items-center gap-5">
        <label className="relative">
          <span className="sr-only">Sort reviews</span>
          <select name="sort" defaultValue={values.sort ?? "helpful"} onChange={submitFilters} className={controlClass}>
            <option value="helpful">Most helpful</option>
            <option value="recent">Most recent</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
            <option value="photos">Photos first</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#80766f]" />
        </label>
        <span className="whitespace-nowrap text-[12px] font-medium text-[#655b55]">{total} {total === 1 ? "review" : "reviews"}</span>
      </div>
    </form>
  );
}
