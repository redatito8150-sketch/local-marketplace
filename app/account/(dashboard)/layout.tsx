import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccountHeaderCard from "@/components/account/AccountHeaderCard";
import AccountSidebar from "@/components/account/AccountSidebar";
import AccountDashboardLink from "@/components/account/AccountDashboardLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { resolveAvatarUrl } from "@/lib/account/avatar";
import { getNotificationsForUser, getUnreadNotificationCountForUser } from "@/lib/data/userNotifications";

export default async function AccountDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) {
    // x-pathname is set by proxy.ts on every request — carries the exact
    // protected page (e.g. /account/wishlist) the visitor was trying to
    // reach, so signing in lands them back there instead of always at
    // /account/overview.
    const pathname = (await headers()).get("x-pathname");
    redirect(pathname ? `/account?next=${encodeURIComponent(pathname)}` : "/account");
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, is_admin, avatar_url, provider_avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const avatarUrl = resolveAvatarUrl(profile?.avatar_url, profile?.provider_avatar_url);
  const [notifications, unreadNotificationCount] = await Promise.all([
    getNotificationsForUser(user.id, 5),
    getUnreadNotificationCountForUser(user.id),
  ]);

  // Same precedence as Header.tsx's dashboardHref — an admin always
  // outranks a brand link, and neither shows for a plain customer account.
  const dashboardHref = profile?.is_admin
    ? "/admin"
    : profile?.role === "brand_owner" || profile?.role === "brand_assistant"
      ? "/brand-portal"
      : null;
  const dashboardLabel = profile?.is_admin ? "Admin Dashboard" : "Brand Portal";

  return (
    <main className="account-theme flex min-h-screen flex-col [&>*]:w-full bg-[var(--account-bg)] text-[var(--account-text)]">
      <Header />
      <section className="mx-auto max-w-screen3xl px-4 py-7 sm:px-6 sm:py-10 lg:px-10 lg:py-12 xl:px-12">
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[280px_minmax(0,1fr)] xl:gap-10">
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <AccountHeaderCard
              fullName={profile?.full_name ?? ""}
              email={profile?.email ?? user.email ?? ""}
              role={profile?.role ?? "customer"}
              avatarUrl={avatarUrl}
              notifications={notifications}
              unreadNotificationCount={unreadNotificationCount}
            />
            {dashboardHref && (
              <AccountDashboardLink href={dashboardHref} label={dashboardLabel} />
            )}
            <AccountSidebar />
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
