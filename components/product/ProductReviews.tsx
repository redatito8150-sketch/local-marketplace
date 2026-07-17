import { ProductReview } from "@/types";
import StarRating from "@/components/shared/StarRating";

export default function ProductReviews({
  rating,
  reviewCount,
  reviews,
}: {
  rating: number;
  reviewCount: number;
  reviews: ProductReview[];
}) {
  return (
    <section id="reviews" className="scroll-mt-24 border-t border-stone-150 pt-12">
      <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tightest text-ink">
            Customer Reviews
          </h2>
          <div className="mt-2 flex items-center gap-2.5">
            <StarRating rating={rating} size="md" />
            <span className="text-sm text-ink-soft/60">
              {rating.toFixed(1)} out of 5 — based on {reviewCount} reviews
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
        {reviews.map((review) => (
          <div key={review.id} className="border-b border-stone-150 pb-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{review.author}</p>
              <span className="text-xs text-ink-soft/40">{review.date}</span>
            </div>
            <div className="mt-1.5">
              <StarRating rating={review.rating} size="xs" />
            </div>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft/75">
              {review.comment}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
