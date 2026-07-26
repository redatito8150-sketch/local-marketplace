import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { notFound } from "next/navigation";
import BrandEmptyState from "@/components/brand/BrandEmptyState";
import { getBrandContent } from "@/lib/data/brands";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const brand = await getBrandContent(slug);
  return brand ? { title: `${brand.name} Collections | Mahaly`, description: `Explore complete looks by ${brand.name}.` } : {};
}

export default async function CollectionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const brand = await getBrandContent(slug); if (!brand) notFound();
  return <section className="mx-auto max-w-brand px-5 py-14 sm:px-6 lg:px-10 lg:py-20">
    <div className="max-w-xl"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8f2335]">Curated by {brand.name}</p><h2 className="mt-2 font-serif text-3xl text-[#261f1b] sm:text-4xl">Collections & complete looks</h2><p className="mt-4 text-sm leading-6 text-[#736861]">Considered combinations, designed to be worn together and made entirely from this brand’s current catalogue.</p></div>
    {brand.shopTheLook.length ? <div className="mt-10 grid gap-5 md:grid-cols-2">{brand.shopTheLook.map((look, index) => <Link key={`${look.title}-${index}`} href={look.href || `/brands/${slug}/products`} className={`group relative overflow-hidden rounded-[28px] bg-[#efe6dc] ${index % 3 === 0 ? "md:row-span-2 min-h-[520px]" : "min-h-[350px]"}`}><Image src={look.image} alt={look.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-7 text-white"><div><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-white/70"><Layers3 className="h-3.5 w-3.5" /> Complete look</span><h3 className="mt-2 font-serif text-2xl">{look.title}</h3></div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#371f21]"><ArrowUpRight className="h-4 w-4" /></span></div></Link>)}</div> : <div className="pt-12"><BrandEmptyState title="No collections yet" description="This brand has not published a complete collection. Its individual pieces are still ready to explore." href={`/brands/${slug}/products`} action="Explore Products" /></div>}
  </section>;
}
