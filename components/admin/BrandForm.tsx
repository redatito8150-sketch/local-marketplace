"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TagInput from "@/components/shared/TagInput";
import { SPONSOR_PLACEMENTS, type BrandSponsorPlacement } from "@/lib/admin/brandValidation";
import type { BrandRecord } from "@/types";

const PLACEMENT_LABELS: Record<BrandSponsorPlacement, string> = {
  homepage_banner: "End of homepage",
  mega_menu_banner: "“Brands” mega menu banner",
  featured_brands_first: "First in Featured Brands",
};

interface BrandFormProps {
  mode: "create" | "edit";
  initial?: BrandRecord;
  // Round 3: reused as-is by the brand portal's own page-content editor —
  // "brand-portal" hides the slug field (the brand's own URL, an admin-only
  // concern) and lets the caller point the submit/redirect somewhere other
  // than /admin/brands.
  scope?: "admin" | "brand-portal";
  apiPath?: string;
  redirectPath?: string;
  // Milestone 6: pre-fills a subset of fields from an approved brand
  // application (create mode only — `initial` still wins if both are
  // somehow passed). `sourceApplicationId` is threaded through to the
  // create route so it can call convert_application_to_brand() instead of
  // a plain insert, atomically marking the application converted.
  prefill?: Partial<FormState>;
  sourceApplicationId?: string;
}

export interface FormState {
  slug: string;
  name: string;
  category: string;
  additionalCategories: string[];
  skuPrefix: string;
  isActive: boolean;
  isMahalyPartner: boolean;
  isSponsored: boolean;
  sponsoredPlacements: BrandSponsorPlacement[];
  sponsoredOrder: string;
  foundedYear: string;
  city: string;
  // The only remaining content field this form edits — everything else
  // (hero/logo/about images, about description, tagline) moved to
  // InlineEditableImage/RichTextEditableField on the live brand page, or
  // (tagline) isn't editable anywhere anymore. storyBody stays because
  // apps/mobile/app/brands/[slug].tsx still renders it and nothing else
  // edits it.
  storyBody: string;
  shippingPolicy: string;
  returnPolicy: string;
  returnWindowDays: string;
}

function toFormState(brand?: BrandRecord): FormState {
  return {
    slug: brand?.slug ?? "",
    name: brand?.name ?? "",
    category: brand?.category ?? "",
    additionalCategories: brand?.additionalCategories ?? [],
    skuPrefix: brand?.skuPrefix ?? "",
    isActive: brand?.isActive ?? true,
    isMahalyPartner: brand?.isMahalyPartner ?? false,
    isSponsored: brand?.isSponsored ?? false,
    sponsoredPlacements: (brand?.sponsoredPlacements ?? []) as BrandSponsorPlacement[],
    sponsoredOrder: brand?.sponsoredOrder != null ? String(brand.sponsoredOrder) : "",
    foundedYear: brand?.foundedYear ? String(brand.foundedYear) : "",
    city: brand?.city ?? "Cairo",
    storyBody: brand?.storyBody ?? "",
    shippingPolicy: brand?.shippingPolicy ?? "",
    returnPolicy: brand?.returnPolicy ?? "",
    returnWindowDays: brand?.returnWindowDays ? String(brand.returnWindowDays) : "",
  };
}

export default function BrandForm({
  mode,
  initial,
  scope = "admin",
  apiPath,
  redirectPath,
  prefill,
  sourceApplicationId,
}: BrandFormProps) {
  const router = useRouter();
  const isBrandPortal = scope === "brand-portal";
  const [form, setForm] = useState<FormState>(() => ({
    ...toFormState(initial),
    ...(!initial ? prefill : undefined),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const togglePlacement = (placement: BrandSponsorPlacement) =>
    setForm((f) => ({
      ...f,
      sponsoredPlacements: f.sponsoredPlacements.includes(placement)
        ? f.sponsoredPlacements.filter((p) => p !== placement)
        : [...f.sponsoredPlacements, placement],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      additionalCategories: form.additionalCategories,
      // Always included (even in brand-portal scope, where the field isn't
      // shown/editable) — validateBrandInput now requires it unconditionally,
      // and the brand-portal's own PATCH route never writes sku_prefix
      // anyway, so resending the existing value here is a no-op for it.
      skuPrefix: form.skuPrefix.trim().toUpperCase(),
      ...(isBrandPortal
        ? {}
        : {
            isActive: form.isActive,
            isMahalyPartner: form.isMahalyPartner,
            isSponsored: form.isSponsored,
            sponsoredPlacements: form.isSponsored ? form.sponsoredPlacements : [],
            sponsoredOrder: form.sponsoredOrder.trim() ? Number(form.sponsoredOrder) : undefined,
          }),
      foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
      city: form.city.trim(),
      storyBody: form.storyBody.trim(),
      shippingPolicy: form.shippingPolicy.trim() || undefined,
      returnPolicy: form.returnPolicy.trim() || undefined,
      returnWindowDays: form.returnWindowDays.trim() ? Number(form.returnWindowDays) : undefined,
      ...(sourceApplicationId ? { sourceApplicationId } : {}),
    };

    try {
      const url =
        apiPath ??
        (mode === "create" ? "/api/admin/brands" : `/api/admin/brands/${initial!.slug}`);
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push(redirectPath ?? "/admin/brands");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {!isBrandPortal && (
        <TextField
          label="Slug (used in the URL — cannot be changed later)"
          value={form.slug}
          onChange={(v) => set("slug", v)}
          required
          disabled={mode === "edit"}
          hint="Lowercase letters, numbers, and hyphens only, e.g. marga-studio"
        />
      )}

      <TextField
        label="Name"
        value={form.name}
        onChange={(v) => set("name", v)}
        required
        disabled={isBrandPortal}
        hint={isBrandPortal ? "Only an admin can rename a brand." : undefined}
      />

      <div className="grid grid-cols-3 gap-4">
        <TextField
          label="Category"
          value={form.category}
          onChange={(v) => set("category", v)}
          required
        />
        <TextField
          label="Founded year (optional)"
          type="number"
          value={form.foundedYear}
          onChange={(v) => set("foundedYear", v)}
        />
        <TextField label="City" value={form.city} onChange={(v) => set("city", v)} required />
      </div>

      <div>
        <span className="text-[12.5px] font-medium text-slate-600">
          Additional categories (optional — shown as a &quot;+N&quot; badge next to Category)
        </span>
        <div className="mt-1.5">
          <TagInput
            value={form.additionalCategories}
            onChange={(next) => setForm((f) => ({ ...f, additionalCategories: next }))}
            placeholder="Type a category and press Enter"
          />
        </div>
      </div>

      {!isBrandPortal && (
        <TextField
          label="SKU Prefix"
          value={form.skuPrefix}
          onChange={(v) => set("skuPrefix", v.toUpperCase())}
          required
          disabled={Boolean(initial?.hasProducts)}
          hint={
            initial?.hasProducts
              ? "Locked — this brand already has products, so its SKU prefix can no longer be changed."
              : "2–6 letters/numbers, e.g. KMT — required, uniquely identifies this brand's product SKUs. Not shown to or editable by the brand owner."
          }
        />
      )}

      {!isBrandPortal && (
        <label className="flex items-center justify-between rounded-md border border-stone-150 px-3.5 py-2.5">
          <span>
            <span className="block text-[13.5px] font-medium text-ink">Active</span>
            <span className="block text-[11.5px] text-ink-soft/50">
              An inactive brand cannot generate new product SKUs
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="h-5 w-9 flex-none accent-ink"
          />
        </label>
      )}

      {!isBrandPortal && (
        <label className="flex items-center justify-between rounded-md border border-stone-150 px-3.5 py-2.5">
          <span>
            <span className="block text-[13.5px] font-medium text-ink">Mahaly Partner</span>
            <span className="block text-[11.5px] text-ink-soft/50">
              Stock lives in Mahaly&apos;s own warehouse — this brand&apos;s orders pool with other
              partner brands into one shared shipment/delivery fee, instead of shipping separately.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.isMahalyPartner}
            onChange={(e) => set("isMahalyPartner", e.target.checked)}
            className="h-5 w-9 flex-none accent-ink"
          />
        </label>
      )}

      {!isBrandPortal && (
        <div className="rounded-md border border-stone-150 px-3.5 py-2.5">
          <label className="flex items-center justify-between">
            <span>
              <span className="block text-[13.5px] font-medium text-ink">Sponsored</span>
              <span className="block text-[11.5px] text-ink-soft/50">
                Gives this brand a paid/featured placement — pick where below.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isSponsored}
              onChange={(e) => set("isSponsored", e.target.checked)}
              className="h-5 w-9 flex-none accent-ink"
            />
          </label>

          {form.isSponsored && (
            <div className="mt-3 space-y-3 border-t border-stone-150 pt-3">
              <div>
                <span className="text-[12.5px] font-medium text-slate-600">
                  Where should it appear? (choose any number)
                </span>
                <div className="mt-1.5 space-y-1.5">
                  {SPONSOR_PLACEMENTS.map((placement) => (
                    <label key={placement} className="flex items-center gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={form.sponsoredPlacements.includes(placement)}
                        onChange={() => togglePlacement(placement)}
                        className="h-4 w-4 accent-ink"
                      />
                      {PLACEMENT_LABELS[placement]}
                    </label>
                  ))}
                </div>
              </div>
              <TextField
                label="Display order (only matters if another brand shares the same placement — lower shows first)"
                type="number"
                value={form.sponsoredOrder}
                onChange={(v) => set("sponsoredOrder", v)}
              />
            </div>
          )}
        </div>
      )}

      <TextArea
        label="Story body"
        value={form.storyBody}
        onChange={(v) => set("storyBody", v)}
        rows={4}
        required
        hint="Still shown in the mobile app's brand page — nothing else edits this field."
      />

      <div className="rounded-md border border-stone-150 p-4">
        <span className="text-[12.5px] font-medium text-ink-soft/70">Shipping &amp; Returns policy</span>
        <p className="mt-0.5 text-[11.5px] text-ink-soft/50">
          Shown on every product from this brand. Leave blank to use Mahaly&apos;s marketplace default (7-day returns).
        </p>
        <div className="mt-3 space-y-3">
          <TextArea
            label="Shipping policy (optional)"
            value={form.shippingPolicy}
            onChange={(v) => set("shippingPolicy", v)}
            rows={2}
          />
          <TextArea
            label="Return policy (optional)"
            value={form.returnPolicy}
            onChange={(v) => set("returnPolicy", v)}
            rows={2}
          />
          <div className="max-w-[220px]">
            <TextField
              label="Return window (days, optional)"
              value={form.returnWindowDays}
              onChange={(v) => set("returnWindowDays", v.replace(/[^0-9]/g, ""))}
              hint="Defaults to 7 days if left blank"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-mahalyred px-6 py-3 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : mode === "create" ? "Create brand" : "Save changes"}
      </button>
    </form>
  );
}

function TextField({
  label,
  type = "text",
  value,
  onChange,
  required,
  disabled,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:bg-stone-100 disabled:text-ink-soft/50"
      />
      {hint && <span className="mt-1 block text-[11.5px] text-ink-soft/50">{hint}</span>}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
      {hint && <span className="mt-1 block text-[11.5px] text-ink-soft/50">{hint}</span>}
    </label>
  );
}
