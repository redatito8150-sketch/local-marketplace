import { Camera, CheckCircle2, Heart, Star } from "lucide-react";
import type { ReviewSummary as Summary } from "@/lib/reviews/model";

function StarRow({ average, className = "h-5 w-5" }: { average: number; className?: string }) {
  return (
    <span className="flex gap-1" aria-label={`${average.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${className} ${star <= Math.round(average) ? "fill-current" : "text-[#d9d0c7]"}`}
        />
      ))}
    </span>
  );
}

export default function ReviewSummary({
  summary,
  brandName,
  variant = "default",
}: {
  summary: Summary;
  brandName?: string;
  variant?: "default" | "brand";
}) {
  if (variant === "brand") {
    const recommended = summary.total
      ? Math.round(((summary.distribution[5] + summary.distribution[4]) / summary.total) * 100)
      : 0;

    return (
      <section
        aria-label="Rating summary"
        className="grid overflow-hidden rounded-[18px] border border-[#e8ddd3] bg-[#fffdfa] px-6 py-8 shadow-[0_8px_32px_rgba(65,43,33,0.035)] sm:px-9 lg:grid-cols-[0.72fr_1.45fr_0.8fr] lg:items-stretch lg:px-10"
      >
        <div className="flex flex-col items-center justify-center border-b border-[#ece2da] pb-7 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-9">
          <strong className="font-serif text-[66px] font-normal leading-none text-[#AC3935]">
            {summary.average.toFixed(1)}
          </strong>
          <div className="mt-3 text-[#AC3935]">
            <StarRow average={summary.average} className="h-5 w-5" />
          </div>
          <p className="mt-3 text-[13px] font-medium text-[#5f554f]">
            {summary.total} {summary.total === 1 ? "review" : "reviews"}
          </p>
        </div>

        <div className="py-7 lg:px-10 lg:py-0">
          <div className="space-y-3.5">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = summary.distribution[rating as 1 | 2 | 3 | 4 | 5];
              const percent = summary.total ? Math.round((count / summary.total) * 100) : 0;
              return (
                <div key={rating} className="grid grid-cols-[32px_1fr_42px] items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 font-semibold text-[#3f3732]">
                    {rating}<Star className="h-3 w-3 fill-current" />
                  </span>
                  <div className="h-[5px] overflow-hidden rounded-full bg-[#e8e2dc]">
                    <div className="h-full rounded-full bg-[#AC3935]" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="text-right text-[#736a64]">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center border-t border-[#ece2da] pt-7 text-center lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0">
          <Heart className="h-11 w-11 text-[#AC3935]" strokeWidth={1.7} />
          <strong className="mt-3 font-serif text-[38px] font-normal text-[#AC3935]">{recommended}%</strong>
          <p className="mt-1 text-[13px] text-[#625852]">recommend {brandName || "this brand"}</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Rating summary" className="grid overflow-hidden rounded-[28px] border border-[#eaded1] bg-white shadow-[0_12px_40px_rgba(68,43,32,.06)] lg:grid-cols-[.7fr_1.3fr]">
      <div className="flex flex-col items-center justify-center bg-[#781c2d] p-8 text-white">
        <strong className="font-serif text-7xl font-normal">{summary.average.toFixed(1)}</strong>
        <div className="mt-3 text-[#f1c773]"><StarRow average={summary.average} /></div>
        <p className="mt-3 text-sm text-white/70">{summary.total} verified {summary.total === 1 ? "review" : "reviews"}</p>
      </div>
      <div className="p-6 sm:p-8">
        <h2 className="font-serif text-2xl text-[#2b231f]">Rating overview</h2>
        <div className="mt-5 space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = summary.distribution[rating as 1 | 2 | 3 | 4 | 5];
            const percent = summary.total ? Math.round((count / summary.total) * 100) : 0;
            return (
              <div key={rating} className="grid grid-cols-[44px_1fr_66px] items-center gap-3 text-xs">
                <span className="flex items-center gap-1 font-semibold text-[#4a403a]">{rating}<Star className="h-3 w-3 fill-[#b37b25] text-[#b37b25]" /></span>
                <div className="h-2 overflow-hidden rounded-full bg-[#eee6dd]"><div className="h-full rounded-full bg-[#AC3935]" style={{ width: `${percent}%` }} /></div>
                <span className="text-right text-[#857970]">{count} ({percent}%)</span>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-4 border-t border-[#eee5dc] pt-5 text-xs text-[#6d625b]">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#AC3935]" />{summary.verifiedPercent}% verified</span>
          <span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-[#AC3935]" />{summary.withPhotos} with photos</span>
        </div>
      </div>
    </section>
  );
}
