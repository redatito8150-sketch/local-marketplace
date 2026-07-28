import type { TaxonomyNode } from "@/types";

export type SizeProfileKey =
  | "standard-apparel" | "extended-apparel" | "alpha-kids" | "baby-age"
  | "kids-numeric" | "waist-numeric" | "trousers-waist-inseam"
  | "eu-shoes" | "one-size" | "accessories-size" | "jewelry-size" | "custom-only";

export const SIZE_PROFILE_NAMES: Record<SizeProfileKey, string> = {
  "standard-apparel": "Apparel — Standard",
  "extended-apparel": "Apparel — Extended",
  "alpha-kids": "Kids — Alpha",
  "baby-age": "Baby — Age",
  "kids-numeric": "Kids — Numeric",
  "waist-numeric": "Waist Numeric",
  "trousers-waist-inseam": "Trousers — Waist and Inseam",
  "eu-shoes": "Shoes — EU",
  "one-size": "General — One Size",
  "accessories-size": "Accessories",
  "jewelry-size": "Jewelry",
  "custom-only": "Your custom sizes",
};

export function profileForSizeLabel(label: string): SizeProfileKey {
  if (label === "One Size") return "one-size";
  if (/^EU \d+$/.test(label)) return "eu-shoes";
  if (label === "Newborn" || /Months|Years/.test(label)) return "baby-age";
  if (/^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|4XL|5XL)$/.test(label)) {
    return /^(XXXS|XXXL|4XL|5XL)$/.test(label) ? "extended-apparel" : "standard-apparel";
  }
  if (/^(2[4-9]|[3-5]\d)$/.test(label)) return "waist-numeric";
  if (/^(?:[2-9]|1[0-6])$/.test(label)) return "kids-numeric";
  return "accessories-size";
}

export function recommendedSizeProfiles(nodes: TaxonomyNode[], productTypeId: string): SizeProfileKey[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const leaf = byId.get(productTypeId);
  const group = leaf?.parentId ? byId.get(leaf.parentId) : undefined;
  const main = group?.parentId ? byId.get(group.parentId) : undefined;
  const signals = [leaf?.name, group?.name, main?.name].filter(Boolean).join(" ").toLowerCase();

  if (/sneaker|shoe|footwear|boot|sandal/.test(signals)) return ["eu-shoes"];
  if (/baby|bodysuit|newborn|infant/.test(signals)) return ["baby-age"];
  if (/trouser|pants|jeans|bottom/.test(signals)) return ["standard-apparel", "waist-numeric", "trousers-waist-inseam", "one-size"];
  if (/ring|jewelry|jewellery/.test(signals)) return ["jewelry-size", "one-size"];
  if (/belt|accessor/.test(signals)) return ["standard-apparel", "waist-numeric", "one-size"];
  if (/kids|child/.test(signals)) return ["alpha-kids", "kids-numeric", "one-size"];
  if (/clothing|top|shirt|dress|apparel/.test(signals)) return ["standard-apparel", "extended-apparel", "one-size"];
  return ["one-size", "accessories-size"];
}
