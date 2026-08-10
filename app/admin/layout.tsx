import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { getUserPermissions } from "@/lib/supabase/permissions";
import {
  getUnreadNotificationCount,
  getLowStockVariantsForAdmin,
  getAllNotificationsForAdmin,
} from "@/lib/data/admin";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminQuickSearch from "@/components/admin/AdminQuickSearch";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminUser();
  if (!user) redirect("/account?next=%2Fadmin");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) redirect("/account");

  const permissions = await getUserPermissions(user.id);
  const canViewNotifications = permissions.has("view_admin_notifications");
  const canViewInventory = permissions.has("manage_inventory");

  const [unreadNotifications, lowStockVariants, recentNotifications] =
    await Promise.all([
      canViewNotifications ? getUnreadNotificationCount() : Promise.resolve(0),
      canViewInventory ? getLowStockVariantsForAdmin() : Promise.resolve([]),
      canViewNotifications ? getAllNotificationsForAdmin(5) : Promise.resolve([]),
    ]);

  const sidebar = (
    <AdminSidebar
          unreadNotifications={unreadNotifications}
          lowStockCount={lowStockVariants.length}
          role={profile.role}
          permissions={[...permissions]}
    />
  );

  return (
    <DashboardShell
      variant="admin"
      title="Zakhnook Admin"
      subtitle={`${profile.role.charAt(0).toUpperCase()}${profile.role.slice(1)} workspace`}
      sidebar={sidebar}
      headerTools={
        <>
          {permissions.has("manage_users") && (
            <div className="hidden w-[min(34vw,420px)] sm:block"><AdminQuickSearch /></div>
          )}
          {canViewNotifications && (
            <AdminNotificationBell notifications={recentNotifications} unreadCount={unreadNotifications} />
          )}
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
