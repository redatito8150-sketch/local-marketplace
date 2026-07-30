import type { TaxonomyNode } from "@/types";

// Fashion Fit values (see spec). Built the same way as
// lib/inventory/sizeProfiles.ts's size-profile recommender — a pure
// signals-over-taxonomy-name function, with a Fashion-wide fallback list —
// so a future taxonomy vertical (e.g. Home) can add its own fit map later
// without touching this one.
export const FASHION_FITS = [
  "Slim Fit",
  "Regular Fit",
  "Relaxed Fit",
  "Oversized Fit",
  "Loose Fit",
  "Tailored Fit",
  "Straight Fit",
  "Skinny Fit",
  "Tapered Fit",
  "Wide Leg",
  "Flared Fit",
  "Cropped Fit",
  "Athletic Fit",
] as const;

export type FashionFit = (typeof FASHION_FITS)[number];

function taxonomySignals(nodes: TaxonomyNode[], productTypeId: string): string {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const leaf = byId.get(productTypeId);
  const group = leaf?.parentId ? byId.get(leaf.parentId) : undefined;
  const main = group?.parentId ? byId.get(group.parentId) : undefined;
  return [leaf?.name, group?.name, main?.name].filter(Boolean).join(" ").toLowerCase();
}

// Product Types where "Fit" (Slim/Regular/Oversized/...) doesn't mean
// anything — jewelry, shoes, bags, and other flat accessories.
export function isFitApplicable(nodes: TaxonomyNode[], productTypeId: string): boolean {
  if (!productTypeId) return true;
  const signals = taxonomySignals(nodes, productTypeId);
  return !/ring|jewelry|jewellery|necklace|earring|bracelet|shoe|sneaker|boot|sandal|footwear|bag|wallet|belt|jewel/.test(signals);
}

// Ordered by relevance to the resolved Product Type -> Product Group ->
// Main Category, narrowing the full Fashion list rather than replacing it
// — every returned value is still one of FASHION_FITS.
export function recommendedFits(nodes: TaxonomyNode[], productTypeId: string): FashionFit[] {
  if (!productTypeId) return [...FASHION_FITS];
  const signals = taxonomySignals(nodes, productTypeId);

  if (/trouser|pants|jeans|denim|bottom|legging/.test(signals)) {
    return ["Slim Fit", "Skinny Fit", "Tapered Fit", "Straight Fit", "Regular Fit", "Wide Leg", "Flared Fit", "Relaxed Fit", "Loose Fit"];
  }
  if (/short/.test(signals)) {
    return ["Regular Fit", "Slim Fit", "Relaxed Fit", "Athletic Fit", "Loose Fit"];
  }
  if (/dress|skirt/.test(signals)) {
    return ["Regular Fit", "Slim Fit", "Relaxed Fit", "Tailored Fit", "Oversized Fit", "Cropped Fit"];
  }
  if (/blazer|jacket|coat|outerwear|suit/.test(signals)) {
    return ["Tailored Fit", "Regular Fit", "Slim Fit", "Oversized Fit", "Relaxed Fit", "Cropped Fit"];
  }
  if (/activewear|sport|athletic|gym|training/.test(signals)) {
    return ["Athletic Fit", "Slim Fit", "Regular Fit", "Relaxed Fit"];
  }
  if (/shirt|top|tee|t-shirt|blouse|sweater|hoodie|knit/.test(signals)) {
    return ["Regular Fit", "Slim Fit", "Oversized Fit", "Relaxed Fit", "Cropped Fit", "Loose Fit"];
  }
  return [...FASHION_FITS];
}
