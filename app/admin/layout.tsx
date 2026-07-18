import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) redirect("/account");

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-stone-150 bg-white">
        <div className="mx-auto flex max-w-screen2xl items-center px-8 py-5 lg:px-12">
          <Link href="/admin" className="text-lg font-bold tracking-tightest text-ink">
            Local Admin
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-screen2xl grid-cols-1 gap-8 px-8 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-12">
        <AdminSidebar />
        <main>{children}</main>
      </div>
    </div>
  );
}
