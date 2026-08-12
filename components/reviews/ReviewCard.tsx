import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MessageSquareQuote, Star } from "lucide-react";
import type { PublicReview } from "@/lib/reviews/model";
import { formatDateOnly } from "@/lib/format";
import ReviewActions from "./ReviewActions";

function RatingStars({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return (
    <span className="flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`${size} ${star <= rating ? "fill-[#c48113] text-[#c48113]" : "fill-[#e7dfd7] text-[#e7dfd7]"}`} />
      ))}
    </span>
  );
}

export default function ReviewCard({
  review,
  variant = "default",
}: {
  review: PublicReview;
  variant?: "default" | "brand";
}) {
  const edited = new Date(review.updatedAt).getTime() - new Date(review.createdAt).getTime() > 1000;

  if (variant === "brand") {
    const initial = review.authorName.trim().charAt(0).toUpperCase() || "M";
    return (
      <article className="group rounded-[18px] border border-[#e8ddd3] bg-[#fffdfa] px-5 py-6 shadow-[0_7px_25px_rgba(67,45,34,.028)] sm:px-7 sm:py-7">
        <div className="grid gap-6 sm:grid-cols-[180px_1fr] lg:grid-cols-[200px_1fr]">
          <div className="flex items-start gap-3 sm:block">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#C85956] font-serif text-xl text-white">
              {review.authorAvatar ? <Image src={review.authorAvatar} alt="" width={56} height={56} className="h-full w-full object-cover" /> : initial}
            </div>
            <div className="sm:mt-3">
              <p className="text-[13px] font-bold text-[#342c27]">{review.authorName}</p>
              <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#319264]">
                <BadgeCheck className="h-3.5 w-3.5 fill-[#319264] text-white" /> Verified purchase
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4">
              <RatingStars rating={review.rating} size="h-[18px] w-[18px]" />
              <time className="whitespace-nowrap text-[11px] text-[#8c827b]">{formatDateOnly(review.createdAt)}{edited ? " · Edited" : ""}</time>
            </div>
            {review.title && <h3 className="mt-4 text-[17px] font-semibold text-[#242424]">{review.title}</h3>}
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-[13px] leading-6 text-[#6d625b]">{review.body}</p>

            {review.images.length > 0 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {review.images.map((image, index) => (
                  <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] bg-[#f2ebe4]">
                    <Image src={image.url} alt={`Customer photo ${index + 1} for ${review.productName}`} fill sizes="80px" className="object-cover" />
                  </a>
                ))}
              </div>
            )}

            <Link href={`/product/${review.productId}`} className="mt-5 inline-flex items-center gap-3 rounded-xl pr-4 transition hover:bg-[#f8f2ec]">
              <span className="relative h-14 w-14 overflow-hidden rounded-[10px] bg-[#f1e9e1]"><Image src={review.productImage} alt="" fill sizes="56px" className="object-cover" /></span>
              <span>
                <span className="block text-[12px] font-medium text-[#4c433e]">{review.productName}</span>
                <span className="mt-1 block text-[11px] text-[#8a8079]">View purchased product</span>
              </span>
            </Link>

            {review.reply && (
              <section className="mt-5 rounded-xl border-l-[3px] border-[#C85956] bg-[#fff7f5] p-4" aria-label={`Response from ${review.reply.brandName}`}>
                <h4 className="flex items-center gap-2 text-xs font-bold text-[#C85956]"><MessageSquareQuote className="h-4 w-4" />Response from {review.reply.brandName}</h4>
                <p className="mt-2 text-sm leading-6 text-[#665a54]">{review.reply.body}</p>
              </section>
            )}

            <div className="mt-3"><ReviewActions reviewId={review.id} initialCount={review.helpfulCount} initialHelpful={review.viewerFoundHelpful} variant="brand" /></div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-[#e9dfd6] bg-white p-5 shadow-[0_10px_35px_rgba(67,45,34,.055)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-semibold text-[#242424]">{review.authorName}</p><div className="mt-1.5 flex items-center gap-2"><RatingStars rating={review.rating} /><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#68765f]"><BadgeCheck className="h-3.5 w-3.5" />Verified Purchase</span></div></div>
        <time className="text-xs text-[#8b8078]">{formatDateOnly(review.createdAt)}{edited ? " · Edited" : ""}</time>
      </div>
      {review.title && <h3 className="mt-5 text-lg font-semibold text-[#242424]">{review.title}</h3>}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#685d56]">{review.body}</p>
      {review.images.length > 0 && <div className="mt-5 flex gap-3 overflow-x-auto pb-1">{review.images.map((image, index) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f2ebe4]"><Image src={image.url} alt={`Customer photo ${index + 1} for ${review.productName}`} fill sizes="96px" className="object-cover" /></a>)}</div>}
      <Link href={`/product/${review.productId}`} className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f8f2ec] p-3 transition hover:bg-[#f2e7dd]">
        <span className="relative h-12 w-12 overflow-hidden rounded-xl bg-white"><Image src={review.productImage} alt="" fill sizes="48px" className="object-cover" /></span>
        <span><span className="block text-[10px] font-bold uppercase tracking-[.14em] text-[#9a8b80]">Purchased product</span><span className="mt-0.5 block text-sm font-semibold text-[#3b302a]">{review.productName}</span></span>
      </Link>
      {review.reply && <section className="mt-5 rounded-2xl border-l-4 border-[#C85956] bg-[#fff7f5] p-4" aria-label={`Response from ${review.reply.brandName}`}><h4 className="flex items-center gap-2 text-xs font-bold text-[#C85956]"><MessageSquareQuote className="h-4 w-4" />Response from {review.reply.brandName}</h4><p className="mt-2 text-sm leading-6 text-[#665a54]">{review.reply.body}</p></section>}
      <div className="mt-5"><ReviewActions reviewId={review.id} initialCount={review.helpfulCount} initialHelpful={review.viewerFoundHelpful} /></div>
    </article>
  );
}
