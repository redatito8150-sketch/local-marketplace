"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

// Amazon-style hover zoom: a lens square tracks the cursor over the main
// image, and a magnified pane of that same region appears beside it. Only
// wired up on pointer/hover-capable screens (`lg:` + a hover media query
// via CSS, not JS) — touch devices get native pinch-zoom on the plain
// image instead, so there's no lens fighting a swipe gesture on mobile.
const ZOOM_FACTOR = 2.4;
const LENS_SIZE = 190;

export default function ProductGallery({
  images,
  alt,
  featuredImage,
}: {
  images: string[];
  alt: string;
  // An explicit Color selection (never gallery navigation itself) may set
  // this to swap the primary image — arrows/thumbnails/swipe only ever
  // change `active` locally and never report back up, so they can never
  // affect the selected Color/Size/variant/price/stock status.
  featuredImage?: string;
}) {
  const [active, setActive] = useState(0);
  // Adjusts local nav state when the prop changes, without an effect (the
  // React-recommended pattern for this) — a Color selection updates
  // `featuredImage`, which should move the gallery, but the gallery's own
  // arrow/thumbnail navigation must never report back up (see the prop's
  // doc comment above).
  const [syncedFeaturedImage, setSyncedFeaturedImage] = useState(featuredImage);
  if (featuredImage !== syncedFeaturedImage) {
    setSyncedFeaturedImage(featuredImage);
    if (featuredImage) {
      const index = images.indexOf(featuredImage);
      if (index >= 0) setActive(index);
    }
  }

  const goTo = (index: number) => {
    setActive((index + images.length) % images.length);
  };

  const frameRef = useRef<HTMLDivElement>(null);
  const [zooming, setZooming] = useState(false);
  const [lens, setLens] = useState({ x: 0, y: 0 });
  const [bgPosition, setBgPosition] = useState("50% 50%");

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const lensX = Math.min(Math.max(x - LENS_SIZE / 2, 0), rect.width - LENS_SIZE);
    const lensY = Math.min(Math.max(y - LENS_SIZE / 2, 0), rect.height - LENS_SIZE);
    setLens({ x: lensX, y: lensY });

    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;
    setBgPosition(`${xPercent}% ${yPercent}%`);
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
      <div className="relative flex-1">
        <div
          ref={frameRef}
          onMouseEnter={() => setZooming(true)}
          onMouseLeave={() => setZooming(false)}
          onMouseMove={handleMouseMove}
          className="group relative aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded-xl3 bg-beige-50"
        >
          <Image
            src={images[active]}
            alt={alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />

          {/* Lens: only rendered on hover-capable pointers, so it never
              shows (or eats a tap) on touch devices. */}
          {zooming && (
            <div
              className="pointer-events-none absolute hidden rounded-md border-2 border-white bg-white/25 shadow-[0_0_0_1px_rgba(0,0,0,0.15)] lg:block"
              style={{ left: lens.x, top: lens.y, width: LENS_SIZE, height: LENS_SIZE }}
            />
          )}

          {!zooming && (
            <span className="pointer-events-none absolute bottom-4 right-4 hidden items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-ink shadow-soft opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:flex">
              <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.8} />
              Hover to zoom
            </span>
          )}

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

        {/* Zoom pane: floats beside the image (over the info column while
            active — hover-only, so it never permanently steals that
            space). Desktop only, same as the lens above. */}
        {zooming && (
          <div
            className="pointer-events-none absolute left-full top-0 z-50 ml-4 hidden aspect-[4/5] w-[380px] max-w-[38vw] overflow-hidden rounded-xl3 border border-stone-150 bg-beige-50 shadow-[0_20px_60px_rgba(24,19,14,0.25)] lg:block"
            style={{
              backgroundImage: `url(${images[active]})`,
              backgroundSize: `${ZOOM_FACTOR * 100}%`,
              backgroundPosition: bgPosition,
              backgroundRepeat: "no-repeat",
            }}
          />
        )}
      </div>
    </div>
  );
}
