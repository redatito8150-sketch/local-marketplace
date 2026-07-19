import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import {
  getAllProductsForAdmin,
  getAllBrandsForAdmin,
  getAllOrdersForAdmin,
  getAllProfilesForAdmin,
} from "@/lib/data/admin";
import type { AdminSearchResult } from "@/types";

const MAX_PER_TYPE = 5;

// Filters over the same admin data functions every list page already uses —
// no separate search index, matching the storefront's own precedent
// (lib/data/products.ts's searchProducts is a live query, not a cache, but
// the admin catalog here is small enough that filtering already-fetched
// rows in memory is simpler and just as fast).
export async function GET(request: NextRequest) {
  const staff = await requireStaffRole("staff");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const [products, brands, orders, profiles] = await Promise.all([
    getAllProductsForAdmin(),
    getAllBrandsForAdmin(),
    getAllOrdersForAdmin(),
    getAllProfilesForAdmin(),
  ]);

  const results: AdminSearchResult[] = [];

  results.push(
    ...products
      .filter((p) => p.name.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q))
      .slice(0, MAX_PER_TYPE)
      .map((p) => ({
        type: "product" as const,
        label: p.name,
        sublabel: p.brandName,
        href: `/admin/products/${p.id}/edit`,
      }))
  );

  results.push(
    ...brands
      .filter((b) => b.name.toLowerCase().includes(q))
      .slice(0, MAX_PER_TYPE)
      .map((b) => ({
        type: "brand" as const,
        label: b.name,
        sublabel: b.category,
        href: `/admin/brands/${b.slug}/edit`,
      }))
  );

  results.push(
    ...orders
      .filter((o) => o.orderNumber.toLowerCase().includes(q))
      .slice(0, MAX_PER_TYPE)
      .map((o) => ({
        type: "order" as const,
        label: `#${o.orderNumber}`,
        sublabel: o.shippingName,
        href: `/admin/orders/${o.id}`,
      }))
  );

  results.push(
    ...profiles
      .filter(
        (p) => p.email?.toLowerCase().includes(q) || p.fullName?.toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_TYPE)
      .map((p) => ({
        type: "user" as const,
        label: p.fullName || p.email || p.id,
        sublabel: p.email ?? "",
        href: `/admin/users`,
      }))
  );

  return NextResponse.json({ results });
}
