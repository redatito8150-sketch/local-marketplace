import type { Metadata } from "next";
import { Star } from "lucide-react";
import { notFound } from "next/navigation";
import BrandEmptyState from "@/components/brand/BrandEmptyState";
import { getBrandContent } from "@/lib/data/brands";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const brand = await getBrandContent(slug);
  return brand ? { title: `${brand.name} Reviews | Mahaly`, description: `Customer ratings for ${brand.name} on Mahaly.` } : {};
}

export default async function ReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const brand = await getBrandContent(slug); if (!brand) notFound();
  const count = brand.products.reduce((sum, product) => sum + product.reviewCount, 0);
  return <section className="mx-auto max-w-brand px-5 py-14 sm:px-6 lg:px-10 lg:py-20">
    <div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8f2335]">Community notes</p><h2 className="mt-2 font-serif text-3xl text-[#261f1b] sm:text-4xl">Reviews of {brand.name}</h2><p className="mt-4 text-sm leading-6 text-[#736861]">A transparent summary of ratings recorded across this brand’s published products.</p></div>
    {count > 0 ? <div className="mt-10 grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] bg-[#781c2d] p-8 text-center text-white"><span className="font-serif text-7xl">{brand.storeRating.toFixed(1)}</span><div className="mt-4 flex gap-1" aria-label={`${brand.storeRating.toFixed(1)} out of 5 stars`}>{[1,2,3,4,5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= Math.round(brand.storeRating) ? "fill-[#f2c878] text-[#f2c878]" : "text-white/25"}`} />)}</div><p className="mt-3 text-xs text-white/65">Based on {count} product ratings</p></div><div className="rounded-[28px] border border-[#eaded1] bg-[#fffaf4] p-7 sm:p-10"><h3 className="font-serif text-2xl text-[#2b231f]">The rating picture</h3><p className="mt-3 max-w-xl text-sm leading-6 text-[#756a62]">Mahaly currently stores verified rating totals at product level. Individual written reviews and their distribution are not publicly stored yet, so we won’t manufacture customer quotes or misleading percentage bars.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{brand.products.filter((product) => product.reviewCount > 0).map((product) => <div key={product.id} className="flex items-center justify-between rounded-2xl bg-[#f3e9de] px-4 py-3"><span className="truncate pr-4 text-xs font-semibold text-[#352d28]">{product.name}</span><span className="shrink-0 text-xs text-[#8f2335]">{product.rating.toFixed(1)} · {product.reviewCount}</span></div>)}</div></div></div> : <div className="pt-12"><BrandEmptyState title="No reviews yet" description="This brand has not received recorded customer ratings yet. Be among the first to discover its pieces." href={`/brands/${slug}/products`} action="Explore Products" /></div>}
  </section>;
}
