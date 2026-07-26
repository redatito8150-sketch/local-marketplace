import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrandEmptyState from "@/components/brand/BrandEmptyState";
import ReviewCard from "@/components/reviews/ReviewCard";
import ReviewFilters from "@/components/reviews/ReviewFilters";
import ReviewSummary from "@/components/reviews/ReviewSummary";
import { getBrandContent } from "@/lib/data/brands";
import { getPublicReviews } from "@/lib/reviews/data";
import { parseReviewFilters } from "@/lib/reviews/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const brand = await getBrandContent(slug);
  return brand ? { title: `${brand.name} Reviews | Mahaly`, description: `Verified customer reviews for ${brand.name} products on Mahaly.`, openGraph: { images: brand.heroImage ? [brand.heroImage] : [] } } : {};
}

export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const brand = await getBrandContent(slug); if (!brand) notFound();
  const filters = parseReviewFilters(raw);
  const result = await getPublicReviews({ brandSlug: slug, filters });
  const hasFilters = Boolean(filters.rating || filters.photos || filters.replied || filters.product || filters.query);
  return <section className="mx-auto max-w-brand px-5 py-10 sm:px-6 lg:px-10 lg:py-14">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8f2335]">Verified community</p><h1 className="mt-2 font-serif text-3xl text-[#261f1b] sm:text-4xl">Reviews of {brand.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#736861]">Real feedback from customers who purchased this brand through Mahaly.</p></div>
      <Link href={`/brands/${slug}/products`} className="text-sm font-semibold text-[#8f2335]">Explore products →</Link>
    </header>
    {result.migrationPending || (result.total===0&&!hasFilters) ? <div className="pt-10"><BrandEmptyState title="No reviews yet" description="Be the first verified customer to review one of this brand’s products." href={`/brands/${slug}/products`} action="Explore Products"/></div> :
    <div className="mt-8 space-y-7">
      <ReviewSummary summary={result.summary}/>
      <ReviewFilters basePath={`/brands/${slug}/reviews`} products={brand.products.map(p=>({id:p.id,name:p.name}))} values={{rating:raw.rating as string,product:raw.product as string,sort:raw.sort as string,q:raw.q as string,photos:raw.photos as string,replied:raw.replied as string}}/>
      {result.reviews.length ? <div className="grid gap-5 lg:grid-cols-2">{result.reviews.map(review=><ReviewCard key={review.id} review={review}/>)}</div> :
        <div className="rounded-[24px] border border-dashed border-[#d9ccc0] bg-white p-12 text-center"><h2 className="font-serif text-2xl text-[#332925]">No reviews match these filters</h2><Link href={`/brands/${slug}/reviews`} className="mt-4 inline-block text-sm font-semibold text-[#8f2335]">Reset filters</Link></div>}
      {result.pages>1&&<nav aria-label="Review pages" className="flex justify-center gap-2">{Array.from({length:result.pages},(_,i)=>i+1).map(page=><Link key={page} aria-current={page===result.page?"page":undefined} href={{pathname:`/brands/${slug}/reviews`,query:{...raw,page}}} className={`flex h-10 w-10 items-center justify-center rounded-full text-sm ${page===result.page?"bg-[#781c2d] text-white":"border border-[#ddd2c8] bg-white"}`}>{page}</Link>)}</nav>}
    </div>}
  </section>;
}
