"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, ShoppingBag, Package, ShoppingCart, FileEdit, History, ArrowLeft } from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/brand-portal", icon: LayoutDashboard },
  { label: "Products", href: "/brand-portal/products", icon: ShoppingCart },
  { label: "Orders", href: "/brand-portal/orders", icon: ShoppingBag },
  { label: "Stock", href: "/brand-portal/stock", icon: Package },
];

// A client component so it can read the current ?brand= param and carry
// it forward on every link — the layout that renders this is a Server
// Component and (unlike pages) never receives searchParams, so this is
// the only place that can keep an admin's brand selection alive while
// they move between Overview/Orders/Stock.
export default function BrandPortalNav({
  showPageContent = true,
}: {
  // Page Content and Logs are both owner-only concerns (Round 3) —
  // assistants never see either in the nav, matching each route's own
  // accessLevel gate.
  showPageContent?: boolean;
}) {
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const withBrand = (href: string) => (brand ? `${href}?brand=${brand}` : href);

  const items = showPageContent
    ? [
        ...NAV_ITEMS,
        { label: "Page Content", href: "/brand-portal/page-content", icon: FileEdit },
        { label: "Logs", href: "/brand-portal/logs", icon: History },
      ]
    : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === "/brand-portal" ? pathname === "/brand-portal" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={withBrand(item.href)}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
              active ? "bg-beige-100 text-ink" : "text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
            }`}
          >
            <item.icon className="h-4 w-4" strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}
      <div className="my-2 border-t border-stone-150" />
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
        Back to site
      </Link>
    </nav>
  );
}
