"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  const goTo = (index: number) => {
    setActive((index + images.length) % images.length);
  };

  return (
    <div className="flex flex-col-reverse gap-4 lg:flex-row">
      {/* thumbnails */}
      <div className="flex gap-3 lg:flex-col">
        {images.map((img, i) => (
          <button
            key={img + i}
            onClick={() => setActive(i)}
            aria-label={`View image ${i + 1}`}
            className={`relative h-16 w-16 flex-none overflow-hidden rounded-lg transition-all ${
              active === i
                ? "ring-2 ring-ink ring-offset-2"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            <Image src={img} alt="" fill sizes="64px" className="object-cover" />
          </button>
        ))}
      </div>

      {/* main image */}
      <div className="relative aspect-[4/5] w-full flex-1 overflow-hidden rounded-xl3 bg-beige-50">
        <Image
          src={images[active]}
          alt={alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />

        {images.length > 1 && (
          <>
            <button
              aria-label="Previous image"
              onClick={() => goTo(active - 1)}
              className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-soft transition-transform hover:scale-105"
            >
              <ChevronLeft className="h-4 w-4 text-ink" strokeWidth={2} />
            </button>
            <button
              aria-label="Next image"
              onClick={() => goTo(active + 1)}
              className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-soft transition-transform hover:scale-105"
            >
              <ChevronRight className="h-4 w-4 text-ink" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
