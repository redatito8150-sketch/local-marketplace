import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Home, Layers3 } from "lucide-react";
import { getDraftPageSections, getPageVersions } from "@/lib/data/pageStudio";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

export default async function PageStudioPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const [sections, versions] = await Promise.all([
    getDraftPageSections("home"),
    getPageVersions("home", 1),
  ]);
  const lastPublished = sections.reduce<string | undefined>((latest, section) => {
    if (!section.publishedAt) return latest;
    return !latest || section.publishedAt > latest ? section.publishedAt : latest;
  }, undefined);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-[var(--admin-text)]">Page Studio</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-[var(--admin-text-muted)]">
            Build storefront pages with reviewed sections. Draft changes stay private until you publish them.
          </p>
        </div>
        <Link href="/" target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)]">
          Open storefront <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/admin/page-studio/home" className="group rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5 shadow-sm transition hover:border-[var(--admin-primary)]/35 hover:shadow-md">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--admin-selected)] text-[var(--admin-primary)]"><Home className="h-5 w-5" /></span>
            <span className="rounded-full bg-[var(--admin-success-soft,#edf5ec)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-success)]">Active</span>
          </div>
          <h2 className="mt-5 text-[16px] font-bold text-[var(--admin-text)]">Homepage</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--admin-text-muted)]">
            {sections.length} managed sections · {versions[0] ? `Version ${versions[0].version}` : "Not published yet"}
          </p>
          <div className="mt-4 flex items-center gap-2 border-t border-[var(--admin-border)] pt-4 text-[11.5px] text-[var(--admin-text-muted)]">
            <Layers3 className="h-4 w-4" />
            {lastPublished ? `Published ${new Date(lastPublished).toLocaleString("en-US")}` : "Ready for first publish"}
          </div>
        </Link>
      </div>
    </div>
  );
}
