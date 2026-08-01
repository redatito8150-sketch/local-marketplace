import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MessageSquareQuote, Star } from "lucide-react";
import type { PublicReview } from "@/lib/reviews/model";
import { formatDateOnly } from "@/lib/format";
import ReviewActions from "./ReviewActions";

export default function ReviewCard({ review }: { review: PublicReview }) {
  const edited = new Date(review.updatedAt).getTime() - new Date(review.createdAt).getTime() > 1000;
  return <article className="rounded-[24px] border border-[#e9dfd6] bg-white p-5 shadow-[0_10px_35px_rgba(67,45,34,.055)] sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="font-semibold text-[#302824]">{review.authorName}</p><div className="mt-1.5 flex items-center gap-2"><span className="flex" aria-label={`${review.rating} out of 5 stars`}>{[1,2,3,4,5].map(s=><Star key={s} className={`h-4 w-4 ${s<=review.rating?"fill-[#b27a24] text-[#b27a24]":"text-[#d9d0c7]"}`}/>)}</span><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#68765f]"><BadgeCheck className="h-3.5 w-3.5"/>Verified Purchase</span></div></div>
      <time className="text-xs text-[#8b8078]">{formatDateOnly(review.createdAt)}{edited?" · Edited":""}</time>
    </div>
    {review.title&&<h3 className="mt-5 text-lg font-semibold text-[#302824]">{review.title}</h3>}
    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#685d56]">{review.body}</p>
    {review.images.length>0&&<div className="mt-5 flex gap-3 overflow-x-auto pb-1">{review.images.map((image,index)=><a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f2ebe4]"><Image src={image.url} alt={`Customer photo ${index+1} for ${review.productName}`} fill sizes="96px" className="object-cover"/></a>)}</div>}
    <Link href={`/product/${review.productId}`} className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f8f2ec] p-3 transition hover:bg-[#f2e7dd]">
      <span className="relative h-12 w-12 overflow-hidden rounded-xl bg-white"><Image src={review.productImage} alt="" fill sizes="48px" className="object-cover"/></span>
      <span><span className="block text-[10px] font-bold uppercase tracking-[.14em] text-[#9a8b80]">Purchased product</span><span className="mt-0.5 block text-sm font-semibold text-[#3b302a]">{review.productName}</span></span>
    </Link>
    {review.reply&&<section className="mt-5 rounded-2xl border-l-4 border-[#8f2335] bg-[#fff7f5] p-4" aria-label={`Response from ${review.reply.brandName}`}><h4 className="flex items-center gap-2 text-xs font-bold text-[#8f2335]"><MessageSquareQuote className="h-4 w-4"/>Response from {review.reply.brandName}</h4><p className="mt-2 text-sm leading-6 text-[#665a54]">{review.reply.body}</p><time className="mt-2 block text-[11px] text-[#9a8c84]">{formatDateOnly(review.reply.createdAt)}{review.reply.updatedAt!==review.reply.createdAt?" · Edited":""}</time></section>}
    <div className="mt-5"><ReviewActions reviewId={review.id} initialCount={review.helpfulCount} initialHelpful={review.viewerFoundHelpful}/></div>
  </article>;
}
