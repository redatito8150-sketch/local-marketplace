import Image from "next/image";
import Link from "next/link";
import { FeaturedBrandContent } from "@/types";

export default function FeaturedBrand({
  content,
  compact = false,
}: {
  content: FeaturedBrandContent;
  compact?: boolean;
}) {
  return (
    <div className={`relative w-full overflow-hidden bg-beige-100 ${compact ? "h-[210px] rounded-[10px]" : "h-[150px] rounded-[18px] lg:h-[150px]"}`}>
      <Image
        src={content.image}
        alt={content.heading}
        fill
        sizes="(max-width: 1024px) 100vw, 1300px"
        className="object-cover object-right"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-[#e9eef0] via-[#e9eef0]/90 to-transparent lg:w-[68%]" />

      <div className="relative z-10 flex h-full max-w-sm flex-col justify-center px-8 lg:px-10">
        <h2 className={`font-serif font-semibold text-ink ${compact ? "text-[30px] tracking-[.24em]" : "text-2xl lg:text-[1.7rem]"}`}>
          {content.heading}
        </h2>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-soft/70">
          {content.description}
        </p>
        <Link
          href="/brands"
          className={`mt-4 inline-flex w-fit items-center rounded-md px-4 py-2 text-xs font-semibold transition-transform hover:scale-[1.03] active:scale-[0.98] ${compact ? "border border-mahalyred bg-white/60 text-mahalyred" : "bg-ink text-cream"}`}
        >
          {content.ctaLabel}
        </Link>
      </div>
    </div>
  );
}
