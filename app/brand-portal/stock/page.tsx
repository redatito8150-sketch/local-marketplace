import { redirect } from "next/navigation";
import Image from "next/image";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";

export default async function BrandPortalStockPage(
  props: {
    searchParams: Promise<{ brand?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");

  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} />;
  }

  const variants = await getVariantsForBrand(owner.brandSlug, owner.isImpersonating);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Stock</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        Read-only — contact the Local team to update inventory.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium">Variant</th>
              <th className="px-5 py-3 font-medium">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {variants.map((v) => {
              const combo = [v.color, v.size].filter(Boolean).join(" / ") || "Default";
              const low = v.quantity <= v.lowStockThreshold;
              return (
                <tr key={v.variantId}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 flex-none overflow-hidden rounded-md bg-stone-100">
                        <Image src={v.image} alt={v.productName} fill className="object-cover" />
                      </div>
                      <p className="font-medium text-ink">{v.productName}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-soft/70">{combo}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`font-semibold ${low ? "text-red-600" : "text-ink"}`}
                    >
                      {v.quantity}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {variants.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            No products yet.
          </p>
        )}
      </div>
    </div>
  );
}
