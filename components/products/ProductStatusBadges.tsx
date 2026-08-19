import { Star } from "lucide-react";
import { getProductStatusPresentation, type ProductBadgeTone, type ProductPresentationInput } from "@/lib/products/presentation";

const toneClass: Record<ProductBadgeTone, string> = {
  neutral: "bg-[#eee9e4] text-[#62564d]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-[#eef3f5] text-[#4e6876]",
};

type ProductStatusBadgesProps = {
  product: ProductPresentationInput & {
    featured?: boolean;
    hasPendingEdit?: boolean;
    reviewNotes?: string;
  };
  action?: React.ReactNode;
  showReviewNotes?: boolean;
};

export function ProductStatusBadges({ product, action, showReviewNotes = false }: ProductStatusBadgesProps) {
  const presentation = getProductStatusPresentation(product);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[10.5px] font-bold ${toneClass[presentation.lifecycle.tone]}`}>
        {presentation.lifecycle.label}
      </span>
      {presentation.visibility ? (
        <span className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[10.5px] font-bold ${toneClass[presentation.visibility.tone]}`}>
          {presentation.visibility.label}
        </span>
      ) : null}
      {product.featured ? (
        <span title="Selected by the marketplace team" className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#f8e9e7] px-2.5 py-1 text-[10.5px] font-bold text-mahalyred">
          <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" /> Featured
        </span>
      ) : null}
      {product.hasPendingEdit ? <span className="whitespace-nowrap rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">Edit pending</span> : null}
      {presentation.canShowNow ? action : null}
      {showReviewNotes && product.reviewNotes ? <p className="w-full max-w-xs pt-1 text-[11px] leading-4 text-red-700">{product.reviewNotes}</p> : null}
    </div>
  );
}

export function canShowProductNow(product: ProductPresentationInput) {
  return getProductStatusPresentation(product).canShowNow;
}

