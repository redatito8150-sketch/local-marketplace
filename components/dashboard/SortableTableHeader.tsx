import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc";

export default function SortableTableHeader({
  href,
  label,
  active = false,
  direction = "asc",
  className = "",
}: {
  href: string;
  label: string;
  active?: boolean;
  direction?: SortDirection;
  className?: string;
}) {
  const Icon = active ? direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return (
    <th className={`px-5 py-3 font-semibold ${className}`}>
      <Link
        href={href}
        scroll={false}
        aria-label={`Sort by ${label}${active ? `, ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
        className={`group inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 outline-none transition-colors hover:text-[#A94442] focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${active ? "text-[#A94442]" : ""}`}
      >
        <span>{label}</span>
        <Icon aria-hidden="true" className={`h-3 w-3 flex-none transition-opacity ${active ? "opacity-100" : "opacity-45 group-hover:opacity-100"}`} />
      </Link>
    </th>
  );
}

export function nextTableSort(current: string | undefined, column: string, defaultDirection: SortDirection = "asc") {
  if (current === `${column}-asc`) return `${column}-desc`;
  if (current === `${column}-desc`) return `${column}-asc`;
  return `${column}-${defaultDirection}`;
}

export function tableSortHref(path: string, params: Record<string, string | undefined>, column: string, defaultDirection: SortDirection = "asc") {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page" && key !== "sort") query.set(key, value);
  }
  query.set("sort", nextTableSort(params.sort, column, defaultDirection));
  return `${path}?${query}`;
}
