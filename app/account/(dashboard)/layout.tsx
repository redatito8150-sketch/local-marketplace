import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccountHeaderCard from "@/components/account/AccountHeaderCard";
import AccountSidebar from "@/components/account/AccountSidebar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/accountAuth";

export default async function AccountDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/account");

  const supabase = createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

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
            <AccountSidebar />
          </div>
          <div>{children}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
