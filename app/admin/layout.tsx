import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getUnreadNotificationCount,
  getLowStockVariantsForAdmin,
  getAllNotificationsForAdmin,
  getUnresolvedBrandActivityCount,
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) redirect("/account");

  const [unreadNotifications, lowStockVariants, recentNotifications, reviewQueueCount] =
    await Promise.all([
      getUnreadNotificationCount(),
      getLowStockVariantsForAdmin(),
      getAllNotificationsForAdmin(5),
      getUnresolvedBrandActivityCount(),
    ]);

  const sidebar = (
    <AdminSidebar
          unreadNotifications={unreadNotifications}
          lowStockCount={lowStockVariants.length}
          reviewQueueCount={reviewQueueCount}
          role={profile.role}
    />
  );

  return (
    <DashboardShell
      variant="admin"
      title="Mahaly Admin"
      subtitle={`${profile.role.charAt(0).toUpperCase()}${profile.role.slice(1)} workspace`}
      sidebar={sidebar}
      headerTools={
        <>
          <div className="hidden w-[min(34vw,420px)] sm:block"><AdminQuickSearch /></div>
          <AdminNotificationBell notifications={recentNotifications} unreadCount={unreadNotifications} />
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
