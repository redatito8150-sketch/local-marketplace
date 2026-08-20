"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, Boxes, ChevronDown, ClipboardList, FileEdit, FolderKanban, History, House, LayoutDashboard, MessageSquare, ShoppingBag, ShoppingCart, type LucideIcon } from "lucide-react";
import { useDashboardSidebar } from "@/components/dashboard/DashboardSidebarContext";

type PortalNavItem = { label: string; href: string; icon: LucideIcon };

const OVERVIEW_ITEM = { label: "Overview", href: "/brand-portal", icon: LayoutDashboard };
const ORDERS_ITEM = { label: "Orders", href: "/brand-portal/orders", icon: ShoppingBag };
const INVENTORY_ITEM = { label: "Inventory", href: "/brand-portal/stock", icon: Boxes };
const PRODUCTS_ITEM = { label: "Products", href: "/brand-portal/products", icon: ShoppingCart };
const COLLECTIONS_ITEM = { label: "Collections", href: "/brand-portal/collections", icon: FolderKanban };
const PROFILE_ITEM = { label: "Brand Profile", href: "/brand-portal/page-content", icon: FileEdit };
const REVIEWS_ITEM = { label: "Reviews", href: "/brand-portal/reviews", icon: MessageSquare };
const ACTIVITY_ITEM = { label: "Activity", href: "/brand-portal/logs", icon: History };

function withBrandHref(href: string, brand: string | null) {
  if (!brand) return href;
  const [pathname, rawQuery = ""] = href.split("?");
  const query = new URLSearchParams(rawQuery);
  query.set("brand", brand);
  return `${pathname}?${query.toString()}`;
}

function NavigationLink({ item, active, collapsed, brand, softCollapsedActive = false }: { item: PortalNavItem; active: boolean; collapsed: boolean; brand: string | null; softCollapsedActive?: boolean }) {
  const Icon = item.icon;
  const collapsedActive = softCollapsedActive
    ? "bg-[#f6e5e3] text-[#A94442] shadow-[0_5px_14px_rgba(200,89,86,0.12)]"
    : "bg-[#292725] text-white shadow-[0_6px_16px_rgba(52,39,31,0.2),inset_0_0_0_1px_rgba(200,89,86,0.35)]";
  return (
    <Link
      href={withBrandHref(item.href, brand)}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`group relative flex items-center text-[13px] font-semibold transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full" : "min-h-10 gap-3 rounded-lg px-3 py-2.5"} ${active ? (collapsed ? collapsedActive : "bg-[#f3ebe4] text-[#242424]") : (collapsed ? "text-[#6f655e] hover:bg-[#f5eee8] hover:text-[#242424]" : "text-[#75685f] hover:bg-[#f7f1eb] hover:text-[#242424]")}`}
    >
      {active && !collapsed ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-mahalyred" aria-hidden="true" /> : null}
      <Icon aria-hidden="true" className={`h-[17px] w-[17px] flex-none transition-[color,transform] duration-200 ${collapsed ? "group-hover:scale-125 group-focus-visible:scale-125" : ""} ${active ? (collapsed && !softCollapsedActive ? "text-white" : "text-mahalyred") : "text-[#a29489] group-hover:text-[#574b43]"}`} strokeWidth={1.8} />
      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[#e8dfd7] bg-[#fffdf9] px-3 py-2 text-[12px] font-semibold text-[#3f3732] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
          {item.label}
        </span>
      ) : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
    </Link>
  );
}

function InventoryBranch({ showWarehouse }: { showWarehouse: boolean }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get("brand");
  const movementActive = pathname === "/brand-portal/stock" && searchParams.get("view") === "activity";
  const inventoryActive = pathname === "/brand-portal/stock" && !movementActive;
  const warehouseActive = pathname === "/brand-portal/warehouse" || pathname.startsWith("/brand-portal/warehouse/");
  const [open, setOpen] = useState(movementActive || warehouseActive);
  const children: PortalNavItem[] = [
    ...(showWarehouse ? [{ label: "Stock Transfers", href: "/brand-portal/warehouse", icon: ClipboardList }] : []),
    { label: "Variant movements", href: "/brand-portal/stock?view=activity", icon: Activity },
  ];

  const childLinks = (
    <div
      role="group"
      aria-label="Inventory destinations"
      className={collapsed
        ? "relative flex flex-col items-center gap-1 pt-1"
        : "relative ml-[19px] mt-0.5 space-y-0.5 pb-0.5 pl-7"}
    >
      <span aria-hidden="true" className={collapsed
        ? "absolute bottom-4 left-1/2 top-0 w-px -translate-x-1/2 bg-[#e3dcd3]"
        : "absolute bottom-[18px] left-0 top-[-4px] w-px bg-[#e3dcd3]"} />
      {children.map((child) => {
        const active = child.href === "/brand-portal/warehouse" ? warehouseActive : movementActive;
        const ChildIcon = child.icon;
        return (
          <Link
            key={child.href}
            href={withBrandHref(child.href, brand)}
            aria-current={active ? "page" : undefined}
            aria-label={child.label}
            className={`group/branch relative z-10 flex font-semibold transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:scale-[0.97] ${collapsed ? "h-8 w-8 items-center justify-center rounded-full bg-white" : "min-h-9 items-center gap-2 rounded-lg px-2.5 text-[11.5px]"} ${active ? "bg-[#f3ebe4] text-[#242424]" : "text-[#75685f] hover:bg-[#f7f1eb] hover:text-[#242424]"}`}
          >
            {!collapsed ? <span aria-hidden="true" className="absolute -left-7 top-1/2 h-px w-5 bg-[#e3dcd3]" /> : null}
            <ChildIcon aria-hidden="true" className={`h-3.5 w-3.5 flex-none ${active ? "text-mahalyred" : "text-[#a29489] group-hover/branch:text-[#574b43]"}`} strokeWidth={1.8} />
            {!collapsed ? <span className="min-w-0 flex-1 truncate">{child.label}</span> : null}
            {collapsed ? (
              <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[#e8dfd7] bg-[#fffdf9] px-3 py-2 text-[12px] font-semibold text-[#3f3732] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-150 group-hover/branch:translate-x-0 group-hover/branch:opacity-100 group-focus-visible/branch:translate-x-0 group-focus-visible/branch:opacity-100">
                {child.label}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );

  if (collapsed) {
    return (
      <div className="rounded-full border border-[#eee7de] bg-white p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]">
        <NavigationLink item={INVENTORY_ITEM} active={inventoryActive} collapsed brand={brand} softCollapsedActive />
        {childLinks}
      </div>
    );
  }

  return (
    <div>
      <div className={`group flex min-h-10 items-center rounded-lg transition-colors ${inventoryActive ? "bg-[#f3ebe4]" : "hover:bg-[#f7f1eb]"}`}>
        <Link
          href={withBrandHref(INVENTORY_ITEM.href, brand)}
          onClick={() => setOpen(false)}
          aria-current={inventoryActive ? "page" : undefined}
          className={`relative flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${inventoryActive ? "text-[#242424]" : "text-[#75685f] group-hover:text-[#242424]"}`}
        >
          {inventoryActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-mahalyred" aria-hidden="true" /> : null}
          <Boxes aria-hidden="true" className={`h-[17px] w-[17px] flex-none ${inventoryActive ? "text-mahalyred" : "text-[#a29489]"}`} strokeWidth={1.8} />
          <span className="truncate">Inventory</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="brand-inventory-destinations"
          aria-label={open ? "Collapse Inventory destinations" : "Expand Inventory destinations"}
          className="mr-1 flex h-8 w-8 flex-none items-center justify-center rounded-md text-[#8d8076] transition-colors hover:bg-white hover:text-[#403730] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
        >
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.8} />
        </button>
      </div>
      {open ? <div id="brand-inventory-destinations">{childLinks}</div> : null}
    </div>
  );
}

export default function BrandPortalNav({ showPageContent = true, showWarehouse = false }: { showPageContent?: boolean; showWarehouse?: boolean }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const groups: Array<{ label: string; items: PortalNavItem[] }> = [
    { label: "Run", items: [OVERVIEW_ITEM, ORDERS_ITEM, INVENTORY_ITEM] },
    { label: "Build", items: [PRODUCTS_ITEM, COLLECTIONS_ITEM, ...(showPageContent ? [PROFILE_ITEM] : [])] },
    { label: "Insights", items: [REVIEWS_ITEM, ...(showPageContent ? [ACTIVITY_ITEM] : [])] },
  ];
  const regularItems = groups.flatMap((group) => group.items).filter((item) => item.href !== INVENTORY_ITEM.href);
  const activeHref = regularItems
    .filter((item) => item.href === "/brand-portal" ? pathname === "/brand-portal" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Brand portal navigation" className="flex min-h-full flex-col">
      <div className={collapsed ? "space-y-3 pt-4" : "space-y-5"}>
        {groups.map((group) => {
          const itemsWithoutInventory = group.items.filter((item) => item.href !== INVENTORY_ITEM.href);
          if (collapsed) {
            return (
              <section key={group.label} aria-label={group.label} className="space-y-3">
                {itemsWithoutInventory.length ? <div className="mx-auto w-14 space-y-1 rounded-full border border-[#eee7de] bg-white p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]">{itemsWithoutInventory.map((item) => <NavigationLink key={item.href} item={item} active={activeHref === item.href} collapsed brand={brand} />)}</div> : null}
                {group.items.some((item) => item.href === INVENTORY_ITEM.href) ? <div className="mx-auto w-14"><InventoryBranch showWarehouse={showWarehouse} /></div> : null}
              </section>
            );
          }
          return (
            <section key={group.label} aria-label={group.label}>
              <p className="mb-1.5 flex items-center gap-2 px-3 text-[10.5px] font-semibold tracking-[-0.01em] text-[#a29489]"><span className="h-1 w-1 rounded-full bg-mahalyred/70" aria-hidden="true" />{group.label}</p>
              <div className="space-y-0.5">{group.items.map((item) => item.href === INVENTORY_ITEM.href
                ? <InventoryBranch key={item.href} showWarehouse={showWarehouse} />
                : <NavigationLink key={item.href} item={item} active={activeHref === item.href} collapsed={false} brand={brand} />)}</div>
            </section>
          );
        })}
      </div>
      <div className={collapsed ? "mt-auto" : "mt-auto border-t border-[#e3dcd3] pt-4"}>
        {!collapsed && <p className="mb-2 px-3 text-[10px] font-medium text-[#a29489]">Zakhnook website</p>}
        <div className={collapsed ? "mx-auto w-14 rounded-full border border-[#eee7de] bg-white p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : undefined}>
          <Link href="/" aria-label="Back to homepage" className={`group relative flex items-center text-[13px] font-semibold text-[#75685f] transition-[background-color,color,transform] duration-200 hover:text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full hover:bg-[#f5eee8]" : "min-h-10 gap-3 rounded-lg px-3 py-2.5 hover:bg-[#f7f1eb]"}`}>
            <House aria-hidden="true" className={`h-[17px] w-[17px] flex-none text-[#a29489] transition-[color,transform] duration-200 group-hover:text-mahalyred ${collapsed ? "group-hover:scale-125 group-focus-visible:scale-125" : ""}`} strokeWidth={1.8} />
            {collapsed ? <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[#e8dfd7] bg-[#fffdf9] px-3 py-2 text-[12px] font-semibold text-[#3f3732] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">Back to homepage</span> : <span>Back to homepage</span>}
          </Link>
        </div>
      </div>
    </nav>
  );
}
