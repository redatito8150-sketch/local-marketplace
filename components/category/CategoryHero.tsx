import Image from "next/image";
import { CategoryHeroContent } from "@/types";

export default function CategoryHero({
  hero,
}: {
  hero: CategoryHeroContent;
}) {
  return (
    <section className="mx-auto max-w-screen3xl px-8 lg:px-[60px]">
      <div className="relative h-[230px] w-full overflow-hidden rounded-[20px] bg-beige-100 lg:h-[250px]">
        {/* background image, model on the right */}
        <Image
          src={hero.heroImage}
          alt={hero.title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1560px"
          className="object-cover object-right"
        />

        {/* left readability overlay so text never sits on the model */}
        <div className="absolute inset-0 bg-gradient-to-r from-beige-100 via-beige-100/85 to-transparent lg:w-[62%]" />

        <div className="relative z-10 flex h-full max-w-md flex-col justify-center px-9 lg:px-12">
          <h1 className="font-serif text-4xl font-semibold leading-tight text-ink lg:text-5xl">
            {hero.title}
          </h1>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-ink-soft/75">
            {hero.description}
          </p>
          <a
            href="#products"
            className="mt-6 inline-flex w-fit items-center rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {hero.ctaLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
