import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { listDeletionSchedules, type DeletionScheduleRow } from "@/lib/admin/productDeletion";
import { safeErrorResponse } from "@/lib/apiError";

// Admin's deletion-schedules operational page's API — NOT an approval
// queue (there is nothing here for an admin to approve; ordinary
// deletion is database-authoritative and automatic). Filterable by
// status/brand/partner/search, paginated entirely at the database level
// (private.admin_search_deletion_schedules).
export async function GET(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status") as DeletionScheduleRow["status"] | null;
  const brandId = params.get("brandId");
  const isPartnerParam = params.get("isPartner");
  const search = params.get("search");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 25));

  try {
    const result = await listDeletionSchedules({
      status: status ?? undefined,
      brandId: brandId ?? undefined,
      isPartner: isPartnerParam === "true" ? true : isPartnerParam === "false" ? false : undefined,
      search: search ?? undefined,
      limit,
      offset: (page - 1) * limit,
    });
    return NextResponse.json({ schedules: result.rows, total: result.total, page, limit, hasMore: (page - 1) * limit + result.rows.length < result.total });
  } catch (error) {
    return safeErrorResponse("admin.products.deletion-schedules.list", error as Error, "Failed to load deletion schedules");
  }
}
