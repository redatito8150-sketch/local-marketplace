function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default function AccountAvatar({
  name,
  imageUrl,
  size = "large",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "small" | "large";
}) {
  const sizeClass = size === "large" ? "h-20 w-20 text-xl" : "h-12 w-12 text-sm";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[var(--account-surface)] bg-[var(--account-accent-soft)] font-semibold text-[var(--account-accent)] shadow-sm ${sizeClass}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={`${name || "Account"} avatar`} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsFromName(name)}</span>
      )}
    </div>
  );
}
