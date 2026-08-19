import { formatPrice } from "@/lib/format";
import { getProductPricePresentation, type ProductPricingSource } from "@/lib/products/pricingPresentation";

type ProductPriceDisplayProps = {
  product: ProductPricingSource & { currency: "USD" | "EGP" };
  compact?: boolean;
};

function formatRange(min: number, max: number, currency: "USD" | "EGP") {
  if (min === max) return formatPrice(min, currency);
  if (currency === "EGP") return `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")} EGP`;
  return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

export default function ProductPriceDisplay({ product, compact = false }: ProductPriceDisplayProps) {
  const pricing = getProductPricePresentation(product);
  const currentPrice = formatRange(pricing.currentMin, pricing.currentMax, product.currency);
  const originalPrice = formatRange(pricing.originalMin, pricing.originalMax, product.currency);

  return (
    <div className="min-w-0 tabular-nums">
      <p className={`${compact ? "text-[14px]" : "text-[13px]"} whitespace-nowrap font-bold ${pricing.hasDiscount ? "text-mahalyred" : "text-[#242424]"}`}>
        {currentPrice}
      </p>
      {pricing.hasDiscount ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] leading-none">
          <span className="whitespace-nowrap text-[#9b8e84] line-through decoration-[#9b8e84]/70">{originalPrice}</span>
          {pricing.discountLabel ? <span className="whitespace-nowrap font-semibold text-mahalyred">· {pricing.discountLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

