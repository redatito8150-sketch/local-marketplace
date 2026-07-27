import Link from "next/link";
import CompactProductCard from "@/components/shared/CompactProductCard";
import type { Product } from "@/types";

export default function PageStudioProductGridSection({ title, products, viewAllHref }: { title: string; products: Product[]; viewAllHref: string }) {
  if (!products.length) return null;
  return <section className="mx-auto max-w-[1920px] border-b border-white/20 bg-cream/58 px-6 py-9 backdrop-blur-[2px] md:px-10 xl:px-16"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-serif text-[25px] font-semibold tracking-tight text-ink">{title}</h2><Link href={viewAllHref} className="text-[11px] font-semibold text-mahalyred">View all</Link></div><div className="grid grid-cols-1 gap-5 min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">{products.map((product) => <CompactProductCard key={product.id} product={product} />)}</div></section>;
}
