// Static, site-wide trust badges shown at the bottom of every brand page —
// not a per-brand database field, matching the precedent already set by
// Footer.tsx's own hardcoded "Secure Payments · Fast Delivery · Easy
// Returns · Customer Support" line.

export interface BrandFeature {
  icon: "gem" | "layout" | "rotateCcw" | "shieldCheck" | "truck";
  label: string;
}

export const BRAND_FEATURES: BrandFeature[] = [
  { icon: "gem", label: "Premium Materials" },
  { icon: "layout", label: "Thoughtful Design" },
  { icon: "rotateCcw", label: "Easy Returns" },
  { icon: "shieldCheck", label: "Secure Payments" },
  { icon: "truck", label: "Fast Delivery" },
];
