import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Pencil } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getProductsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import ProductPauseToggle from "@/components/brand-portal/ProductPauseToggle";
import RequestDeletionButton from "@/components/brand-portal/RequestDeletionButton";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-stone-100 text-ink-soft/70" },
  pending_review: { label: "Pending Review", className: "bg-amber-50 text-amber-700" },
  changes_requested: { label: "Changes Requested", className: "bg-red-50 text-red-700" },
  published: { label: "Published", className: "bg-green-50 text-green-700" },
  archived: { label: "Archived", className: "bg-stone-100 text-ink-soft/70" },
};

export default async function BrandPortalProductsPage(
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

  const products = await getProductsForBrand(owner.brandSlug, owner.isImpersonating);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Products ({products.length})
        </h1>
        <Link
          href="/brand-portal/products/new"
          className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          Add product
        </Link>
      </div>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        New products and edits go live only after an admin approves them.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {products.map((product) => {
              const statusInfo = STATUS_LABELS[product.status] ?? {
                label: product.status,
                className: "bg-stone-100 text-ink-soft/70",
              };
              return (
                <tr key={product.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 flex-none overflow-hidden rounded-md bg-stone-100">
                        <Image src={product.image} alt={product.name} fill className="object-cover" />
                      </div>
                      <p className="font-medium text-ink">{product.name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-soft/70">
                    {formatPrice(product.price, product.currency)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                      {product.hasPendingEdit && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          Edit Pending
                        </span>
                      )}
                      {product.pausedByBrand && (
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-ink-soft/70">
                          Paused
                        </span>
                      )}
                    </div>
                    {product.reviewNotes && (
                      <p className="mt-1.5 max-w-xs text-[11.5px] text-red-600">
                        {product.reviewNotes}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {product.status === "published" && (
                        <ProductPauseToggle productId={product.id} paused={product.pausedByBrand} />
                      )}
                      <Link
                        href={`/brand-portal/products/${product.id}/edit`}
                        aria-label={`Edit ${product.name}`}
                        className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.6} />
                      </Link>
                      <RequestDeletionButton
                        productId={product.id}
                        name={product.name}
                        alreadyRequested={Boolean(product.deletionRequestedAt)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {products.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No products yet.</p>
        )}
      </div>
    </div>
  );
}
