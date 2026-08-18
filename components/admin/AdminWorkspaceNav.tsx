import Link from "next/link";
import { CreditCard, FileText, History, LayoutTemplate, RotateCcw, ShoppingBag, Store, BookOpenText } from "lucide-react";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { getUserPermissions, type PermissionKey } from "@/lib/supabase/permissions";

type WorkspaceItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permission: PermissionKey;
};

const WORKSPACES = {
  commerce: {
    label: "Commerce workspace",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag, permission: "manage_orders" },
      { label: "Payments", href: "/admin/payments", icon: CreditCard, permission: "manage_orders" },
      { label: "Refund review", href: "/admin/payments/refund-queue", icon: RotateCcw, permission: "manage_orders" },
    ],
  },
  brands: {
    label: "Brands workspace",
    items: [
      { label: "Brands", href: "/admin/brands", icon: Store, permission: "manage_brands" },
      { label: "Applications", href: "/admin/applications", icon: FileText, permission: "manage_applications" },
      { label: "Brand activity", href: "/admin/products/review", icon: History, permission: "manage_products" },
    ],
  },
  storefront: {
    label: "Storefront workspace",
    items: [
      { label: "Page Studio", href: "/admin/page-studio", icon: LayoutTemplate, permission: "manage_page_studio" },
      { label: "Content library", href: "/admin/content", icon: BookOpenText, permission: "manage_site_content" },
    ],
  },
} satisfies Record<string, { label: string; items: WorkspaceItem[] }>;

export type AdminWorkspace = keyof typeof WORKSPACES;

export default async function AdminWorkspaceNav({
  workspace,
  activeHref,
}: {
  workspace: AdminWorkspace;
  activeHref: string;
}) {
  const user = await requireAdminUser();
  if (!user) return null;

  const permissions = await getUserPermissions(user.id);
  const config = WORKSPACES[workspace];
  const items = config.items.filter((item) => permissions.has(item.permission));
  if (items.length < 2) return null;

  return (
    <nav
      aria-label={config.label}
      className="mb-6 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 shadow-[0_6px_18px_rgba(67,45,29,0.05)]"
    >
      <div className="grid gap-1 sm:flex" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-center text-[10px] font-semibold leading-tight transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/30 sm:justify-start sm:gap-2 sm:whitespace-nowrap sm:px-3.5 sm:text-left sm:text-[12.5px] ${
                active
                  ? "bg-[var(--admin-selected)] text-[var(--admin-text)] shadow-sm"
                  : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 flex-none ${active ? "text-[var(--admin-primary)]" : "text-[var(--admin-text-muted)]/70"}`} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
