import Link from "next/link";
import type { ReactNode, ElementType } from "react";
import { ArrowRight, Inbox } from "lucide-react";

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-mahalyred">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold tracking-[-0.035em] text-slate-950 sm:text-[30px]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-500 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function DashboardStatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: ElementType;
  tone?: "neutral" | "brand" | "success" | "warning" | "info";
  href?: string;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    brand: "bg-red-50 text-mahalyred",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    info: "bg-sky-50 text-sky-700",
  };
  const content = (
    <div className="h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </div>
        {href && <ArrowRight className="h-4 w-4 text-slate-300" />}
      </div>
      <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <div className="mt-1 text-2xl font-bold tracking-[-0.035em] text-slate-950">{value}</div>
      {detail && <div className="mt-2 text-[12px] leading-5 text-slate-500">{detail}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${className}`}>
      {(title || description || action) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-[14px] font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-[12px] text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function DashboardEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12px] leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const dashboardButtonPrimary =
  "inline-flex h-10 items-center justify-center rounded-xl bg-mahalyred px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30";

export const dashboardButtonSecondary =
  "inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
