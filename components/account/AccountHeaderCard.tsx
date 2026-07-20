import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  staff: "Staff",
  manager: "Manager",
  admin: "Admin",
  brand_owner: "Brand Owner",
  brand_assistant: "Brand Assistant",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default function AccountHeaderCard({
  fullName,
  email,
  role,
}: {
  fullName: string;
  email: string;
  role: string;
}) {
  return (
    <div className="rounded-xl3 border border-stone-150 bg-white p-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-beige-100 text-lg font-semibold text-ink">
        {initialsFromName(fullName || email)}
      </div>
      <p className="mt-4 text-[15px] font-semibold text-ink">{fullName || "Your account"}</p>
      <p className="mt-0.5 text-[12.5px] text-ink-soft/60">{email}</p>
      <span className="mt-3 inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft/70">
        {ROLE_LABELS[role] ?? role}
      </span>
      <Link
        href="/account/settings"
        className="mt-4 block text-[12.5px] font-medium text-ink-soft/70 hover:text-ink hover:underline"
      >
        Edit Profile
      </Link>
    </div>
  );
}
