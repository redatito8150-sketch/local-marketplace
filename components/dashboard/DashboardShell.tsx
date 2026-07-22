"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function DashboardShell({
  variant,
  title,
  subtitle,
  sidebar,
  headerTools,
  children,
}: {
  variant: "admin" | "brand";
  title: string;
  subtitle: string;
  sidebar: ReactNode;
  headerTools?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = variant === "admin";

  return (
    <div className={`min-h-screen ${isAdmin ? "admin-theme bg-[var(--admin-bg)] text-[var(--admin-text)]" : "bg-[#f8f5ef]"}`}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur ${isAdmin ? "border-[var(--admin-border)] bg-[color-mix(in_srgb,var(--admin-surface)_94%,transparent)]" : "border-slate-200/80 bg-white/95"}`}>
        <div className="flex h-[72px] w-full items-center gap-3 px-4 sm:px-6 lg:px-8 xl:px-10">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 lg:hidden ${isAdmin ? "border-[var(--admin-border)] text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] focus-visible:ring-[var(--admin-primary)]/25" : "border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:ring-mahalyred/30"}`}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={isAdmin ? "/admin" : "/brand-portal"} className="min-w-0">
            <p className={`truncate text-[17px] font-bold tracking-[-0.025em] ${isAdmin ? "text-[var(--admin-text)]" : "text-[#302b27]"}`}>
              {title}
            </p>
            <p className={`truncate text-[11px] font-medium ${isAdmin ? "text-[var(--admin-text-muted)]" : "text-[#7b6f66]"}`}>
              {subtitle}
            </p>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-3">{headerTools}</div>
        </div>
      </header>

      <div className="grid w-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className={`hidden min-h-[calc(100vh-72px)] border-r px-4 py-6 lg:block ${isAdmin ? "border-[var(--admin-border)] bg-[var(--admin-sidebar)]" : "border-[#e3dcd3] bg-[#fffdf9]"}`}>
          <div className="sticky top-[96px]">{sidebar}</div>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10 xl:py-10">
          {children}
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboard navigation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={`relative h-full w-[min(86vw,320px)] overflow-y-auto border-r p-5 shadow-2xl ${isAdmin ? "border-[var(--admin-border)] bg-[var(--admin-sidebar)]" : "border-[#e3dcd3] bg-[#fffdf9]"}`}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest("a")) setMobileOpen(false);
            }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className={isAdmin ? "text-sm font-bold text-[var(--admin-text)]" : "text-sm font-bold text-slate-950"}>{title}</p>
                <p className={isAdmin ? "mt-0.5 text-[11px] text-[var(--admin-text-muted)]" : "mt-0.5 text-[11px] text-slate-500"}>Navigation</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className={isAdmin ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--admin-border)] text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)]" : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"}
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}
    </div>
  );
}
