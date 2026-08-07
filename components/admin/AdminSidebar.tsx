"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  History,
  LayoutDashboard,
  LayoutTemplate,
  Package,
  MessageSquareWarning,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import { useDashboardSidebar } from "@/components/dashboard/DashboardSidebarContext";

type Role = "staff" | "manager" | "admin";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  minRole?: Role;
  badge?: "notifications" | "lowStock";
}

interface NavGroupItem {
  label: string;
  icon: React.ElementType;
  minRole?: Role;
  children: NavItem[];
}

function isNavGroupItem(item: NavItem | NavGroupItem): item is NavGroupItem {
  return "children" in item;
}

const NAV_GROUPS: { label?: string; items: (NavItem | NavGroupItem)[] }[] = [
  {
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Products", href: "/admin/products", icon: Package },
      {
        label: "Categories",
        icon: LayoutTemplate,
        minRole: "manager",
        children: [
          { label: "Product Taxonomy", href: "/admin/products/categories", icon: LayoutTemplate, minRole: "manager" },
          { label: "Category Heroes", href: "/admin/content/categories", icon: LayoutTemplate, minRole: "manager" },
        ],
      },
      { label: "Low Stock", href: "/admin/low-stock", icon: AlertTriangle, badge: "lowStock" },
      { label: "Local Warehouse", href: "/admin/warehouse", icon: Warehouse },
      { label: "Review Moderation", href: "/admin/reviews", icon: MessageSquareWarning },
      { label: "Coupons", href: "/admin/coupons", icon: Tag, minRole: "manager" },
    ],
  },
  {
    label: "Brands",
    items: [
      { label: "All Brands", href: "/admin/brands", icon: Store },
      { label: "Applications", href: "/admin/applications", icon: FileText },
      { label: "Brand Activity", href: "/admin/products/review", icon: History },
    ],
  },
  {
    label: "People & Content",
    items: [
      { label: "Customers & Permissions", href: "/admin/users", icon: Users },
      { label: "Page Studio", href: "/admin/page-studio", icon: LayoutTemplate, minRole: "manager" },
      { label: "Notifications", href: "/admin/notifications", icon: Bell, badge: "notifications" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Audit Log", href: "/admin/audit-log", icon: History, minRole: "admin" },
      { label: "Settings", href: "/admin/settings", icon: Settings, minRole: "manager" },
    ],
  },
];

const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3 };
const canSee = (role: string, minRole: Role = "staff") => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];

type BadgeCounts = Record<"notifications" | "lowStock", number>;

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  count,
  indent = false,
}: {
  item: NavItem;
  active: boolean;
  count: number;
  indent?: boolean;
}) {
  const { collapsed } = useDashboardSidebar();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      className={`group flex min-h-10 items-center rounded-xl border-l-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 ${collapsed ? "justify-center gap-0 px-2" : `gap-3 px-3 ${indent ? "ml-3" : ""}`} ${active ? "border-[var(--admin-primary)] bg-[var(--admin-selected)] text-[var(--admin-primary)]" : "border-transparent text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"}`}
    >
      <item.icon className={`h-[17px] w-[17px] ${active ? "text-[var(--admin-primary)]" : "text-[var(--admin-text-muted)]/70 group-hover:text-[var(--admin-text)]"}`} strokeWidth={1.8} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-primary-soft)] px-1.5 text-[10px] font-bold text-[var(--admin-primary)]">{count}</span>}
    </Link>
  );
}

function NavGroupDisclosure({
  group,
  pathname,
  role,
  counts,
}: {
  group: NavGroupItem;
  pathname: string;
  role: string;
  counts: BadgeCounts;
}) {
  const { collapsed } = useDashboardSidebar();
  const visibleChildren = group.children.filter((child) => canSee(role, child.minRole));
  const containsActiveRoute = visibleChildren.some((child) => isActiveHref(pathname, child.href));
  const [open, setOpen] = useState(containsActiveRoute);

  // Keep the group open automatically whenever navigation lands on one of
  // its child routes, even if the user had previously collapsed it — an
  // in-render state adjustment (guarded so it only fires on an actual
  // change) rather than an effect.
  const [wasActive, setWasActive] = useState(containsActiveRoute);
  if (containsActiveRoute !== wasActive) {
    setWasActive(containsActiveRoute);
    if (containsActiveRoute) setOpen(true);
  }

  if (!visibleChildren.length) return null;
  const groupId = `admin-nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={groupId}
        aria-label={group.label}
        title={collapsed ? group.label : undefined}
        className={`group flex min-h-10 w-full items-center rounded-xl border-l-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 ${collapsed ? "justify-center gap-0 px-2" : "gap-3 px-3"} ${containsActiveRoute ? "border-[var(--admin-primary)] text-[var(--admin-primary)]" : "border-transparent text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"}`}
      >
        <group.icon className={`h-[17px] w-[17px] ${containsActiveRoute ? "text-[var(--admin-primary)]" : "text-[var(--admin-text-muted)]/70 group-hover:text-[var(--admin-text)]"}`} strokeWidth={1.8} />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>}
        {!collapsed && <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div id={groupId} className="mt-1 space-y-1">
          {visibleChildren.map((child) => (
            <NavLink key={child.href} item={child} active={isActiveHref(pathname, child.href)} count={child.badge ? counts[child.badge] : 0} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSidebar({
  unreadNotifications = 0,
  lowStockCount = 0,
  role = "admin",
}: {
  unreadNotifications?: number;
  lowStockCount?: number;
  role?: string;
}) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const counts = { notifications: unreadNotifications, lowStock: lowStockCount };

  return (
    <nav aria-label="Admin navigation" className="space-y-6">
      {NAV_GROUPS.map((group, index) => {
        const items = group.items.filter((item) => canSee(role, item.minRole));
        if (!items.length) return null;
        return (
          <div key={group.label ?? index}>
            {group.label && !collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-text-muted)]/75">{group.label}</p>}
            <div className="space-y-1">
              {items.map((item) =>
                isNavGroupItem(item) ? (
                  <NavGroupDisclosure key={item.label} group={item} pathname={pathname} role={role} counts={counts} />
                ) : (
                  <NavLink key={item.href} item={item} active={isActiveHref(pathname, item.href)} count={item.badge ? counts[item.badge] : 0} />
                )
              )}
            </div>
          </div>
        );
      })}

      <div className="border-t border-[var(--admin-border)] pt-4">
        <Link href="/brand-portal" aria-label="Brand Portal" title={collapsed ? "Brand Portal" : undefined} className={`flex items-center rounded-xl py-2.5 text-[13px] font-semibold text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)] ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}>
          <Store className="h-[17px] w-[17px] text-[var(--admin-text-muted)]/70" /> {!collapsed && "Brand Portal"}
        </Link>
        <Link href="/" aria-label="Storefront" title={collapsed ? "Storefront" : undefined} className={`mt-1 flex items-center rounded-xl py-2.5 text-[13px] font-semibold text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)] ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}>
          <ArrowLeft className="h-[17px] w-[17px] text-[var(--admin-text-muted)]/70" /> {!collapsed && "Storefront"}
        </Link>
      </div>
    </nav>
  );
}
