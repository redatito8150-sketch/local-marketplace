import Image from "next/image";
import { FeaturedBrandContent } from "@/types";

export default function FeaturedBrand({
  content,
}: {
  content: FeaturedBrandContent;
}) {
  return (
    <div className="relative h-[150px] w-full overflow-hidden rounded-[18px] bg-beige-100 lg:h-[150px]">
      <Image
        src={content.image}
        alt={content.heading}
        fill
        sizes="(max-width: 1024px) 100vw, 1300px"
        className="object-cover object-right"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-beige-100 via-beige-100/80 to-transparent lg:w-[65%]" />

      <div className="relative z-10 flex h-full max-w-sm flex-col justify-center px-8 lg:px-10">
        <h2 className="font-serif text-2xl font-semibold text-ink lg:text-[1.7rem]">
          {content.heading}
        </h2>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-soft/70">
          {content.description}
        </p>
        <a
          href="#"
          className="mt-4 inline-flex w-fit items-center rounded-md bg-ink px-4 py-2 text-xs font-semibold text-cream transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          {content.ctaLabel}
        </a>
      </div>
    </div>
  );
}
