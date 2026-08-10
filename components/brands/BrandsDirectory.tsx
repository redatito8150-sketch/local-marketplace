"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronDown,
  Grid2X2,
  List,
  MapPin,
  SlidersHorizontal,
  Store,
  Users,
} from "lucide-react";
import type { FeaturedBrandSummary } from "@/lib/data/brands";
import PartnerBadge from "@/components/shared/PartnerBadge";
import { formatCompactNumber } from "@/lib/format";

type PartnerFilter = "all" | "partner" | "independent";
type SortOption = "featured" | "name" | "newest";
type ViewMode = "grid" | "list";

const ALL = "All";

function BrandCard({ brand, view, partnerIntroActive }: { brand: FeaturedBrandSummary; view: ViewMode; partnerIntroActive: boolean }) {
  const isList = view === "list";

  return (
    <Link
      href={`/brands/${brand.slug}`}
      className={`group overflow-hidden rounded-[22px] border border-[#e8e0d5] bg-[#fffdf9] shadow-[0_8px_30px_rgba(67,45,29,0.06)] transition duration-500 hover:-translate-y-1 hover:border-[#cdb9a3] hover:shadow-[0_20px_45px_rgba(67,45,29,0.13)] ${
        isList ? "sm:grid sm:min-h-[190px] sm:grid-cols-[240px_minmax(0,1fr)]" : ""
      }`}
    >
      <div className={`relative overflow-hidden bg-[#e9dfd2] ${isList ? "h-44 sm:h-full sm:min-h-[190px]" : "h-44"}`}>
        <Image
          src={brand.thumbnail}
          alt={`${brand.name} brand`}
          fill
          sizes={isList ? "(max-width: 640px) 100vw, 240px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"}
          className="object-cover transition duration-700 ease-out group-hover:scale-[1.045]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2b160c]/30 via-transparent to-transparent" />
        {brand.isMahalyPartner && (
          <span
            className={`brand-partner-badge ${partnerIntroActive ? "brand-partner-badge-intro" : ""} absolute top-3 inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full border border-white/60 bg-white/90 px-[7px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f2d27] shadow-sm backdrop-blur ${isList ? "right-3 sm:left-3 sm:right-auto sm:[transform-origin:left_center]" : "right-3"}`}
          >
            <BadgeCheck className="brand-partner-badge-icon h-4 w-4 shrink-0" />
            <span className="brand-partner-badge-label whitespace-nowrap">Zakhnook partner</span>
          </span>
        )}
      </div>

      <div className={`relative flex flex-col ${isList ? "min-h-[130px] px-4 pb-1 pt-1 sm:min-h-[190px] sm:px-6 sm:pb-2 sm:pl-14 sm:pt-3" : "min-h-[130px] px-4 pb-1 pt-1"}`}>
        <div className={`absolute flex items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-[#f2e5d2] shadow-sm ${isList ? "-top-3 left-4 h-16 w-16 sm:-left-8 sm:top-9" : "-top-3 left-4 h-16 w-16"}`}>
          {brand.logoImage ? (
            <Image src={brand.logoImage} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span className="font-serif text-2xl font-semibold text-[#57221e]">{brand.name.charAt(0)}</span>
          )}
        </div>

        <div className={`flex items-start justify-between gap-3 ${isList ? "ml-[72px] sm:ml-0" : "ml-[72px]"}`}>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[16px] font-bold tracking-[-0.02em] text-[#242424]">
              {brand.name}
              {brand.isMahalyPartner && <PartnerBadge className="h-4 w-4" />}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#766b61]">
              <span>{brand.category}</span>
              {brand.additionalCategories.length > 0 && (
                <span className="group/categories relative">
                  <span className="inline-flex cursor-default rounded-full bg-[#f0e4d8] px-1.5 py-0.5 text-[10px] font-bold text-[#74332d]">
                    +{brand.additionalCategories.length}
                  </span>
                  <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-[#242424] px-3 py-2 text-[11px] leading-5 text-white opacity-0 shadow-xl transition-opacity group-hover/categories:opacity-100">
                    {brand.additionalCategories.join(", ")}
                  </span>
                </span>
              )}
            </p>
          </div>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[#5d2722] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>

        <div className={`flex items-center justify-between border-t border-[#eee7dd] pt-3 text-xs text-[#74695f] ${isList ? "mt-4 sm:mt-auto" : "mt-4"}`}>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {brand.city}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#6f2d27]">
            <Users className="h-3.5 w-3.5" />
            {formatCompactNumber(brand.followerCount)} {brand.followerCount === 1 ? "Follower" : "Followers"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function BrandsDirectory({ brands }: { brands: FeaturedBrandSummary[] }) {
  const [category, setCategory] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [partner, setPartner] = useState<PartnerFilter>("all");
  const [sort, setSort] = useState<SortOption>("featured");
  const [view, setView] = useState<ViewMode>("grid");
  const [partnerIntroActive, setPartnerIntroActive] = useState(true);

  useEffect(() => {
    const introTimer = window.setTimeout(() => setPartnerIntroActive(false), 3200);
    return () => window.clearTimeout(introTimer);
  }, []);

  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(brands.flatMap((brand) => [brand.category, ...brand.additionalCategories]))).sort()],
    [brands]
  );
  const cities = useMemo(() => [ALL, ...Array.from(new Set(brands.map((brand) => brand.city))).sort()], [brands]);

  const visibleBrands = useMemo(() => {
    const result = brands.filter((brand) => {
      if (category !== ALL && brand.category !== category && !brand.additionalCategories.includes(category)) return false;
      if (city !== ALL && brand.city !== city) return false;
      if (partner === "partner" && !brand.isMahalyPartner) return false;
      if (partner === "independent" && brand.isMahalyPartner) return false;
      return true;
    });

    return result.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return Number(b.isMahalyPartner) - Number(a.isMahalyPartner);
    });
  }, [brands, category, city, partner, sort]);

  const hasFilters = category !== ALL || city !== ALL || partner !== "all";

  return (
    <section className="mx-auto max-w-screen2xl px-4 pb-20 sm:px-6 lg:px-12">
      <div className="sticky top-[76px] z-30 rounded-[20px] border border-[#e5ddd2] bg-[#fffdf9]/95 p-3 shadow-[0_10px_35px_rgba(59,39,26,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Filter by category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full appearance-none rounded-full border border-[#e4dbd0] bg-[#fbf7f1] px-4 pr-10 text-sm font-semibold text-[#242424] outline-none transition focus:border-[#AC3935] focus:ring-2 focus:ring-[#AC3935]/10">
                {categories.map((item) => <option key={item} value={item}>{item === ALL ? "All categories" : item}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-3.5 h-4 w-4 text-[#776a61]" />
            </label>

            <label className="relative">
              <span className="sr-only">Filter by location</span>
              <select value={city} onChange={(event) => setCity(event.target.value)} className="h-11 w-full appearance-none rounded-full border border-[#e4dbd0] bg-[#fbf7f1] px-4 pr-10 text-sm font-semibold text-[#242424] outline-none transition focus:border-[#AC3935] focus:ring-2 focus:ring-[#AC3935]/10">
                {cities.map((item) => <option key={item} value={item}>{item === ALL ? "All locations" : item}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-3.5 h-4 w-4 text-[#776a61]" />
            </label>

            <label className="relative">
              <span className="sr-only">Filter by Zakhnook partnership</span>
              <select value={partner} onChange={(event) => setPartner(event.target.value as PartnerFilter)} className="h-11 w-full appearance-none rounded-full border border-[#e4dbd0] bg-[#fbf7f1] px-4 pr-10 text-sm font-semibold text-[#242424] outline-none transition focus:border-[#AC3935] focus:ring-2 focus:ring-[#AC3935]/10">
                <option value="all">All brands</option>
                <option value="partner">Zakhnook partners</option>
                <option value="independent">Independent brands</option>
              </select>
              <SlidersHorizontal className="pointer-events-none absolute right-4 top-3.5 h-4 w-4 text-[#776a61]" />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 xl:justify-end">
            <p className="whitespace-nowrap text-xs text-[#766b61]"><span className="font-bold text-[#242424]">{visibleBrands.length}</span> brands</p>
            {hasFilters && <button type="button" onClick={() => { setCategory(ALL); setCity(ALL); setPartner("all"); }} className="text-xs font-bold text-[#8a3a32] hover:text-[#612620]">Clear filters</button>}
            <label className="relative hidden sm:block">
              <span className="sr-only">Sort brands</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="h-10 appearance-none bg-transparent pl-3 pr-8 text-xs font-semibold text-[#242424] outline-none">
                <option value="featured">Featured first</option>
                <option value="newest">Newest</option>
                <option value="name">Name A–Z</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-3 h-3.5 w-3.5" />
            </label>
            <div className="flex rounded-full border border-[#e2d8cc] bg-[#f8f2ea] p-1" aria-label="Brand display style">
              <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`rounded-full p-2 transition ${view === "grid" ? "bg-[#54211d] text-white shadow-sm" : "text-[#7b6e65] hover:text-[#54211d]"}`}><Grid2X2 className="h-4 w-4" /></button>
              <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`rounded-full p-2 transition ${view === "list" ? "bg-[#54211d] text-white shadow-sm" : "text-[#7b6e65] hover:text-[#54211d]"}`}><List className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>

      {visibleBrands.length > 0 ? (
        <div className={`mt-5 grid gap-4 ${view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 lg:grid-cols-2"}`}>
          {visibleBrands.map((brand) => (
            <BrandCard key={brand.slug} brand={brand} view={view} partnerIntroActive={partnerIntroActive} />
          ))}
        </div>
      ) : (
        <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d8cabc] bg-[#fffdf9] px-6 text-center">
          <Store className="h-9 w-9 text-[#8a5148]" />
          <h2 className="mt-4 text-xl font-bold text-[#242424]">No brands match these filters</h2>
          <p className="mt-2 text-sm text-[#766b61]">Try another location, category, or partnership type.</p>
          <button type="button" onClick={() => { setCategory(ALL); setCity(ALL); setPartner("all"); }} className="mt-5 rounded-full bg-[#57221e] px-5 py-2.5 text-xs font-bold text-white">Show all brands</button>
        </div>
      )}
    </section>
  );
}
