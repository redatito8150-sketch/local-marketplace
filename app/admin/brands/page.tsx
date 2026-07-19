import Link from "next/link";
import { LayoutDashboard, Pencil } from "lucide-react";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import DeleteEntityButton from "@/components/admin/DeleteEntityButton";

export default async function AdminBrandsPage() {
  const brands = await getAllBrandsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Brands ({brands.length})
        </h1>
        <Link
          href="/admin/brands/new"
          className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          Add brand
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Brand</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">City</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {brands.map((brand) => (
              <tr key={brand.slug}>
                <td className="flex items-center gap-3 px-5 py-3">
                  <div className="h-10 w-10 overflow-hidden rounded-md bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brand.heroImage}
                      alt={brand.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-medium text-ink">{brand.name}</p>
                    <p className="text-[12px] text-ink-soft/50">/{brand.slug}</p>
                  </div>
                </td>
                <td className="px-5 py-3 text-ink-soft/70">{brand.category}</td>
                <td className="px-5 py-3 text-ink-soft/70">{brand.city}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/brand-portal?brand=${brand.slug}`}
                      aria-label={`View ${brand.name}'s portal`}
                      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                    >
                      <LayoutDashboard className="h-4 w-4" strokeWidth={1.6} />
                    </Link>
                    <Link
                      href={`/admin/brands/${brand.slug}/edit`}
                      aria-label={`Edit ${brand.name}`}
                      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.6} />
                    </Link>
                    <DeleteEntityButton
                      apiPath={`/api/admin/brands/${brand.slug}`}
                      name={brand.name}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {brands.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No brands yet.</p>
        )}
      </div>
    </div>
  );
}
