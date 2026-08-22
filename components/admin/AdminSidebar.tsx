"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpenText,
  Boxes,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Grid2X2,
  History,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquareWarning,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from "lucide-react";
import { useDashboardSidebar } from "@/components/dashboard/DashboardSidebarContext";
import type { PermissionKey } from "@/lib/supabase/permissions";

type Role = "staff" | "manager" | "admin";
type BadgeKey = "notifications" | "pendingRequests";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  permission: PermissionKey;
  minRole?: Role;
  badge?: BadgeKey;
  activePaths?: string[];
  hideWhenPermission?: PermissionKey;
  children?: Array<{
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: BadgeKey;
  }>;
}

const PRIMARY_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Run",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard, permission: "view_analytics" },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ShoppingBag,
        permission: "manage_orders",
        activePaths: ["/admin/orders", "/admin/payments"],
        children: [
          { label: "Payments", href: "/admin/payments", icon: CreditCard },
          { label: "Refund review", href: "/admin/payments/refund-queue", icon: RotateCcw },
        ],
      },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: Boxes,
        permission: "manage_inventory",
        activePaths: ["/admin/inventory", "/admin/warehouse"],
        children: [
          { label: "Stock requests", href: "/admin/warehouse", icon: ClipboardList, badge: "pendingRequests" },
          { label: "Variant movements", href: "/admin/inventory?view=activity", icon: Activity },
        ],
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
      {
        label: "Brands",
        href: "/admin/brands",
        icon: Store,
        permission: "manage_brands",
        activePaths: ["/admin/brands", "/admin/applications", "/admin/products/review"],
      },
    ],
  },
  {
    label: "Experience",
    items: [
      {
        label: "Page Studio",
        href: "/admin/page-studio",
        icon: LayoutTemplate,
        permission: "manage_page_studio",
        minRole: "manager",
        activePaths: ["/admin/page-studio", "/admin/content"],
      },
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
  { label: "Coupons", href: "/admin/coupons", icon: Tag, permission: "manage_coupons", minRole: "manager" },
  { label: "Applications", href: "/admin/applications", icon: Store, permission: "manage_applications", hideWhenPermission: "manage_brands" },
  { label: "Brand Activity", href: "/admin/products/review", icon: History, permission: "manage_products", hideWhenPermission: "manage_brands" },
  { label: "Content Library", href: "/admin/content", icon: BookOpenText, permission: "manage_site_content", minRole: "manager", hideWhenPermission: "manage_page_studio" },
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
      className={`group relative flex items-center text-[13px] font-semibold transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full" : "min-h-10 gap-3 rounded-lg px-3 py-2.5"} ${active ? (collapsed ? "bg-[var(--admin-selected)] text-[var(--admin-primary)] shadow-[0_6px_16px_rgba(200,89,86,0.11),inset_0_0_0_1px_rgba(200,89,86,0.18)]" : "bg-[var(--admin-selected)] text-[var(--admin-text)]") : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"}`}
    >
      {active && !collapsed ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--admin-primary)]" aria-hidden="true" /> : null}
      <Icon aria-hidden="true" className={`h-[17px] w-[17px] flex-none transition-[color,transform] duration-200 ${collapsed ? "group-hover:scale-125 group-focus-visible:scale-125" : ""} ${active ? "text-[var(--admin-primary)]" : "text-[var(--admin-text-muted)]/70 group-hover:text-[var(--admin-text)]"}`} strokeWidth={1.8} />
      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--admin-text)] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
          {item.label}
        </span>
      ) : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {count > 0 ? <span className={`${collapsed ? "absolute -right-1 -top-1" : ""} flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-primary-soft)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--admin-primary)]`}>{count}</span> : null}
    </Link>
  );
}

function NavigationBranch({ item, counts }: { item: NavItem; counts: Record<BadgeKey, number> }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childIsActive = (href: string) => {
    const [path, query] = href.split("?");
    if (!matchesPath(pathname, path)) return false;
    if (!query) return true;
    const expected = new URLSearchParams(query);
    return [...expected.entries()].every(([key, value]) => searchParams.get(key) === value);
  };
  const activeChildHref = item.children
    ?.filter((child) => childIsActive(child.href))
    .sort((a, b) => b.href.split("?")[0].length - a.href.split("?")[0].length)[0]?.href;
  const childActive = Boolean(activeChildHref);
  const overviewActive = itemMatchesPath(pathname, item) && !childActive;
  const [open, setOpen] = useState(childActive);
  const Icon = item.icon;
  const branchId = `admin-${item.label.toLowerCase().replaceAll(" ", "-")}-destinations`;

  const childLinks = (
    <div
      role="group"
      aria-label={`${item.label} destinations`}
      className={collapsed
        ? "relative flex flex-col items-center gap-1 pt-1"
        : "relative ml-[19px] mt-0.5 space-y-0.5 pb-0.5 pl-7"}
    >
      <span
        aria-hidden="true"
        className={collapsed
          ? "absolute bottom-4 left-1/2 top-0 w-px -translate-x-1/2 bg-[var(--admin-border)]"
          : "absolute bottom-[18px] left-0 top-[-4px] w-px bg-[var(--admin-border)]"}
      />
      {item.children?.map((child) => {
        const active = child.href === activeChildHref;
        const ChildIcon = child.icon;
        const count = child.badge ? counts[child.badge] : 0;
        return (
          <Link
            key={child.href}
            href={child.href}
            aria-current={active ? "page" : undefined}
            aria-label={child.label}
            className={`group/branch relative z-10 flex font-semibold transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 active:scale-[0.97] ${collapsed ? "h-8 w-8 items-center justify-center rounded-full bg-[var(--admin-sidebar)]" : "min-h-9 items-center gap-2 rounded-lg px-2.5 text-[11.5px]"} ${active ? "bg-[var(--admin-selected)] text-[var(--admin-text)]" : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"}`}
          >
            {!collapsed ? <span aria-hidden="true" className="absolute -left-7 top-1/2 h-px w-5 bg-[var(--admin-border)]" /> : null}
            <ChildIcon aria-hidden="true" className={`h-3.5 w-3.5 flex-none ${active ? "text-[var(--admin-primary)]" : "text-[var(--admin-text-muted)]/65 group-hover/branch:text-[var(--admin-text)]"}`} strokeWidth={1.8} />
            {!collapsed ? <span className="min-w-0 flex-1 truncate">{child.label}</span> : null}
            {count > 0 ? <span className={`${collapsed ? "absolute -right-1 -top-1" : ""} flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--admin-primary-soft)] px-1 text-[9px] font-extrabold tabular-nums text-[var(--admin-primary)]`}>{count}</span> : null}
            {collapsed ? (
              <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--admin-text)] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-150 group-hover/branch:translate-x-0 group-hover/branch:opacity-100 group-focus-visible/branch:translate-x-0 group-focus-visible/branch:opacity-100">
                {child.label}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className={collapsed ? "rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : undefined}>
      {collapsed ? (
        <>
          <NavigationLink item={item} active={overviewActive} count={0} />
          {childLinks}
        </>
      ) : (
        <>
          <div className={`group flex min-h-10 items-center rounded-lg transition-colors ${overviewActive ? "bg-[var(--admin-selected)]" : "hover:bg-[var(--admin-surface-muted)]"}`}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={overviewActive ? "page" : undefined}
              className={`relative flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 ${overviewActive ? "text-[var(--admin-text)]" : "text-[var(--admin-text-muted)] group-hover:text-[var(--admin-text)]"}`}
            >
              {overviewActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--admin-primary)]" aria-hidden="true" /> : null}
              <Icon aria-hidden="true" className={`h-[17px] w-[17px] flex-none ${overviewActive ? "text-[var(--admin-primary)]" : "text-[var(--admin-text-muted)]/70"}`} strokeWidth={1.8} />
              <span className="truncate">{item.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={branchId}
              aria-label={open ? `Collapse ${item.label} destinations` : `Expand ${item.label} destinations`}
              className="mr-1 flex h-8 w-8 flex-none items-center justify-center rounded-md text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-surface)] hover:text-[var(--admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25"
            >
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.8} />
            </button>
          </div>
          {open ? <div id={branchId}>{childLinks}</div> : null}
        </>
      )}
    </div>
  );
}

function NavigationGroup({ label, items, activeHref, counts }: { label: string; items: NavItem[]; activeHref?: string; counts: Record<BadgeKey, number> }) {
  const { collapsed } = useDashboardSidebar();

  if (collapsed) {
    const regularItems = items.filter((item) => !item.children);
    const branchItems = items.filter((item) => item.children);

    return (
      <section aria-label={label} className="space-y-3">
        {regularItems.length > 0 ? (
          <div className="mx-auto w-14 space-y-1 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]">
            {regularItems.map((item) => <NavigationLink key={item.href} item={item} active={activeHref === item.href} count={item.badge ? counts[item.badge] : 0} />)}
          </div>
        ) : null}
        {branchItems.map((item) => <div key={item.href} className="mx-auto w-14"><NavigationBranch item={item} counts={counts} /></div>)}
      </section>
    );
  }

  return (
    <section aria-label={label}>
      <p className="mb-1.5 flex items-center gap-2 px-3 text-[10.5px] font-semibold tracking-[-0.01em] text-[var(--admin-text-muted)]/70"><span className="h-1 w-1 rounded-full bg-[var(--admin-primary)]/70" aria-hidden="true" />{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => item.children
          ? <NavigationBranch key={item.href} item={item} counts={counts} />
          : <NavigationLink key={item.href} item={item} active={activeHref === item.href} count={item.badge ? counts[item.badge] : 0} />)}
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

export default function AdminSidebar({ unreadNotifications = 0, pendingRequestCount = 0, role = "admin", permissions = [] }: { unreadNotifications?: number; pendingRequestCount?: number; role?: string; permissions?: PermissionKey[] }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const permissionSet = new Set(permissions);
  const counts = { notifications: unreadNotifications, pendingRequests: pendingRequestCount };
  const canSeeItem = (item: NavItem) => canSeeRole(role, item.minRole) && permissionSet.has(item.permission);
  const groups = PRIMARY_GROUPS.map((group) => ({ ...group, items: group.items.filter(canSeeItem) })).filter((group) => group.items.length > 0);
  const secondaryItems = SECONDARY_ITEMS.filter(canSeeItem).filter((item) => !item.hideWhenPermission || !permissionSet.has(item.hideWhenPermission));
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
