import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, ShoppingBag, Package, ArrowLeft } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";

const NAV_ITEMS = [
  { label: "Overview", href: "/brand-portal", icon: LayoutDashboard },
  { label: "Orders", href: "/brand-portal/orders", icon: ShoppingBag },
  { label: "Stock", href: "/brand-portal/stock", icon: Package },
];

export default async function BrandPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await requireBrandOwner();
  if (!owner) redirect("/account");

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-stone-150 bg-white">
        <div className="mx-auto flex max-w-screen2xl items-center justify-between px-8 py-5 lg:px-12">
          <Link href="/brand-portal" className="text-lg font-bold tracking-tightest text-ink">
            {owner.brandName}
          </Link>
          <span className="text-[12px] font-medium text-ink-soft/50">Brand Portal</span>
        </div>
      </header>
      <div className="mx-auto grid max-w-screen2xl grid-cols-1 gap-8 px-8 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-12">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-soft/70 transition-colors hover:bg-stone-100 hover:text-ink"
            >
              <item.icon className="h-4 w-4" strokeWidth={1.6} />
              {item.label}
            </Link>
          ))}
          <div className="my-2 border-t border-stone-150" />
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
            Back to site
          </Link>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
