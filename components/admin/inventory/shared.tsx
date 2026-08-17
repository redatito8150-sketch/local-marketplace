import Image from "next/image";
import { Boxes } from "lucide-react";

// Shared visual language for the Inventory + Warehouse admin pages, so both
// read as one product instead of two different dashboards.

export const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
export const formatCount = (value: number) => NUMBER_FORMAT.format(value);
export const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export const CONTROL = "h-11 min-w-0 rounded-xl border-0 bg-[#e6e0d8] px-3 text-[12.5px] font-medium text-[#3f3630] outline-none shadow-[0_10px_28px_rgba(72,50,36,.08)] placeholder:text-[#75675e] focus-visible:bg-[#ded7cf] focus-visible:ring-2 focus-visible:ring-[#C85956]/20";

export function BrandMark({ brand }: { brand: { name: string; logoImage: string | null } }) {
  return (
    <span className="relative flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-xl border-0 bg-[#fbf7f3] text-[14px] font-extrabold text-[#C85956]">
      {brand.logoImage ? <Image src={brand.logoImage} alt={`${brand.name} logo`} fill sizes="44px" className="object-contain p-1" /> : brand.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="block text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">{label}</span>
      <span className="mt-0.5 block text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(value)}</span>
    </span>
  );
}

export function StockBadge({ status }: { status: "in_stock" | "low_stock" | "out_of_stock" }) {
  const style = status === "in_stock" ? "bg-emerald-50/55 text-emerald-800" : status === "low_stock" ? "bg-amber-50/55 text-amber-800" : "bg-red-50/55 text-red-800";
  return <span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-extrabold ${style}`}>{status === "in_stock" ? "Healthy" : status === "low_stock" ? "Low stock" : "Out of stock"}</span>;
}

export function VariantIdentity({ image, productName, label, sku }: { image: string | null; productName: string; label: string; sku: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative h-11 w-9 flex-none overflow-hidden rounded-lg bg-[#f1eae4]">
        {image ? <Image src={image} alt={`${productName}, ${label}`} fill sizes="36px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-bold text-[#403730]">{label}</span>
        <code className="mt-1 block truncate text-[10px] text-[#756960]">{sku}</code>
      </span>
    </div>
  );
}

// A generic status pill for request-style badges (Warehouse), sharing the
// same soft-tint language as StockBadge instead of the old slate look.
export function TonePill({ label, tone, icon: Icon }: { label: string; tone: "amber" | "emerald" | "red" | "neutral" | "blue" | "violet"; icon?: React.ElementType }) {
  const style =
    tone === "amber" ? "bg-amber-50/70 text-amber-800" : tone === "emerald" ? "bg-emerald-50/70 text-emerald-800" : tone === "red" ? "bg-red-50/70 text-red-800" : tone === "blue" ? "bg-sky-50/70 text-sky-800" : tone === "violet" ? "bg-violet-50/70 text-violet-800" : "bg-[#e6e0d8] text-[#5b5049]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-extrabold ${style}`}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}
