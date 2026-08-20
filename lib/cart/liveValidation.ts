import { supabase } from "@/lib/supabase/client";
import { getVariantsForProducts } from "@/lib/data/variants";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import { getVariantEffectivePrice } from "@/lib/pricing";
import { compareSizeOrderables } from "@/lib/inventory/sizeOrder";
import type { CartLineItem } from "@/types";

// Re-checks every cart line against the *current* state of its product,
// on the cart page itself — CartLineItem is a plain localStorage snapshot
// taken at add-to-cart time (price, image, available sizes/colors), which
// can go stale the moment a brand changes stock, price, or a discount, or
// archives/pauses the product outright. Client-side (not an API route) —
// same pattern as lib/data/products.ts's searchProducts, safe with the
// public anon key.

export interface CartValidationVariant {
  id: string;
  size: string;
  color?: string;
  quantity: number;
  purchasable: boolean;
  price: number; // this variant's own live effective price
  originalPrice: number; // pre-discount price — equals price when no discount is active
  discountActive: boolean;
  // Carried through only so `variants` below can be sorted into the same
  // canonical size order the product page and Variants Matrix use (see
  // lib/inventory/sizeOrder.ts) — not meant to be read by callers
  // otherwise; resolveCartLine/the cart page just consume the already-
  // sorted `variants` array in order.
  sizeSortOrder?: number | null;
  sizeBrandId?: string | null;
}

export interface CartValidationEntry {
  productId: string;
  // False for "doesn't exist / draft / archived / paused by the brand" —
  // the whole product is off the table, not just one variant.
  productAvailable: boolean;
  image: string;
  colorImages: Record<string, string>;
  currency: "USD" | "EGP";
  variants: CartValidationVariant[];
}

export async function getCartValidationData(
  productIds: string[]
): Promise<Map<string, CartValidationEntry>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const result = new Map<string, CartValidationEntry>();
  if (ids.length === 0) return result;

  const [{ data: rows, error }, variantsByProduct, mediaResult] = await Promise.all([
    // storefront_products (supabase/migrations/
    // 20260814000006_storefront_launch_gate_view.sql) applies the same
    // product-launch gate here as everywhere else on the storefront — a
    // cart line for a not-yet-launched zakhnook_fulfilled product simply
    // won't come back as a row, so productAvailable below correctly falls
    // through to "not found at all" -> unavailable.
    supabase
      .from("storefront_products")
      .select("id, status, price, currency, image, discount_percent, discount_ends_at")
      .in("id", ids),
    getVariantsForProducts(ids),
    supabase
      .from("product_media")
      .select("product_id, storage_reference, color_option_value_id, option_values:color_option_value_id(label)")
      .in("product_id", ids)
      .eq("is_archived", false)
      .not("color_option_value_id", "is", null),
  ]);
  if (error) throw new Error(`getCartValidationData failed: ${error.message}`);

  const colorImagesByProduct = new Map<string, Record<string, string>>();
  for (const row of (mediaResult.data ?? []) as unknown as {
    product_id: string;
    storage_reference: string;
    option_values: { label: string } | null;
  }[]) {
    if (!row.option_values) continue;
    const map = colorImagesByProduct.get(row.product_id) ?? {};
    map[row.option_values.label] = row.storage_reference;
    colorImagesByProduct.set(row.product_id, map);
  }

  for (const row of rows ?? []) {
    const productId = row.id as string;
    const variants = variantsByProduct.get(productId) ?? [];
    result.set(productId, {
      productId,
      // storefront_products already excludes Paused/Archived/Draft rows —
      // status here can only ever be 'published' for a row that came back
      // at all, but the explicit check is kept as defense in depth.
      productAvailable: row.status === "published",
      image: row.image as string,
      colorImages: colorImagesByProduct.get(productId) ?? {},
      currency: row.currency as "USD" | "EGP",
      variants: variants
        .map((v) => {
          const priceResult = getVariantEffectivePrice(
            Number(row.price),
            v.variantPrice,
            row.discount_percent as number | null,
            row.discount_ends_at as string | null,
            v.variantDiscountPercent
          );
          const sizeOption = v.optionValues.find((o) => o.optionTypeName === "Size");
          return {
            id: v.id,
            size: sizeOption?.label ?? "",
            color: v.optionValues.find((o) => o.optionTypeName === "Color")?.label,
            quantity: v.quantity,
            purchasable: isVariantPurchasable({
              sellingStatus: v.sellingStatus,
              quantity: v.quantity,
              isArchived: v.isArchived,
            }),
            price: priceResult.price,
            originalPrice: v.variantPrice ?? Number(row.price),
            discountActive: priceResult.active,
            sizeSortOrder: sizeOption?.sortOrder,
            sizeBrandId: sizeOption?.brandId,
          };
        })
        // Same canonical order as the product page and Variants Matrix —
        // see lib/inventory/sizeOrder.ts. Previously unsorted (whatever
        // order the DB happened to return), so the cart's size
        // switcher/quantity display could show sizes in a different,
        // effectively arbitrary order from everywhere else on the site.
        .sort((a, b) =>
          compareSizeOrderables(
            { id: a.id, label: a.size, sortOrder: a.sizeSortOrder, brandId: a.sizeBrandId },
            { id: b.id, label: b.size, sortOrder: b.sizeSortOrder, brandId: b.sizeBrandId }
          )
        ),
    });
  }

  // Not found at all (deleted outright) — same "off the table" treatment
  // as archived/paused.
  for (const id of ids) {
    if (!result.has(id)) {
      result.set(id, { productId: id, productAvailable: false, image: "", colorImages: {}, currency: "EGP", variants: [] });
    }
  }

  return result;
}

// Resolves one cart line against its product's live validation entry —
// the single place both the display layer and the checkout gate read
// "is this line actually orderable right now, and if so at what price/
// with what image".
export function resolveCartLine(
  item: CartLineItem,
  entry: CartValidationEntry | undefined
): {
  available: boolean;
  reason?: "unavailable" | "out_of_stock" | "loading";
  variant?: CartValidationVariant;
  livePrice?: number;
  liveImage?: string;
  maxQuantity?: number;
} {
  if (!entry) return { available: false, reason: "loading" };
  if (!entry.productAvailable) return { available: false, reason: "unavailable" };

  const variant =
    (item.variantId && entry.variants.find((v) => v.id === item.variantId)) ||
    entry.variants.find((v) => v.size === item.size && (v.color ?? undefined) === (item.color ?? undefined));

  if (!variant || !variant.purchasable) {
    return { available: false, reason: "out_of_stock", variant: variant ?? undefined };
  }

  return {
    available: true,
    variant,
    livePrice: variant.price,
    liveImage: (item.color && entry.colorImages[item.color]) || entry.image,
    maxQuantity: variant.quantity,
  };
}
