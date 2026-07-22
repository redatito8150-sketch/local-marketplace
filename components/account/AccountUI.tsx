import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

export function AccountPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--account-accent)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-[-0.03em] text-[var(--account-text)] sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[13.5px] leading-6 text-[var(--account-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

export function AccountPanel({
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
    <section
      className={`overflow-hidden rounded-[22px] border border-[var(--account-border)] bg-[var(--account-surface)] shadow-[var(--account-shadow)] ${className}`}
    >
      {(title || description || action) && (
        <div className="flex flex-col gap-3 border-b border-[var(--account-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-[var(--account-text)]">{title}</h2>}
            {description && (
              <p className="mt-1 text-[12.5px] leading-5 text-[var(--account-text-muted)]">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function AccountHighlightCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = "accent",
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  tone?: "accent" | "success" | "warning" | "neutral";
}) {
  const colors = {
    accent: "bg-[var(--account-accent-soft)] text-[var(--account-accent)]",
    success: "bg-[color-mix(in_srgb,var(--account-success)_14%,transparent)] text-[var(--account-success)]",
    warning: "bg-[color-mix(in_srgb,var(--account-warning)_14%,transparent)] text-[var(--account-warning)]",
    neutral: "bg-[var(--account-surface-muted)] text-[var(--account-text-muted)]",
  };
  const content = (
    <div className="h-full rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--account-accent-soft)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${colors[tone]}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </span>
        {href && <ArrowRight className="h-4 w-4 text-[var(--account-text-muted)]/50" />}
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--account-text-muted)]">
        {label}
      </p>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--account-text)]">
        {value}
      </div>
      {detail && <div className="mt-2 text-[12px] leading-5 text-[var(--account-text-muted)]">{detail}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function AccountEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--account-surface-muted)] text-[var(--account-accent)]">
        <Sparkles className="h-5 w-5" strokeWidth={1.7} />
      </span>
      <p className="mt-4 text-sm font-semibold text-[var(--account-text)]">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-5 text-[var(--account-text-muted)]">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const accountPrimaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--account-accent)] px-5 text-[13px] font-semibold text-[var(--account-accent-foreground)] transition-colors hover:bg-[var(--account-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--account-accent)]/30 disabled:cursor-not-allowed disabled:opacity-60";

export const accountSecondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--account-border)] bg-[var(--account-surface)] px-5 text-[13px] font-semibold text-[var(--account-text)] transition-colors hover:bg-[var(--account-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--account-accent)]/25";

export const accountInputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[var(--account-border)] bg-[var(--account-surface)] px-3.5 text-[14px] text-[var(--account-text)] outline-none transition placeholder:text-[var(--account-text-muted)]/60 focus:border-[var(--account-accent)] focus:ring-2 focus:ring-[var(--account-accent-soft)]";
