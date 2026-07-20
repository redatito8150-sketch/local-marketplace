import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccountHeaderCard from "@/components/account/AccountHeaderCard";
import AccountSidebar from "@/components/account/AccountSidebar";
import AccountDashboardLink from "@/components/account/AccountDashboardLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/accountAuth";

export default async function AccountDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/account");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  // Same precedence as Header.tsx's dashboardHref — an admin always
  // outranks a brand link, and neither shows for a plain customer account.
  const dashboardHref = profile?.is_admin
    ? "/admin"
    : profile?.role === "brand_owner" || profile?.role === "brand_assistant"
      ? "/brand-portal"
      : null;
  const dashboardLabel = profile?.is_admin ? "Admin Dashboard" : "Brand Portal";

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <AccountHeaderCard
              fullName={profile?.full_name ?? ""}
              email={profile?.email ?? user.email ?? ""}
              role={profile?.role ?? "customer"}
            />
            {dashboardHref && (
              <AccountDashboardLink href={dashboardHref} label={dashboardLabel} />
            )}
            <AccountSidebar />
          </div>
          <div>{children}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
