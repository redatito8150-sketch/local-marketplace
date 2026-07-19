"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ExternalLink, ImageOff, Monitor, RefreshCw, Smartphone } from "lucide-react";
import ProductBreadcrumb from "@/components/product/ProductBreadcrumb";
import ProductGallery from "@/components/product/ProductGallery";
import ProductInfo from "@/components/product/ProductInfo";
import ProductAccordion from "@/components/product/ProductAccordion";
import { parseLines } from "@/lib/admin/parseTextInputs";
import {
  buildPreviewProduct,
  deriveProductImages,
  type ProductPreviewFormValues,
} from "@/lib/admin/buildPreviewProduct";

// Wrapped locally (not edited at the source) so unrelated field edits don't
// re-render pieces of the preview that don't depend on them.
const MemoProductGallery = memo(ProductGallery);
const MemoProductInfo = memo(ProductInfo);
const MemoProductAccordion = memo(ProductAccordion);

export default function ProductLivePreview({
  form,
  productId,
  hasUnsavedChanges,
  justSaved,
}: {
  form: ProductPreviewFormValues;
  productId?: string;
  hasUnsavedChanges: boolean;
  justSaved: boolean;
}) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [mounted, setMounted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const previewImages = useMemo(
    () => deriveProductImages(form.image, form.images),
    [form.image, form.images]
  );

  const previewProduct = useMemo(() => buildPreviewProduct(form, productId), [form, productId]);

  const previewAccordion = useMemo(
    () => ({
      description: form.description.trim(),
      details: parseLines(form.detailsText),
      careInstructions: parseLines(form.careInstructionsText),
      shippingReturns: form.shippingReturns.trim(),
    }),
    [form.description, form.detailsText, form.careInstructionsText, form.shippingReturns]
  );

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-xl3 border border-stone-150 bg-white shadow-soft">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-150 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2 w-2 flex-none rounded-full bg-green-500" />
            <span className="text-[12.5px] font-semibold text-ink">Live Preview</span>
            {hasUnsavedChanges && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                Unsaved changes
              </span>
            )}
            {justSaved && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="rounded-full bg-green-50 px-2 py-0.5 text-[10.5px] font-semibold text-green-700"
              >
                Saved successfully
              </motion.span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Refresh preview"
              aria-label="Refresh preview"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>

            {productId ? (
              <Link
                href={`/product/${productId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open product page"
                aria-label="Open product page"
                className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
              </Link>
            ) : (
              <span
                title="Save the product first"
                aria-label="Save the product first to open its page"
                className="cursor-not-allowed rounded-md p-1.5 text-ink-soft/25"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
              </span>
            )}

            <div className="mx-1 h-4 w-px bg-stone-150" />

            <button
              type="button"
              title="Desktop preview"
              aria-label="Desktop preview"
              onClick={() => setViewport("desktop")}
              className={`rounded-md p-1.5 transition-colors ${
                viewport === "desktop"
                  ? "bg-beige-100 text-ink"
                  : "text-ink-soft/60 hover:bg-stone-100"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              title="Mobile preview"
              aria-label="Mobile preview"
              onClick={() => setViewport("mobile")}
              className={`rounded-md p-1.5 transition-colors ${
                viewport === "mobile"
                  ? "bg-beige-100 text-ink"
                  : "text-ink-soft/60 hover:bg-stone-100"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[75vh] overflow-y-auto overflow-x-auto bg-stone-50 p-4">
          {!mounted ? (
            <PreviewSkeleton />
          ) : (
            // Swallows clicks on any link inside the reused components (brand
            // link, breadcrumb, "Size guide") so this stays visual-only —
            // Add to Cart/Wishlist are already disabled via ProductInfo's
            // own `disableActions` prop, not this handler.
            <div
              onClick={(e) => {
                const link = (e.target as HTMLElement).closest("a");
                if (link) e.preventDefault();
              }}
              className={`mx-auto max-w-full rounded-xl2 bg-cream transition-all duration-300 ${
                viewport === "mobile"
                  ? "w-[390px] overflow-hidden rounded-[2rem] border-[6px] border-ink/80"
                  : "w-full"
              }`}
            >
              <div key={refreshKey}>
                <ProductBreadcrumb
                  categoryLabel={previewProduct.categoryLabel}
                  categoryHref={previewProduct.categoryHref}
                  productName={previewProduct.name}
                />

                <div className="px-6 pb-8">
                  <div className="grid grid-cols-1 gap-8">
                    <motion.div
                      key={previewImages[0] ?? "no-image"}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25 }}
                    >
                      {previewImages.length > 0 ? (
                        <MemoProductGallery images={previewImages} alt={previewProduct.name} />
                      ) : (
                        <ImagePlaceholder />
                      )}
                    </motion.div>

                    <MemoProductInfo product={previewProduct} disableActions />
                  </div>

                  <div className="mt-10">
                    <MemoProductAccordion {...previewAccordion} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImagePlaceholder() {
  return (
    <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl3 bg-beige-50 text-ink-soft/40">
      <ImageOff className="h-8 w-8" strokeWidth={1.4} />
      <p className="text-[12.5px] font-medium">No valid image yet</p>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-2">
      <div className="aspect-[4/5] w-full rounded-xl3 bg-stone-150" />
      <div className="h-4 w-2/3 rounded bg-stone-150" />
      <div className="h-4 w-1/3 rounded bg-stone-150" />
      <div className="h-10 w-full rounded bg-stone-150" />
    </div>
  );
}
