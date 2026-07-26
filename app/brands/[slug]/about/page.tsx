import type { Metadata } from "next";
import Image from "next/image";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { getBrandContent } from "@/lib/data/brands";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const brand = await getBrandContent(slug);
  return brand ? { title: `About ${brand.name} | Mahaly`, description: brand.aboutDescription || brand.tagline } : {};
}

export default async function AboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const brand = await getBrandContent(slug); if (!brand) notFound();
  return <section className="mx-auto max-w-brand px-5 py-14 sm:px-6 lg:px-10 lg:py-20">
    <div className="grid items-center gap-9 lg:grid-cols-12 lg:gap-16">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] bg-[#eee5db] lg:col-span-7"><Image src={brand.aboutImage || brand.storyImage} alt={`The world of ${brand.name}`} fill sizes="(max-width: 1024px) 100vw, 58vw" className="object-cover" /><div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/20 bg-black/25 p-4 text-white backdrop-blur-md"><p className="text-[10px] uppercase tracking-[.2em] text-white/65">Made in {brand.city}</p><p className="mt-1 font-serif text-xl">{brand.tagline}</p></div></div>
      <div className="lg:col-span-5"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#8f2335]">The brand</p><h2 className="mt-3 font-serif text-4xl leading-tight text-[#261f1b] sm:text-5xl">A story made<br />with intention.</h2><p className="mt-6 text-[15px] leading-7 text-[#675d56]">{brand.aboutDescription}</p><div className="mt-8 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#f1e7dc] p-4"><MapPin className="h-4 w-4 text-[#8f2335]" /><p className="mt-4 text-[10px] uppercase tracking-widest text-[#8b7e74]">Home</p><p className="mt-1 text-sm font-semibold">{brand.city}</p></div>{brand.foundedYear && <div className="rounded-2xl bg-[#f1e7dc] p-4"><Sparkles className="h-4 w-4 text-[#8f2335]" /><p className="mt-4 text-[10px] uppercase tracking-widest text-[#8b7e74]">Established</p><p className="mt-1 text-sm font-semibold">{brand.foundedYear}</p></div>}</div>{brand.websiteUrl && <a href={brand.websiteUrl} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 text-xs font-bold text-[#8f2335]">Visit official website <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
    </div>
    {brand.storyBody && <div className="mx-auto grid max-w-5xl gap-8 py-20 lg:grid-cols-[.65fr_1.35fr] lg:py-28"><h3 className="font-serif text-3xl text-[#261f1b]">Our story</h3><p className="text-base leading-8 text-[#675d56]">{brand.storyBody}</p></div>}
    {brand.values.length > 0 && <div className="border-t border-[#e3d7ca] pt-14"><p className="text-center text-[10px] font-bold uppercase tracking-[.22em] text-[#8f2335]">What we stand for</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{brand.values.map((value, index) => <article key={value.title} className="rounded-[24px] border border-[#eadfd4] bg-[#fffaf4] p-6"><span className="font-serif text-2xl text-[#b99b77]">0{index + 1}</span><h4 className="mt-8 font-serif text-xl text-[#2e2722]">{value.title}</h4><p className="mt-3 text-xs leading-6 text-[#776c64]">{value.description}</p></article>)}</div></div>}
  </section>;
}
