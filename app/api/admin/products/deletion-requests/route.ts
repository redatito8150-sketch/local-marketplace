import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { listDeletionRequests, type DeletionRequestRow } from "@/lib/admin/productDeletion";
import { safeErrorResponse } from "@/lib/apiError";

// Admin review queue for permanent-deletion requests — filterable by
// status/brand/partner-vs-non-partner/search (product name/id/brand/
// request id). Never returns a bulk hard-delete action; approval always
// happens per-request via deletion-requests/[id]/approve.
export async function GET(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status") as DeletionRequestRow["status"] | null;
  const brandId = params.get("brandId");
  const isPartnerParam = params.get("isPartner");
  const search = params.get("search");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 25));

  try {
    // Filtering, search, and pagination all happen inside a single
    // database-level query (private.admin_search_deletion_requests) —
    // never loads more rows into memory than this page needs.
    const result = await listDeletionRequests({
      status: status ?? undefined,
      brandId: brandId ?? undefined,
      isPartner: isPartnerParam === "true" ? true : isPartnerParam === "false" ? false : undefined,
      search: search ?? undefined,
      limit,
      offset: (page - 1) * limit,
    });
    return NextResponse.json({ requests: result.rows, total: result.total, page, limit, hasMore: (page - 1) * limit + result.rows.length < result.total });
  } catch (error) {
    return safeErrorResponse("admin.products.deletion-requests.list", error as Error, "Failed to load deletion requests");
  }
}
