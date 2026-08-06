"use client";

import { useState } from "react";
import ProductGallery from "./ProductGallery";
import ProductInfo from "./ProductInfo";
import type { ProductDetail } from "@/types";

// Holds the one piece of state ProductGallery and ProductInfo need to
// share (the mapped image for the currently selected Color) — kept out of
// both components individually so gallery navigation can never leak back
// into variant selection, and an explicit Color pick can only ever change
// which image is *shown*, never reorder/mutate the gallery itself.
export default function ProductGalleryAndInfo({
  product,
  disableActions,
  signedIn = false,
  subscribedVariantIds = [],
}: {
  product: ProductDetail;
  disableActions?: boolean;
  signedIn?: boolean;
  subscribedVariantIds?: string[];
}) {
  const [featuredImage, setFeaturedImage] = useState<string | undefined>(undefined);

  return (
    <>
      <ProductGallery images={product.images} alt={product.name} featuredImage={featuredImage} />
      <ProductInfo
        product={product}
        disableActions={disableActions}
        onColorImageChange={setFeaturedImage}
        signedIn={signedIn}
        subscribedVariantIds={subscribedVariantIds}
      />
    </>
  );
}
