import Link from "next/link";

export default function BrandPicker({
  brands,
}: {
  brands: { slug: string; name: string }[];
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Select a brand</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        You&apos;re viewing the brand portal as an admin — pick a brand to see its orders and
        stock.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {brands.map((brand) => (
          <Link
            key={brand.slug}
            href={`/brand-portal?brand=${brand.slug}`}
            className="rounded-xl3 border border-stone-150 bg-white p-4 text-[13.5px] font-medium text-ink transition-colors hover:border-ink/20"
          >
            {brand.name}
          </Link>
        ))}
        {brands.length === 0 && (
          <p className="text-sm text-ink-soft/60">No brands yet.</p>
        )}
      </div>
    </div>
  );
}
