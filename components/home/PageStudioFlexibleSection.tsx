import Image from "next/image";
import Link from "next/link";
import type { BrandSummary } from "@/lib/data/brands";
import type { PageSectionType } from "@/lib/pageStudio/registry";

type Props = {
  type: PageSectionType;
  config: Record<string, unknown>;
  brands?: BrandSummary[];
};

const text = (value: unknown) => typeof value === "string" ? value : "";

export default function PageStudioFlexibleSection({ type, config, brands = [] }: Props) {
  if (type === "promotional_banner") {
    const image = text(config.image);
    return <section className="mx-auto max-w-[1920px] px-6 py-5 md:px-10 xl:px-16"><div className="relative min-h-64 overflow-hidden rounded-2xl bg-stone-100 px-7 py-10 sm:px-12">{image && <Image src={image} alt={text(config.imageAlt)} fill sizes="(max-width: 768px) 100vw, 1400px" className="object-cover" />}<div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent" /><div className="relative z-10 max-w-lg text-white"><h2 className="font-serif text-3xl font-semibold sm:text-4xl">{text(config.title)}</h2>{text(config.description) && <p className="mt-3 text-sm leading-6 text-white/85">{text(config.description)}</p>}{text(config.ctaLabel) && text(config.ctaHref) && <Link href={text(config.ctaHref)} className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-xs font-bold text-ink">{text(config.ctaLabel)}</Link>}</div></div></section>;
  }

  if (type === "editorial_image") {
    const image = text(config.image);
    if (!image) return null;
    return <figure className="mx-auto max-w-[1920px] px-6 py-5 md:px-10 xl:px-16"><div className="relative aspect-[16/7] overflow-hidden rounded-2xl bg-stone-100"><Image src={image} alt={text(config.imageAlt)} fill sizes="(max-width: 768px) 100vw, 1400px" className="object-cover" /></div>{text(config.caption) && <figcaption className="mt-2 text-center text-xs text-ink-soft/70">{text(config.caption)}</figcaption>}</figure>;
  }

  if (type === "text_block") {
    return <section className="mx-auto max-w-3xl px-6 py-10 text-center"><h2 className="font-serif text-3xl font-semibold text-ink">{text(config.title)}</h2><p className="mt-4 whitespace-pre-line text-sm leading-7 text-ink-soft/80">{text(config.body)}</p></section>;
  }

  if (type === "newsletter") {
    return <section className="mx-auto max-w-[1920px] px-6 py-5 md:px-10 xl:px-16"><div className="rounded-2xl bg-[#f3e6e4] px-6 py-9 text-center"><h2 className="font-serif text-3xl font-semibold text-ink">{text(config.title)}</h2>{text(config.description) && <p className="mx-auto mt-3 max-w-xl text-sm text-ink-soft/75">{text(config.description)}</p>}<Link href="/account/notifications" className="mt-5 inline-flex rounded-xl bg-mahalyred px-5 py-3 text-xs font-bold text-white">Manage newsletter preferences</Link></div></section>;
  }

  if (type === "brand_carousel" || type === "sponsored_brands") {
    if (!brands.length) return null;
    return <section className="mx-auto max-w-[1920px] border-b border-stone-150 px-6 py-7 md:px-10 xl:px-16"><h2 className="font-serif text-[25px] font-semibold text-ink">{text(config.title)}</h2><div className="mt-5 flex gap-3 overflow-x-auto pb-2">{brands.map((brand) => <Link key={brand.slug} href={`/brands/${brand.slug}`} className="flex min-h-24 min-w-44 items-center justify-center rounded-2xl border border-stone-150 bg-white p-5 text-center shadow-soft">{brand.logoImage ? <Image src={brand.logoImage} alt={brand.name} width={120} height={48} className="max-h-12 w-auto object-contain" /> : <span className="font-serif text-xl font-semibold text-ink">{brand.name}</span>}</Link>)}</div></section>;
  }

  return null;
}
