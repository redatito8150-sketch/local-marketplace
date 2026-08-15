"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpenText,
  Boxes,
  ChevronDown,
  CreditCard,
  FileText,
  Grid2X2,
  History,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquareWarning,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import { useDashboardSidebar } from "@/components/dashboard/DashboardSidebarContext";
import type { PermissionKey } from "@/lib/supabase/permissions";

type Role = "staff" | "manager" | "admin";
type BadgeKey = "notifications" | "lowStock";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  permission: PermissionKey;
  minRole?: Role;
  badge?: BadgeKey;
  activePaths?: string[];
}

const PRIMARY_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Run",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard, permission: "view_analytics" },
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag, permission: "manage_orders" },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: Boxes,
        permission: "manage_inventory",
        badge: "lowStock",
        activePaths: ["/admin/inventory", "/admin/low-stock", "/admin/warehouse"],
      },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Products", href: "/admin/products", icon: Package, permission: "manage_products" },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: Grid2X2,
        permission: "manage_products",
        minRole: "manager",
        activePaths: ["/admin/categories", "/admin/products/categories", "/admin/content/categories"],
      },
      { label: "Brands", href: "/admin/brands", icon: Store, permission: "manage_brands" },
    ],
  },
  {
    label: "Experience",
    items: [
      { label: "Page Studio", href: "/admin/page-studio", icon: LayoutTemplate, permission: "manage_page_studio", minRole: "manager" },
      { label: "Reviews", href: "/admin/reviews", icon: MessageSquareWarning, permission: "moderate_reviews" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Customers & Access", href: "/admin/users", icon: Users, permission: "manage_users" },
      { label: "Notifications", href: "/admin/notifications", icon: Bell, permission: "view_admin_notifications", badge: "notifications" },
    ],
  },
];

const SECONDARY_ITEMS: NavItem[] = [
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, permission: "view_analytics" },
  { label: "Payments", href: "/admin/payments", icon: CreditCard, permission: "manage_orders" },
  { label: "Refund Review", href: "/admin/payments/refund-queue", icon: AlertTriangle, permission: "manage_orders" },
  { label: "Low Stock", href: "/admin/low-stock", icon: AlertTriangle, permission: "manage_inventory", badge: "lowStock" },
  { label: "Warehouse", href: "/admin/warehouse", icon: Warehouse, permission: "manage_inventory" },
  { label: "Coupons", href: "/admin/coupons", icon: Tag, permission: "manage_coupons", minRole: "manager" },
  { label: "Applications", href: "/admin/applications", icon: FileText, permission: "manage_applications" },
  { label: "Brand Activity", href: "/admin/products/review", icon: History, permission: "manage_products" },
  { label: "Content Library", href: "/admin/content", icon: BookOpenText, permission: "manage_site_content", minRole: "manager" },
  { label: "Audit Log", href: "/admin/audit-log", icon: History, permission: "view_audit_log", minRole: "admin" },
  { label: "Settings", href: "/admin/settings", icon: Settings, permission: "manage_settings", minRole: "manager" },
];

const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3 };
const canSeeRole = (role: string, minRole: Role = "staff") => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];

function matchesPath(pathname: string, path: string): boolean {
  if (path === "/admin") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function itemMatchesPath(pathname: string, item: NavItem): boolean {
  return (item.activePaths ?? [item.href]).some((path) => matchesPath(pathname, path));
}

function getActiveHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((item) => itemMatchesPath(pathname, item))
    .sort((a, b) => {
      const aLength = Math.max(...(a.activePaths ?? [a.href]).filter((path) => matchesPath(pathname, path)).map((path) => path.length));
      const bLength = Math.max(...(b.activePaths ?? [b.href]).filter((path) => matchesPath(pathname, path)).map((path) => path.length));
      return bLength - aLength;
    })[0]?.href;
}

function NavigationLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  const { collapsed } = useDashboardSidebar();
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`group relative flex items-center text-[13px] font-semibold transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full" : "min-h-10 gap-3 rounded-lg px-3 py-2.5"} ${active ? (collapsed ? "bg-[var(--admin-text)] text-white shadow-[0_6px_16px_rgba(52,39,31,0.2),inset_0_0_0_1px_rgba(200,89,86,0.35)]" : "bg-[var(--admin-selected)] text-[var(--admin-text)]") : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"}`}
    >
      {active && !collapsed ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--admin-primary)]" aria-hidden="true" /> : null}
      <Icon aria-hidden="true" className={`h-[17px] w-[17px] flex-none transition-[color,transform] duration-200 ${collapsed ? "group-hover:scale-125 group-focus-visible:scale-125" : ""} ${active ? (collapsed ? "text-white" : "text-[var(--admin-primary)]") : "text-[var(--admin-text-muted)]/70 group-hover:text-[var(--admin-text)]"}`} strokeWidth={1.8} />
      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--admin-text)] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
          {item.label}
        </span>
      ) : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {count > 0 ? <span className={`${collapsed ? "absolute -right-1 -top-1" : ""} flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-primary-soft)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--admin-primary)]`}>{count}</span> : null}
    </Link>
  );
}

function NavigationGroup({ label, items, activeHref, counts }: { label: string; items: NavItem[]; activeHref?: string; counts: Record<BadgeKey, number> }) {
  const { collapsed } = useDashboardSidebar();

  return (
    <section aria-label={label} className={collapsed ? "mx-auto w-14 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : undefined}>
      {!collapsed ? <p className="mb-1.5 flex items-center gap-2 px-3 text-[10.5px] font-semibold tracking-[-0.01em] text-[var(--admin-text-muted)]/70"><span className="h-1 w-1 rounded-full bg-[var(--admin-primary)]/70" aria-hidden="true" />{label}</p> : null}
      <div className={collapsed ? "space-y-1" : "space-y-0.5"}>
        {items.map((item) => <NavigationLink key={item.href} item={item} active={activeHref === item.href} count={item.badge ? counts[item.badge] : 0} />)}
      </div>
    </section>
  );
}

function MoreTools({ items, activeHref, counts }: { items: NavItem[]; activeHref?: string; counts: Record<BadgeKey, number> }) {
  const { collapsed } = useDashboardSidebar();
  const containsActiveRoute = items.some((item) => item.href === activeHref);
  const [open, setOpen] = useState(containsActiveRoute);
  const [wasActive, setWasActive] = useState(containsActiveRoute);

  if (containsActiveRoute !== wasActive) {
    setWasActive(containsActiveRoute);
    if (containsActiveRoute) setOpen(true);
  }

  return (
    <div className={collapsed ? "mx-auto w-14 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : "border-t border-[var(--admin-border)] pt-3"}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="admin-more-tools" aria-label="More tools" className={`group relative flex items-center font-semibold text-[var(--admin-text-muted)] transition-[background-color,color,transform] duration-200 hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full" : "min-h-10 w-full gap-3 rounded-lg px-3 py-2.5 text-[13px]"}`}>
        <Grid2X2 aria-hidden="true" className="h-[17px] w-[17px] flex-none text-[var(--admin-text-muted)]/70 transition-transform duration-200 group-hover:scale-110" strokeWidth={1.8} />
        {!collapsed ? <span className="min-w-0 flex-1 text-left">More tools</span> : null}
        {!collapsed ? <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} /> : null}
        {collapsed ? <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--admin-text)] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">More tools</span> : null}
      </button>
      {open ? <div id="admin-more-tools" className={`mt-1 space-y-1 ${collapsed ? "pt-1" : "pl-2"}`}>{items.map((item) => <NavigationLink key={item.href} item={item} active={activeHref === item.href} count={item.badge ? counts[item.badge] : 0} />)}</div> : null}
    </div>
  );
}

export default function AdminSidebar({ unreadNotifications = 0, lowStockCount = 0, role = "admin", permissions = [] }: { unreadNotifications?: number; lowStockCount?: number; role?: string; permissions?: PermissionKey[] }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const permissionSet = new Set(permissions);
  const counts = { notifications: unreadNotifications, lowStock: lowStockCount };
  const canSeeItem = (item: NavItem) => canSeeRole(role, item.minRole) && permissionSet.has(item.permission);
  const groups = PRIMARY_GROUPS.map((group) => ({ ...group, items: group.items.filter(canSeeItem) })).filter((group) => group.items.length > 0);
  const secondaryItems = SECONDARY_ITEMS.filter(canSeeItem);
  const activeHref = getActiveHref(pathname, [...groups.flatMap((group) => group.items), ...secondaryItems]);

  return (
    <nav aria-label="Admin navigation" className="flex min-h-full flex-col">
      <div className={collapsed ? "space-y-3 pt-4" : "space-y-5"}>
        {groups.map((group) => <NavigationGroup key={group.label} label={group.label} items={group.items} activeHref={activeHref} counts={counts} />)}
        {secondaryItems.length > 0 ? <MoreTools items={secondaryItems} activeHref={activeHref} counts={counts} /> : null}
      </div>
      <div className={collapsed ? "mt-auto pt-3" : "mt-auto border-t border-[var(--admin-border)] pt-4"}>
        {!collapsed ? <p className="mb-2 px-3 text-[10px] font-medium text-[var(--admin-text-muted)]/70">Switch workspace</p> : null}
        <div className={collapsed ? "mx-auto w-14 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : "space-y-0.5"}>
          <NavigationLink item={{ label: "Brand Portal", href: "/brand-portal", icon: Store, permission: "manage_brands" }} active={false} count={0} />
          <NavigationLink item={{ label: "Storefront", href: "/", icon: ArrowLeft, permission: "view_analytics" }} active={false} count={0} />
        </div>
      </div>
    </nav>
  );
}
