import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/supabase/permissions";
import { getAllRoles, getAllPermissions } from "@/lib/data/roles";
import { DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import RolesManager from "@/components/admin/RolesManager";

export default async function AdminRolesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account");

  const permissions = await getUserPermissions(user.id);
  if (!permissions.has("manage_roles")) redirect("/admin");

  const [roles, allPermissions] = await Promise.all([getAllRoles(), getAllPermissions()]);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="People & access"
        title="Roles & Permissions"
        description="Create roles, grant them specific permissions, and control who holds each one — same model as Discord server roles."
      />
      <div className="mt-6">
        <RolesManager initialRoles={roles} allPermissions={allPermissions} />
      </div>
    </div>
  );
}
