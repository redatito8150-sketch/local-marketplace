import { BadgeCheck } from "lucide-react";

// A fixed dark-red verified-style mark for Mahaly-partner brands — always
// this same color everywhere it appears (mega menu, brand directory, the
// brand page itself, sponsored carousels), independent of whichever of the
// two site palettes (main site vs. brand-page) the surrounding UI uses.
export default function PartnerBadge({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span title="Mahaly Partner" className="inline-flex shrink-0">
      <BadgeCheck className={`${className} partner-shine text-[#7f1d1d]`} aria-label="Mahaly Partner" />
    </span>
  );
}
