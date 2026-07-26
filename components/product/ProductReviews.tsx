import ReviewCard from "@/components/reviews/ReviewCard";
import ReviewForm from "@/components/reviews/ReviewForm";
import ReviewSummary from "@/components/reviews/ReviewSummary";
import type { PublicReview,ReviewSummary as Summary } from "@/lib/reviews/model";

export default function ProductReviews({summary,reviews,eligibleItem}:{summary:Summary;reviews:PublicReview[];eligibleItem?:{id:string;product_id:string|null;name:string;image:string}}){
 return <section id="reviews" className="scroll-mt-24 border-t border-stone-150 pt-12">
  <h2 className="text-2xl font-bold tracking-tightest text-ink">Customer Reviews</h2>
  <div className="mt-7 grid gap-7 lg:grid-cols-[.8fr_1.2fr]"><div className="space-y-5"><ReviewSummary summary={summary}/>{eligibleItem&&<ReviewForm item={eligibleItem}/>}</div><div className="space-y-5">{reviews.length?reviews.map(review=><ReviewCard key={review.id} review={review}/>):<div className="rounded-[24px] border border-dashed border-[#d9ccc0] bg-white p-10 text-center text-sm text-[#756a62]">No verified reviews yet.</div>}</div></div>
 </section>
}
