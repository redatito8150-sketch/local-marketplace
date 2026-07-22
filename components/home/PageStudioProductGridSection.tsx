import Link from "next/link";
import ProductGrid from "@/components/category/ProductGrid";
import type { Product } from "@/types";

export default function PageStudioProductGridSection({ title, products, viewAllHref }: { title: string; products: Product[]; viewAllHref: string }) {
  if (!products.length) return null;
  return <section className="mx-auto max-w-[1920px] border-b border-stone-150 px-6 py-7 md:px-10 xl:px-16"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-serif text-[25px] font-semibold tracking-tight text-ink">{title}</h2><Link href={viewAllHref} className="text-[11px] font-semibold text-mahalyred">View all</Link></div><ProductGrid products={products} viewMode="grid" compact /></section>;
}
