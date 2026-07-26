import LegalArtwork from "@/components/legal/LegalArtwork";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LAST_UPDATED_DATE } from "@/config/legal";
import LegalPlaceholder from "@/components/legal/LegalPlaceholder";

export default function LegalHero({ title, intro }: { title: string; intro: string }) {
  return (
    <section className="border-b border-stone-150 bg-card">
      <div className="mx-auto grid max-w-screen2xl gap-10 px-6 py-14 sm:px-8 md:grid-cols-2 md:items-center md:gap-14 md:py-20 lg:px-12">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-mahalyred">Legal</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tightest text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft/80">{intro}</p>
          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-2 text-[12.5px] text-ink-soft/60">
            <div className="flex gap-1.5">
              <dt className="font-semibold text-ink-soft/80">Effective date:</dt>
              <dd>
                <LegalPlaceholder value={LEGAL_EFFECTIVE_DATE} />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold text-ink-soft/80">Last updated:</dt>
              <dd>
                <LegalPlaceholder value={LEGAL_LAST_UPDATED_DATE} />
              </dd>
            </div>
          </dl>
        </div>
        <LegalArtwork />
      </div>
    </section>
  );
}
