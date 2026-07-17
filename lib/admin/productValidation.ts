import type { ProductColorOption } from "@/types";

export interface ProductInput {
  name: string;
  brandName: string;
  brandSlug?: string;
  category?: "women" | "men" | "kids";
  price: number;
  currency: "USD" | "EGP";
  image: string;
  images?: string[];
  colors: ProductColorOption[];
  sizes: string[];
  description: string;
  details: string[];
  careInstructions: string[];
  shippingReturns: string;
  sku?: string;
  inStock: boolean;
  isNew: boolean;
  isUnisex: boolean;
  unavailableSizes: string[];
}

export function validateProductInput(body: ProductInput): string | null {
  if (!body.name?.trim()) return "Name is required";
  if (!body.brandName?.trim()) return "Brand name is required";
  if (!Number.isFinite(body.price) || body.price <= 0) return "Price must be a positive number";
  if (!body.image?.trim()) return "Main image URL is required";
  if (!Array.isArray(body.sizes) || body.sizes.length === 0) return "At least one size is required";
  return null;
}
