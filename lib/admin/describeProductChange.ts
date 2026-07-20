import { formatPrice } from "@/lib/format";
import type { ProductInput } from "@/lib/admin/productValidation";

// Minimal shape of a raw `products` row (snake_case, as returned by
// `.select("*")`) — only the fields this file actually compares.
interface ExistingProductRow {
  name: string;
  price: number;
  currency: "USD" | "EGP";
  compare_at_price: number | null;
  description: string;
  image: string;
}

// Instant-Publish notifications need a real explanation of what changed,
// not just "Product updated: X" — this is what the admin sees in the
// notification body before deciding Approve vs Revert.
export function describeProductCreate(body: ProductInput): string {
  const variantCount = body.variants?.length ?? 0;
  return `${body.name} · ${formatPrice(body.price, body.currency)} · ${variantCount} variant${
    variantCount === 1 ? "" : "s"
  }`;
}

export function describeProductUpdate(existing: ExistingProductRow, proposed: ProductInput): string {
  const lines: string[] = [];
  const push = (label: string, before: string, after: string) => {
    if (before !== after) lines.push(`${label}: ${before} → ${after}`);
  };

  push("Name", existing.name, proposed.name);
  push(
    "Price",
    formatPrice(existing.price, existing.currency),
    formatPrice(proposed.price, proposed.currency)
  );
  push(
    "Compare At Price",
    existing.compare_at_price ? formatPrice(existing.compare_at_price, existing.currency) : "—",
    proposed.compareAtPrice ? formatPrice(proposed.compareAtPrice, proposed.currency) : "—"
  );
  if (existing.description !== proposed.description) lines.push("Description updated");
  if (existing.image !== proposed.image) lines.push("Main image updated");

  return lines.length > 0 ? lines.join(" · ") : "Stock, sizes, or gallery images updated";
}

export function describeProductArchive(existing: { name: string }): string {
  return `${existing.name} removed from the storefront by the brand`;
}
