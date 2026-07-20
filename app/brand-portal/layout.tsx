import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import BrandPortalNav from "@/components/brand-portal/BrandPortalNav";

export default async function BrandPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No override here — layouts never receive searchParams in the App
  // Router, so an admin's ?brand= selection can only be resolved by the
  // page underneath. This call just decides "is this account allowed in
  // the portal shell at all" (a real brand owner, or any admin).
  const owner = await requireBrandOwner();
  if (!owner) redirect("/account");

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-stone-150 bg-white">
        <div className="mx-auto flex max-w-screen2xl items-center justify-between px-8 py-5 lg:px-12">
          <Link href="/brand-portal" className="text-lg font-bold tracking-tightest text-ink">
            {owner.brandName ?? "Brand Portal"}
          </Link>
          <span className="text-[12px] font-medium text-ink-soft/50">
            {owner.isAdmin && !owner.brandSlug ? "Admin View" : "Brand Portal"}
          </span>
        </div>
      </header>
      <div className="mx-auto grid max-w-screen2xl grid-cols-1 gap-8 px-8 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-12">
        <BrandPortalNav showPageContent={owner.accessLevel === "owner"} />
        <main>{children}</main>
      </div>
    </div>
  );
}
