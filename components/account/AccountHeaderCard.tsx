import Link from "next/link";
import AccountAvatar from "@/components/account/AccountAvatar";

const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  staff: "Staff",
  manager: "Manager",
  admin: "Admin",
  brand_owner: "Brand Owner",
  brand_assistant: "Brand Assistant",
};

export default function AccountHeaderCard({
  fullName,
  email,
  role,
  avatarUrl,
}: {
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}) {
  const displayName = fullName || email || "Your account";
  return (
    <div className="rounded-[24px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)]">
      <div className="flex items-center gap-4 lg:flex-col lg:text-center">
        <AccountAvatar name={displayName} imageUrl={avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-[var(--account-text)]">{fullName || "Your account"}</p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--account-text-muted)]">{email}</p>
          <span className="mt-2 inline-flex items-center rounded-full bg-[var(--account-surface-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--account-text-muted)]">
            {ROLE_LABELS[role] ?? role}
          </span>
          <Link
            href="/account/settings"
            className="mt-2 block text-[12px] font-semibold text-[var(--account-accent)] hover:underline"
          >
            Personal information
          </Link>
        </div>
      </div>
    </div>
  );
}
