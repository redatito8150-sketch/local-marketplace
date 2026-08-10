import type { User } from "@supabase/supabase-js";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requirePermission } from "@/lib/supabase/permissions";

// Gates the Local Warehouse receiving actions (confirm/reject a transfer
// from Zakhnook's side). Any is_admin account always qualifies (same floor
// as every other admin route) — on top of that, an account holding the
// "manage_inventory" custom-role permission qualifies too, without needing
// full admin, so a dedicated warehouse-receiving staff member can be
// granted just this via /admin/users' role assignment rather than made a
// full admin.
export async function requireWarehouseReceiver(): Promise<User | null> {
  const admin = await requireAdminUser();
  if (admin) return admin;
  const permitted = await requirePermission("manage_inventory");
  return permitted?.user ?? null;
}
