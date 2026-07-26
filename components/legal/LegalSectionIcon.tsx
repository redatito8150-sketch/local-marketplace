import type { LucideIcon } from "lucide-react";

export default function LegalSectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 bg-beige-100 text-mahalyred"
    >
      <Icon className="h-5 w-5" strokeWidth={1.7} />
    </div>
  );
}
