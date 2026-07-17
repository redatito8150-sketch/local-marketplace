import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
        <div className="mx-auto flex max-w-screen2xl items-center justify-between px-8 py-5 lg:px-12">
          <Link href="/admin" className="text-lg font-bold tracking-tightest text-ink">
            Local Admin
          </Link>
          <nav className="flex items-center gap-6 text-[13px] font-medium text-ink-soft">
            <Link href="/admin" className="hover:text-ink">
              Products
            </Link>
            <Link href="/admin/products/new" className="hover:text-ink">
              Add product
            </Link>
            <Link href="/" className="hover:text-ink">
              ← Back to site
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen2xl px-8 py-10 lg:px-12">{children}</main>
    </div>
  );
}
