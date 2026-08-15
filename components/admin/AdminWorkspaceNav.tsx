import Link from "next/link";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { getUserPermissions, type PermissionKey } from "@/lib/supabase/permissions";

type WorkspaceItem = {
  label: string;
  href: string;
  permission: PermissionKey;
};

const WORKSPACES = {
  commerce: {
    label: "Commerce workspace",
    items: [
      { label: "Orders", href: "/admin/orders", permission: "manage_orders" },
      { label: "Payments", href: "/admin/payments", permission: "manage_orders" },
      { label: "Refund review", href: "/admin/payments/refund-queue", permission: "manage_orders" },
    ],
  },
  inventory: {
    label: "Inventory workspace",
    items: [
      { label: "Stock ledger", href: "/admin/inventory", permission: "manage_inventory" },
      { label: "Low stock", href: "/admin/low-stock", permission: "manage_inventory" },
      { label: "Warehouse", href: "/admin/warehouse", permission: "manage_inventory" },
    ],
  },
  brands: {
    label: "Brands workspace",
    items: [
      { label: "Brands", href: "/admin/brands", permission: "manage_brands" },
      { label: "Applications", href: "/admin/applications", permission: "manage_applications" },
      { label: "Brand activity", href: "/admin/products/review", permission: "manage_products" },
    ],
  },
  storefront: {
    label: "Storefront workspace",
    items: [
      { label: "Page Studio", href: "/admin/page-studio", permission: "manage_page_studio" },
      { label: "Content library", href: "/admin/content", permission: "manage_site_content" },
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
      className="mb-6 overflow-x-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 shadow-[0_6px_18px_rgba(67,45,29,0.05)]"
    >
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/30 ${
                active
                  ? "bg-[var(--admin-selected)] text-[var(--admin-text)] shadow-sm"
                  : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
