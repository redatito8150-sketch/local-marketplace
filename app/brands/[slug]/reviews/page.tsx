import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { notFound } from "next/navigation";
import ReviewCard from "@/components/reviews/ReviewCard";
import ReviewFilters from "@/components/reviews/ReviewFilters";
import ReviewSummary from "@/components/reviews/ReviewSummary";
import { getBrandContent } from "@/lib/data/brands";
import { getPublicReviews } from "@/lib/reviews/data";
import { parseReviewFilters } from "@/lib/reviews/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  return brand
    ? {
        title: `${brand.name} Reviews | Zakhnook`,
        description: `Verified customer reviews for ${brand.name} products on Zakhnook.`,
        openGraph: { images: brand.heroImage ? [brand.heroImage] : [] },
      }
    : {};
}

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const brand = await getBrandContent(slug);
  if (!brand) notFound();

  const normalizedRaw = { ...raw, sort: raw.sort ?? "helpful" };
  const filters = parseReviewFilters(normalizedRaw);
  const result = await getPublicReviews({ brandSlug: slug, filters });
  const hasFilters = Boolean(filters.rating || filters.photos || filters.replied || filters.product || filters.query);
  const stringValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

  return (
    <section className="bg-[#fcf8f3]">
      <div className="mx-auto max-w-brand px-5 pb-16 pt-9 sm:px-6 lg:px-10 lg:pb-20 lg:pt-11">
        <ReviewSummary summary={result.summary} brandName={brand.name} variant="brand" />

        <div className="mt-8">
          <ReviewFilters
            basePath={`/brands/${slug}/reviews`}
            products={brand.products.map((product) => ({ id: product.id, name: product.name }))}
            total={result.total}
            values={{
              rating: stringValue(raw.rating),
              product: stringValue(raw.product),
              sort: stringValue(raw.sort) ?? "helpful",
              q: stringValue(raw.q),
              photos: stringValue(raw.photos),
              replied: stringValue(raw.replied),
            }}
          />
        </div>

        {result.reviews.length > 0 ? (
          <div className="mt-7 space-y-4">
            {result.reviews.map((review) => <ReviewCard key={review.id} review={review} variant="brand" />)}
          </div>
        ) : (
          <div className="mt-7 rounded-[18px] border border-dashed border-[#d9ccc0] bg-[#fffdfa] px-6 py-14 text-center">
            <MessageSquareText className="mx-auto h-9 w-9 text-[#a65c64]" strokeWidth={1.5} />
            <h2 className="mt-4 font-serif text-2xl text-[#332925]">
              {hasFilters ? "No reviews match these filters" : "No reviews yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#756a62]">
              {result.migrationPending
                ? "Customer reviews will appear here once the reviews system is ready."
                : hasFilters
                  ? "Try changing or clearing your filters to see more customer feedback."
                  : `Be the first verified customer to review one of ${brand.name}'s products.`}
            </p>
            <Link
              href={hasFilters ? `/brands/${slug}/reviews` : `/brands/${slug}/products`}
              className="mt-5 inline-flex min-h-10 items-center rounded-full border border-[#AC3935] px-5 text-xs font-bold text-[#AC3935]"
            >
              {hasFilters ? "Reset filters" : "Explore products"}
            </Link>
          </div>
        )}

        {result.pages > 1 && (
          <nav aria-label="Review pages" className="mt-8 flex justify-center gap-2">
            {Array.from({ length: result.pages }, (_, index) => index + 1).map((page) => (
              <Link
                key={page}
                aria-current={page === result.page ? "page" : undefined}
                href={{ pathname: `/brands/${slug}/reviews`, query: { ...raw, page } }}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm ${page === result.page ? "bg-[#781c2d] text-white" : "border border-[#ddd2c8] bg-white"}`}
              >
                {page}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
