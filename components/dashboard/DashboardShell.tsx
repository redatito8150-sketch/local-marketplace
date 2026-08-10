"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { DashboardSidebarProvider } from "./DashboardSidebarContext";

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
  const [collapsed, setCollapsed] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const isAdmin = variant === "admin";
  const storageKey = `mahali_${variant === "admin" ? "admin" : "brand_portal"}_sidebar_collapsed`;

  useEffect(() => {
    // The preference is browser-only; applying it after hydration keeps the
    // server and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(storageKey) === "true");
    setPreferenceLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!preferenceLoaded) return;
    window.localStorage.setItem(storageKey, String(collapsed));
  }, [collapsed, preferenceLoaded, storageKey]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    const focusable = () =>
      [...(drawer?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea") ?? [])];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className={`min-h-screen ${isAdmin ? "admin-theme bg-[var(--admin-bg)] text-[var(--admin-text)]" : "bg-[#FAFAF7]"}`}>
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
            <p className={`truncate text-[17px] font-bold tracking-[-0.025em] ${isAdmin ? "text-[var(--admin-text)]" : "text-[#242424]"}`}>
              {title}
            </p>
            <p className={`truncate text-[11px] font-medium ${isAdmin ? "text-[var(--admin-text-muted)]" : "text-[#7b6f66]"}`}>
              {subtitle}
            </p>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-3">{headerTools}</div>
        </div>
      </header>

      <div
        className={`grid w-full grid-cols-1 transition-[grid-template-columns] duration-200 lg:grid-cols-[var(--dashboard-sidebar-width)_minmax(0,1fr)] ${collapsed ? "[--dashboard-sidebar-width:76px]" : "[--dashboard-sidebar-width:260px]"}`}
        data-sidebar-collapsed={collapsed}
      >
        <aside className={`relative hidden border-r px-3 py-6 transition-[width,padding] duration-200 lg:sticky lg:top-[72px] lg:block lg:h-[calc(100vh-72px)] lg:overflow-x-visible lg:overflow-y-auto ${isAdmin ? "border-[var(--admin-border)] bg-[var(--admin-sidebar)]" : "border-[#e3dcd3] bg-[#fffdf9]"}`}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`absolute right-0 top-4 z-10 inline-flex h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 ${isAdmin ? "border-[var(--admin-border)] text-[var(--admin-text-muted)] focus-visible:ring-[var(--admin-primary)]/30" : "border-[#e3dcd3] text-[#75685f] focus-visible:ring-mahalyred/30"}`}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <DashboardSidebarProvider collapsed={collapsed}>{sidebar}</DashboardSidebarProvider>
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
            ref={drawerRef}
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
            <DashboardSidebarProvider collapsed={false}>{sidebar}</DashboardSidebarProvider>
          </aside>
        </div>
      )}
    </div>
  );
}
