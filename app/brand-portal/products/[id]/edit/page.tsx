import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getProductForAdmin } from "@/lib/data/admin";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductForm from "@/components/admin/ProductForm";
import type { ProductRecord } from "@/types";

export default async function EditBrandPortalProductPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ brand?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner || !owner.brandSlug) redirect("/brand-portal/products");

  const product = await getProductForAdmin(params.id);
  if (!product || product.brandSlug !== owner.brandSlug) notFound();

  const taxonomy = await getSiteContentWithFallback("product_taxonomy", DEFAULT_PRODUCT_TAXONOMY);

  // If there's already a staged edit awaiting review, continue from that
  // draft instead of the live data — otherwise a second edit before the
  // first is reviewed would silently discard the first one.
  const initial: ProductRecord = product.pendingChanges
    ? ({ ...product, ...product.pendingChanges } as ProductRecord)
    : product;

  return (
    <div>
      <Link
        href="/brand-portal/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft/60 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
        Back to products
      </Link>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Edit {product.name}</h1>
      {product.status === "published" && (
        <p className="mb-6 rounded-md bg-beige-100 px-4 py-2.5 text-[12.5px] text-ink">
          This product is live. Your changes will be reviewed before they replace what shoppers
          currently see.
        </p>
      )}
      {product.reviewNotes && (
        <p className="mb-6 rounded-md bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">
          <span className="font-semibold">Admin feedback:</span> {product.reviewNotes}
        </p>
      )}
      <ProductForm
        mode="edit"
        productId={product.id}
        initial={initial}
        brandOptions={[]}
        taxonomy={taxonomy}
        lockedBrand={{ slug: owner.brandSlug, name: owner.brandName ?? owner.brandSlug }}
        apiBasePath="/api/brand-portal/products"
        cancelHref="/brand-portal/products"
      />
    </div>
  );
}
