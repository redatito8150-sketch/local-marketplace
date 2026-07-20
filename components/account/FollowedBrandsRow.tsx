import Image from "next/image";
import Link from "next/link";
import type { FollowedBrandSummary } from "@/lib/data/follows";

export default function FollowedBrandsRow({ brands }: { brands: FollowedBrandSummary[] }) {
  if (brands.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-[15px] font-semibold text-ink">Brands You Follow</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((brand) => (
          <Link
            key={brand.slug}
            href={`/brands/${brand.slug}`}
            className="group overflow-hidden rounded-xl3 border border-stone-150 bg-white"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <Image
                src={brand.heroImage}
                alt={brand.name}
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <p className="p-3 text-[13px] font-semibold text-ink">{brand.name}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
