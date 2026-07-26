import Image from "next/image";

// CSS-only abstract branded composition for the legal-page hero — no stock
// photography exists in the project that fits a neutral legal page (see
// audit: public/images only has product/category photography), and the
// task calls for a CSS composition rather than an external image
// dependency. Built from the existing cream/beige/mahalyred-soft palette
// plus the real logo mark, so it still reads as "Mahaly" rather than a
// generic gradient block.
export default function LegalArtwork() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/3] w-full overflow-hidden rounded-xl3 border border-stone-150 bg-gradient-to-br from-beige-100 via-cream to-stone-50"
    >
      <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-mahalyred/10 blur-2xl" />
      <div className="absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-beige-200/70 blur-2xl" />
      <div className="absolute inset-8 rounded-xl2 border border-stone-150/80 bg-card/70" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 rounded-xl2 bg-card/90 px-10 py-8 shadow-soft">
          <Image src="/logo.png" alt="" width={40} height={40} className="opacity-90" />
          <span className="font-serif text-[15px] tracking-tightest text-ink/70">Mahaly</span>
        </div>
      </div>
    </div>
  );
}
