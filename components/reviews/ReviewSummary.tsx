import { Camera, CheckCircle2, Star } from "lucide-react";
import type { ReviewSummary as Summary } from "@/lib/reviews/model";

export default function ReviewSummary({ summary }: { summary: Summary }) {
  return <section aria-label="Rating summary" className="grid overflow-hidden rounded-[28px] border border-[#eaded1] bg-white shadow-[0_12px_40px_rgba(68,43,32,.06)] lg:grid-cols-[.7fr_1.3fr]">
    <div className="flex flex-col items-center justify-center bg-[#781c2d] p-8 text-white">
      <strong className="font-serif text-7xl font-normal">{summary.average.toFixed(1)}</strong>
      <div className="mt-3 flex gap-1" aria-label={`${summary.average.toFixed(1)} out of 5 stars`}>
        {[1,2,3,4,5].map((star)=><Star key={star} className={`h-5 w-5 ${star<=Math.round(summary.average)?"fill-[#f1c773] text-[#f1c773]":"text-white/30"}`}/>)}
      </div>
      <p className="mt-3 text-sm text-white/70">{summary.total} verified {summary.total === 1 ? "review" : "reviews"}</p>
    </div>
    <div className="p-6 sm:p-8">
      <h2 className="font-serif text-2xl text-[#2b231f]">Rating overview</h2>
      <div className="mt-5 space-y-3">
        {[5,4,3,2,1].map((rating)=>{
          const count=summary.distribution[rating as 1|2|3|4|5]; const percent=summary.total?Math.round(count/summary.total*100):0;
          return <div key={rating} className="grid grid-cols-[44px_1fr_66px] items-center gap-3 text-xs">
            <span className="flex items-center gap-1 font-semibold text-[#4a403a]">{rating}<Star className="h-3 w-3 fill-[#b37b25] text-[#b37b25]"/></span>
            <div className="h-2 overflow-hidden rounded-full bg-[#eee6dd]"><div className="h-full rounded-full bg-[#8f2335]" style={{width:`${percent}%`}}/></div>
            <span className="text-right text-[#857970]">{count} ({percent}%)</span>
          </div>;
        })}
      </div>
      <div className="mt-6 flex flex-wrap gap-4 border-t border-[#eee5dc] pt-5 text-xs text-[#6d625b]">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#8f2335]"/>{summary.verifiedPercent}% verified</span>
        <span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-[#8f2335]"/>{summary.withPhotos} with photos</span>
      </div>
    </div>
  </section>;
}
