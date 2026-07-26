"use client";

import { useState } from "react";
import {
  ChevronDown,
  Store,
  UserPlus,
  Link2,
  Tag,
  Package,
  Receipt,
  CreditCard,
  Truck,
  RotateCcw,
  Star,
  ShieldAlert,
  Copyright,
  Lock,
  Share2,
  UserX,
  AlertTriangle,
  FileWarning,
  Gavel,
  RefreshCw,
  Mail,
  type LucideIcon,
} from "lucide-react";
import type { LegalBlock } from "@/types";
import LegalSectionBody from "@/components/legal/LegalSectionBody";
import LegalSectionIcon from "@/components/legal/LegalSectionIcon";

export interface LegalAccordionItem {
  id: string;
  title: string;
  body: LegalBlock[];
}

// Icon components can't cross the server→client prop boundary (Next.js
// RSC serializes props, and a component reference isn't serializable), so
// this map — unlike PRIVACY's, which is safe to keep in a Server
// Component page since it never crosses that boundary — has to live here,
// inside the Client Component that actually renders the icons, keyed by
// the same section ids as content/legal/terms.ts.
const SECTION_ICONS: Record<string, LucideIcon> = {
  "about-the-platform": Store,
  "eligibility-and-account-registration": UserPlus,
  "account-linking-and-authentication": Link2,
  "brands-sellers-and-listings": Tag,
  "orders-and-order-acceptance": Package,
  "pricing-taxes-fees-and-promotions": Receipt,
  payments: CreditCard,
  "shipping-and-delivery": Truck,
  "returns-exchanges-cancellations-refunds": RotateCcw,
  "reviews-and-user-generated-content": Star,
  "acceptable-use": ShieldAlert,
  "intellectual-property": Copyright,
  privacy: Lock,
  "third-party-services": Share2,
  "suspension-and-termination": UserX,
  disclaimers: AlertTriangle,
  "limitation-of-liability": Gavel,
  indemnity: FileWarning,
  "governing-law-and-disputes": Gavel,
  "changes-to-these-terms": RefreshCw,
  contact: Mail,
};

function AccordionRow({ item, index, defaultOpen }: { item: LegalAccordionItem; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const buttonId = `${item.id}-trigger`;
  const panelId = `${item.id}-panel`;

  return (
    <div id={item.id} tabIndex={-1} className="scroll-mt-28 border-b border-stone-150 outline-none last:border-b-0">
      <h2>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-4 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mahalyred"
        >
          <LegalSectionIcon icon={SECTION_ICONS[item.id] ?? FileWarning} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">
              {index + 1}. {item.title}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4.5 w-4.5 shrink-0 text-ink-soft/50 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      {/* Rendered in the DOM either way (not conditionally mounted) so the
          full section text stays indexable and available even if a
          particular section is collapsed or JavaScript fails to run —
          only its visibility toggles. */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="pb-6 pl-[60px] pr-2"
      >
        <LegalSectionBody blocks={item.body} headingLevel="h4" />
      </div>
    </div>
  );
}

export default function LegalAccordion({ items }: { items: LegalAccordionItem[] }) {
  return (
    <div>
      {items.map((item, index) => (
        <AccordionRow key={item.id} item={item} index={index} defaultOpen={index === 0} />
      ))}
    </div>
  );
}
