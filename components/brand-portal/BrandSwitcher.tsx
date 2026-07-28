"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function BrandSwitcher({
  brands,
  activeSlug,
}: {
  brands: Array<{ slug: string; name: string }>;
  activeSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedSlug = searchParams.get("brand");
  const selectedSlug = brands.some((brand) => brand.slug === requestedSlug) ? requestedSlug! : activeSlug;
  if (brands.length < 2) return null;

  return (
    <label className="hidden items-center gap-2 sm:flex">
      <span className="sr-only">Active brand</span>
      <select
        aria-label="Active brand"
        value={selectedSlug}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("brand", event.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="min-h-9 max-w-44 rounded-lg border border-[#e3dcd3] bg-[#fffdf9] px-2.5 text-[11.5px] font-semibold text-[#51473f] outline-none focus:ring-2 focus:ring-mahalyred/25"
      >
        {brands.map((brand) => (
          <option key={brand.slug} value={brand.slug}>{brand.name}</option>
        ))}
      </select>
    </label>
  );
}
