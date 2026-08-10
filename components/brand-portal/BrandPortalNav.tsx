"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, FileEdit, FolderKanban, History, LayoutDashboard, MessageSquare, Package, ShoppingBag, ShoppingCart, Warehouse } from "lucide-react";
import { useDashboardSidebar } from "@/components/dashboard/DashboardSidebarContext";

const GROUPS = [
  { items: [{ label: "Overview", href: "/brand-portal", icon: LayoutDashboard }] },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/brand-portal/products", icon: ShoppingCart },
      { label: "Collections", href: "/brand-portal/collections", icon: FolderKanban },
      { label: "Inventory", href: "/brand-portal/stock", icon: Package },
    ],
  },
  { label: "Sales", items: [{ label: "Orders", href: "/brand-portal/orders", icon: ShoppingBag }, { label: "Reviews", href: "/brand-portal/reviews", icon: MessageSquare }] },
];

export default function BrandPortalNav({ showPageContent = true, showWarehouse = false }: { showPageContent?: boolean; showWarehouse?: boolean }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const withBrand = (href: string) => (brand ? `${href}?brand=${brand}` : href);
  // Local Warehouse only exists for Zakhnook Partner brands — everyone else's
  // catalog stock is entirely self-managed, so the nav link (and the page
  // itself) would just be dead weight for them.
  let groups = showWarehouse
    ? GROUPS.map((group) =>
        group.label === "Catalog"
          ? { ...group, items: [...group.items, { label: "Local Warehouse", href: "/brand-portal/warehouse", icon: Warehouse }] }
          : group
      )
    : GROUPS;
  groups = showPageContent
    ? [...groups, { label: "Brand", items: [
        { label: "Brand Profile", href: "/brand-portal/page-content", icon: FileEdit },
        { label: "Activity", href: "/brand-portal/logs", icon: History },
      ] }]
    : groups;
  const allItems = groups.flatMap((group) => group.items);
  const activeHref = allItems
    .filter((item) => item.href === "/brand-portal" ? pathname === "/brand-portal" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Brand portal navigation" className="space-y-6">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label && !collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a29489]">{group.label}</p>}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={withBrand(item.href)}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={collapsed ? item.label : undefined}
                  className={`group flex min-h-10 items-center rounded-xl py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${active ? "bg-[#3b332d] text-white shadow-sm" : "text-[#75685f] hover:bg-[#f1eae2] hover:text-[#242424]"}`}
                >
                  <item.icon className={`h-[17px] w-[17px] ${active ? "text-white" : "text-[#a29489] group-hover:text-[#574b43]"}`} strokeWidth={1.8} />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="border-t border-[#e3dcd3] pt-4">
        <Link href="/" aria-label="Storefront" title={collapsed ? "Storefront" : undefined} className={`flex items-center rounded-xl py-2.5 text-[13px] font-semibold text-[#75685f] hover:bg-[#f1eae2] hover:text-[#242424] ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}>
          <ArrowLeft className="h-[17px] w-[17px] text-[#a29489]" /> {!collapsed && "Storefront"}
        </Link>
      </div>
    </nav>
  );
}
