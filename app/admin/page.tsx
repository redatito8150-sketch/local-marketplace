import Link from "next/link";
import { FileText, Package, ShoppingBag, Store, Users } from "lucide-react";
import {
  getAllApplicationsForAdmin,
  getAllBrandsForAdmin,
  getAllOrdersForAdmin,
  getAllProductsForAdmin,
  getAllProfilesForAdmin,
} from "@/lib/data/admin";

export default async function AdminOverviewPage() {
  const [products, brands, orders, applications, profiles] = await Promise.all([
    getAllProductsForAdmin(),
    getAllBrandsForAdmin(),
    getAllOrdersForAdmin(),
    getAllApplicationsForAdmin(),
    getAllProfilesForAdmin(),
  ]);

  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const newApplications = applications.filter((a) => a.status === "new").length;

  const stats: {
    label: string;
    value: number;
    sublabel?: string;
    href: string;
    icon: React.ElementType;
  }[] = [
    { label: "Products", value: products.length, href: "/admin/products", icon: Package },
    { label: "Brands", value: brands.length, href: "/admin/brands", icon: Store },
    {
      label: "Orders",
      value: orders.length,
      sublabel: `${pendingOrders} pending`,
      href: "/admin/orders",
      icon: ShoppingBag,
    },
    {
      label: "Applications",
      value: applications.length,
      sublabel: `${newApplications} new`,
      href: "/admin/applications",
      icon: FileText,
    },
    { label: "Users", value: profiles.length, href: "/admin/users", icon: Users },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Overview</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        A quick look at what&apos;s happening on Local.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl3 border border-stone-150 bg-white p-5 transition-colors hover:border-ink/30"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-beige-100">
              <stat.icon className="h-4 w-4 text-ink" strokeWidth={1.6} />
            </div>
            <p className="mt-4 text-2xl font-semibold text-ink">{stat.value}</p>
            <p className="text-[12.5px] font-medium text-ink-soft/60">{stat.label}</p>
            {stat.sublabel && (
              <p className="mt-1 text-[11px] font-medium text-ink-soft/45">{stat.sublabel}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <QuickLinks
          title="Products & Brands"
          links={[
            { label: "Add a product", href: "/admin/products/new" },
            { label: "Add a brand", href: "/admin/brands/new" },
          ]}
        />
        <QuickLinks title="Orders" links={[{ label: "View all orders", href: "/admin/orders" }]} />
        <QuickLinks
          title="Brand Applications"
          links={[{ label: "Review applications", href: "/admin/applications" }]}
        />
      </div>
    </div>
  );
}

function QuickLinks({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-xl3 border border-stone-150 bg-white p-5">
      <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-[13px] font-medium text-ink-soft/70 hover:text-ink hover:underline"
            >
              {link.label} →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
