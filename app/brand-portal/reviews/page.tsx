import { redirect } from "next/navigation";
import ReviewCard from "@/components/reviews/ReviewCard";
import ReplyEditor from "@/components/reviews/ReplyEditor";
import { getPublicReviews } from "@/lib/reviews/data";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
export const dynamic="force-dynamic";
export default async function BrandReviewsInbox({searchParams}:{searchParams:Promise<{brand?:string}>}){
 const {brand}=await searchParams;const context=await requireBrandOwner(brand);if(!context?.brandSlug)redirect("/brand-portal");
 const result=await getPublicReviews({brandSlug:context.brandSlug,filters:{photos:false,verified:false,replied:false,sort:"recent",page:1}});
 return <div><p className="text-xs font-bold uppercase tracking-widest text-[#C85956]">Customer voice</p><h1 className="mt-2 text-3xl font-bold">Reviews inbox</h1><p className="mt-2 text-sm text-[#756a62]">Reply officially to verified reviews. Customer content cannot be edited or hidden here.</p><div className="mt-7 grid gap-5">{result.reviews.map(review=><div key={review.id}><ReviewCard review={review}/><ReplyEditor reviewId={review.id} initial={review.reply?.body} brandSlug={context.brandSlug ?? undefined}/></div>)}{!result.reviews.length&&<div className="rounded-2xl border border-dashed p-10 text-center text-sm">No published reviews yet.</div>}</div></div>;
}
