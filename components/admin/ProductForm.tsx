"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ProductColorOption, ProductRecord, ProductStatus, ProductTaxonomyContent } from "@/types";
import { parseCsv, parseLines } from "@/lib/admin/parseTextInputs";
import {
  validateProductInput,
  type ProductInput,
  type VariantInput,
} from "@/lib/admin/productValidation";
import { reconcileVariants } from "@/lib/admin/variantGrid";
import ImageUploader from "@/components/admin/ImageUploader";
import VariantGrid from "@/components/admin/VariantGrid";
import ProductLivePreview from "@/components/admin/ProductLivePreview";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";

interface ProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  initial?: ProductRecord;
  brandOptions: { slug: string; name: string }[];
  // Admin-editable (Round 2 Phase 2) — falls back to the static defaults so
  // any caller that doesn't fetch site_content still works unchanged.
  taxonomy?: ProductTaxonomyContent;
  // Brand-portal mode (Round 3 Phase 2): forces the brand field to one
  // brand (shown read-only, never editable — a brand owner/assistant can
  // never reassign their own product to a different brand), submits to a
  // different API base path, and replaces Draft/Publish with a single
  // "Submit for Review" action — brand-portal products always go through
  // admin review, never straight to "published".
  lockedBrand?: { slug: string; name: string };
  apiBasePath?: string;
  cancelHref?: string;
}

interface FormState {
  name: string;
  brandName: string;
  brandSlug: string;
  category: "" | "women" | "men" | "kids"; // labeled "Gender" in this form
  productCategory: string;
  productType: string;
  collection: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  image: string;
  images: string[];
  trackInventory: boolean;
  colors: ProductColorOption[];
  sizesText: string;
  material: string;
  fit: string;
  variants: VariantInput[];
  description: string;
  detailsText: string;
  careInstructionsText: string;
  shippingReturns: string;
  modelHeight: string;
  modelWearing: string;
  status: ProductStatus;
  featured: boolean;
  publishDate: string;
  isNew: boolean;
  isUnisex: boolean;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toFormState(
  product?: ProductRecord,
  lockedBrand?: { slug: string; name: string }
): FormState {
  return {
    name: product?.name ?? "",
    brandName: lockedBrand?.name ?? product?.brandName ?? "",
    brandSlug: lockedBrand?.slug ?? product?.brandSlug ?? "",
    category: product?.category ?? "",
    productCategory: product?.productCategory ?? "",
    productType: product?.productType ?? "",
    collection: product?.collection ?? "",
    sku: product?.sku ?? "",
    price: product ? String(product.price) : "",
    compareAtPrice: product?.compareAtPrice != null ? String(product.compareAtPrice) : "",
    image: product?.image ?? "",
    images: product?.images ?? [],
    trackInventory: product?.trackInventory ?? true,
    colors: product?.colors ?? [],
    sizesText: product?.sizes?.join(", ") ?? "",
    material: product?.material ?? "",
    fit: product?.fit ?? "",
    variants: (product?.variants ?? []).map((v) => ({
      id: v.id,
      color: v.color,
      size: v.size,
      sku: v.sku ?? "",
      quantity: v.quantity,
      lowStockThreshold: v.lowStockThreshold,
      priceOverride: v.priceOverride,
      availabilityStatus: v.availabilityStatus,
    })),
    description: product?.description ?? "",
    detailsText: product?.details?.join("\n") ?? "",
    careInstructionsText: product?.careInstructions?.join("\n") ?? "",
    shippingReturns: product?.shippingReturns ?? "",
    modelHeight: product?.modelHeight ?? "",
    modelWearing: product?.modelWearing ?? "",
    status: product?.status ?? "draft",
    featured: product?.featured ?? false,
    publishDate: product?.publishDate ? toDatetimeLocalValue(product.publishDate) : "",
    isNew: product?.isNew ?? false,
    isUnisex: product?.isUnisex ?? false,
  };
}

export default function ProductForm({
  mode,
  productId,
  initial,
  brandOptions,
  taxonomy = DEFAULT_PRODUCT_TAXONOMY,
  lockedBrand,
  apiBasePath = "/api/admin/products",
  cancelHref = "/admin/products",
}: ProductFormProps) {
  const router = useRouter();
  const isBrandPortal = Boolean(lockedBrand);
  const [form, setForm] = useState<FormState>(() => toFormState(initial, lockedBrand));
  const [submittingStatus, setSubmittingStatus] = useState<ProductStatus | null>(null);
  const [error, setError] = useState("");

  // Save now keeps the admin on this page instead of redirecting to the
  // list, so a first-time create needs to remember the id it gets back and
  // switch to PATCHing from then on instead of POSTing a duplicate.
  const [currentMode, setCurrentMode] = useState(mode);
  const [currentProductId, setCurrentProductId] = useState(productId);
  const [savedSnapshot, setSavedSnapshot] = useState(form);
  const [justSaved, setJustSaved] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Storage folder for image uploads: the real product id once one exists,
  // otherwise a stable per-session temporary id so images can be uploaded
  // before the product row is ever created.
  const [uploadFolderId] = useState(() => productId ?? crypto.randomUUID());

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedSnapshot),
    [form, savedSnapshot]
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Regenerates the variant grid to match the current color/size
  // selections whenever either changes, preserving already-entered data
  // for combinations that still exist (see lib/admin/variantGrid.ts).
  useEffect(() => {
    setForm((f) => ({
      ...f,
      variants: reconcileVariants(f.colors, parseCsv(f.sizesText), f.variants),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.colors, form.sizesText]);

  // A category change can leave a now-invalid product type selected.
  useEffect(() => {
    if (!form.productCategory) return;
    const validTypes = taxonomy.typesByCategory[form.productCategory];
    if (validTypes && form.productType && !validTypes.includes(form.productType)) {
      set("productType", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.productCategory]);

  const updateColor = (index: number, patch: Partial<ProductColorOption>) => {
    setForm((f) => ({
      ...f,
      colors: f.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const addColor = () =>
    setForm((f) => ({ ...f, colors: [...f.colors, { name: "", hex: "#000000" }] }));

  const removeColor = (index: number) =>
    setForm((f) => ({ ...f, colors: f.colors.filter((_, i) => i !== index) }));

  const totalQuantity = form.variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
  const singleVariant = form.variants.length === 1 ? form.variants[0] : null;
  const updateSingleVariant = (patch: Partial<VariantInput>) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === 0 ? { ...v, ...patch } : v)),
    }));

  const buildPayload = (targetStatus: ProductStatus): ProductInput => ({
    name: form.name.trim(),
    brandName: (lockedBrand?.name ?? form.brandName).trim(),
    brandSlug: lockedBrand?.slug ?? (form.brandSlug || undefined),
    category: form.category || undefined,
    productCategory: form.productCategory || undefined,
    productType: form.productType || undefined,
    collection: form.collection || undefined,
    price: Number(form.price),
    compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
    currency: "EGP",
    image: form.image.trim(),
    images: form.images,
    colors: form.colors.filter((c) => c.name.trim() && c.hex.trim()),
    sizes: parseCsv(form.sizesText),
    material: form.material || undefined,
    fit: form.fit || undefined,
    description: form.description.trim(),
    details: parseLines(form.detailsText),
    careInstructions: parseLines(form.careInstructionsText),
    shippingReturns: form.shippingReturns.trim(),
    modelHeight: form.modelHeight || undefined,
    modelWearing: form.modelWearing || undefined,
    sku: form.sku.trim() || undefined,
    isNew: form.isNew,
    isUnisex: form.category !== "kids" && form.isUnisex,
    trackInventory: form.trackInventory,
    featured: form.featured,
    status: targetStatus,
    publishDate: form.publishDate ? new Date(form.publishDate).toISOString() : undefined,
    variants: form.variants,
  });

  const submit = async (targetStatus: ProductStatus) => {
    const payload = buildPayload(targetStatus);
    const validationError = validateProductInput(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmittingStatus(targetStatus);
    setError("");

    try {
      const res = await fetch(
        currentMode === "create" ? apiBasePath : `${apiBasePath}/${currentProductId}`,
        {
          method: currentMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      // Stay on the page — a first-time create switches to editing the
      // product it just made instead of re-posting a duplicate next save.
      setCurrentProductId(data.id);
      if (currentMode === "create") setCurrentMode("edit");
      setForm((f) => ({ ...f, status: targetStatus }));
      setSavedSnapshot({ ...form, status: targetStatus });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmittingStatus(null);
    }
  };

  const handleCancel = () => router.push(cancelHref);
  const handlePreview = () =>
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const submitting = submittingStatus !== null;
  const productTypeOptions = form.productCategory
    ? taxonomy.typesByCategory[form.productCategory] ?? []
    : [];

  const ActionToolbar = (
    <div className="flex flex-wrap items-center gap-2.5">
      {!isBrandPortal && (
        <button
          type="button"
          onClick={() => submit("draft")}
          disabled={submitting}
          className="rounded-md border border-stone-150 px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingStatus === "draft" ? "Saving…" : "Save as Draft"}
        </button>
      )}
      <button
        type="button"
        onClick={handlePreview}
        className="rounded-md border border-stone-150 px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-stone-50"
      >
        Preview
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="rounded-md border border-stone-150 px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-stone-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => submit("published")}
        disabled={submitting}
        className="rounded-md bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBrandPortal
          ? submittingStatus === "published"
            ? "Submitting…"
            : "Submit for Review"
          : submittingStatus === "published"
          ? "Publishing…"
          : "Publish Product"}
      </button>
      {hasUnsavedChanges && !submitting && (
        <span className="text-[12.5px] font-medium text-ink-soft/50">Unsaved changes</span>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[55%_45%] lg:items-start">
      <div className="max-w-2xl space-y-8">
        <div className="flex items-center justify-between gap-4">
          {ActionToolbar}
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}

        {/* 01 — Basic Information */}
        <FormSection number="01" title="Basic Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField label="Product Name" required value={form.name} onChange={(v) => set("name", v)} />
            {lockedBrand ? (
              <div>
                <span className="text-[12.5px] font-medium text-ink-soft/70">Brand</span>
                <div className="mt-1.5 w-full rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5 text-[14px] text-ink-soft/70">
                  {lockedBrand.name}
                </div>
              </div>
            ) : (
              <TextField
                label="Brand"
                required
                value={form.brandName}
                onChange={(v) => set("brandName", v)}
              />
            )}
            <SelectField
              label="Gender"
              value={form.category}
              onChange={(v) => set("category", v as FormState["category"])}
              options={[
                { value: "", label: "None (brand-only product)" },
                { value: "women", label: "Women" },
                { value: "men", label: "Men" },
                { value: "kids", label: "Kids" },
              ]}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField
              label="Category"
              required
              value={form.productCategory}
              onChange={(v) => set("productCategory", v)}
              options={[
                { value: "", label: "Select category" },
                ...taxonomy.categories.map((c) => ({ value: c, label: c })),
              ]}
            />
            <SelectField
              label="Product Type"
              required
              value={form.productType}
              onChange={(v) => set("productType", v)}
              disabled={!form.productCategory}
              options={[
                { value: "", label: "Select product type" },
                ...productTypeOptions.map((t) => ({ value: t, label: t })),
              ]}
            />
            <SelectField
              label="Collection"
              value={form.collection}
              onChange={(v) => set("collection", v)}
              options={[
                { value: "", label: "None" },
                ...taxonomy.collections.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>

          {(form.category === "women" || form.category === "men") && (
            <label className="mt-4 flex items-center gap-2 text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={form.isUnisex}
                onChange={(e) => set("isUnisex", e.target.checked)}
              />
              Unisex (also show in Men &amp; Women)
            </label>
          )}

          <div className="mt-4">
            <TextField
              label="SKU (optional, auto-generated if left blank)"
              value={form.sku}
              onChange={(v) => set("sku", v)}
            />
          </div>
        </FormSection>

        {/* 02 — Pricing */}
        <FormSection number="02" title="Pricing">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PriceField
              label="Price"
              required
              value={form.price}
              onChange={(v) => set("price", v)}
            />
            <PriceField
              label="Compare At Price"
              value={form.compareAtPrice}
              onChange={(v) => set("compareAtPrice", v)}
            />
          </div>
        </FormSection>

        {/* 03 — Media */}
        <FormSection number="03" title="Media">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageUploader
              label="Main Image *"
              hint="Recommended: 1000 x 1250px"
              folderId={uploadFolderId}
              value={form.image ? [form.image] : []}
              onChange={(urls) => set("image", urls[0] ?? "")}
              maxImages={1}
            />
            <ImageUploader
              label="Gallery Images"
              hint="Up to 4 images"
              folderId={uploadFolderId}
              multiple
              maxImages={4}
              value={form.images}
              onChange={(urls) => set("images", urls)}
            />
          </div>
        </FormSection>

        {/* 04 — Inventory */}
        <FormSection number="04" title="Inventory">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className="text-[12.5px] font-medium text-ink-soft/70">Quantity *</span>
              {singleVariant ? (
                <input
                  type="number"
                  min={0}
                  value={singleVariant.quantity}
                  onChange={(e) =>
                    updateSingleVariant({ quantity: Math.max(0, Number(e.target.value)) })
                  }
                  className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
                />
              ) : (
                <div className="mt-1.5 rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5 text-[14px] text-ink-soft/70">
                  {totalQuantity} total — set per variant below
                </div>
              )}
            </div>
            <label className="flex items-center justify-between rounded-md border border-stone-150 px-3.5 py-2.5">
              <span>
                <span className="block text-[13.5px] font-medium text-ink">Track Inventory</span>
                <span className="block text-[11.5px] text-ink-soft/50">
                  Automatically track and reduce stock
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.trackInventory}
                onChange={(e) => set("trackInventory", e.target.checked)}
                className="h-5 w-9 flex-none accent-ink"
              />
            </label>
          </div>

          {singleVariant && (
            <div className="mt-4 max-w-[200px]">
              <TextField
                label="Low Stock Alert"
                type="number"
                value={String(singleVariant.lowStockThreshold)}
                onChange={(v) =>
                  updateSingleVariant({ lowStockThreshold: Math.max(0, Number(v) || 0) })
                }
                hint="Get notified when stock reaches this quantity"
              />
            </div>
          )}
        </FormSection>

        {/* 05 — Product Options */}
        <FormSection number="05" title="Product Options">
          <div>
            <span className="text-[12.5px] font-medium text-ink-soft/70">Colors</span>
            <div className="mt-1.5 space-y-2">
              {form.colors.map((color, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Color name"
                    value={color.name}
                    onChange={(e) => updateColor(i, { name: e.target.value })}
                    className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
                  />
                  <input
                    type="color"
                    value={color.hex}
                    onChange={(e) => updateColor(i, { hex: e.target.value })}
                    className="h-9 w-12 rounded-md border border-stone-150"
                  />
                  <button
                    type="button"
                    onClick={() => removeColor(i)}
                    className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addColor}
                className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Add color
              </button>
            </div>
          </div>

          <div className="mt-4">
            <TextField
              label="Sizes (comma-separated, optional)"
              value={form.sizesText}
              onChange={(v) => set("sizesText", v)}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Material"
              value={form.material}
              onChange={(v) => set("material", v)}
              options={[
                { value: "", label: "Select material" },
                ...taxonomy.materials.map((m) => ({ value: m, label: m })),
              ]}
            />
            <SelectField
              label="Fit"
              value={form.fit}
              onChange={(v) => set("fit", v)}
              options={[
                { value: "", label: "Select fit" },
                ...taxonomy.fits.map((f) => ({ value: f, label: f })),
              ]}
            />
          </div>

          {form.variants.length > 1 && (
            <div className="mt-5">
              <span className="text-[12.5px] font-medium text-ink-soft/70">Variants</span>
              <div className="mt-1.5">
                <VariantGrid
                  variants={form.variants}
                  onChange={(variants) => set("variants", variants)}
                />
              </div>
            </div>
          )}
        </FormSection>

        {/* 06 — Product Details */}
        <FormSection number="06" title="Product Details">
          <TextArea
            label="Description"
            required
            value={form.description}
            onChange={(v) => set("description", v)}
            rows={3}
          />
          <div className="mt-4">
            <TextArea
              label="Details (one per line)"
              value={form.detailsText}
              onChange={(v) => set("detailsText", v)}
              rows={3}
            />
          </div>
          <div className="mt-4">
            <TextArea
              label="Care Instructions (one per line)"
              value={form.careInstructionsText}
              onChange={(v) => set("careInstructionsText", v)}
              rows={3}
            />
          </div>
          <div className="mt-4">
            <TextArea
              label="Shipping &amp; Returns"
              value={form.shippingReturns}
              onChange={(v) => set("shippingReturns", v)}
              rows={2}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Model Height (cm)"
              placeholder="e.g. 178 cm"
              value={form.modelHeight}
              onChange={(v) => set("modelHeight", v)}
            />
            <TextField
              label="Model Wearing"
              placeholder="e.g. M size"
              value={form.modelWearing}
              onChange={(v) => set("modelWearing", v)}
            />
          </div>
        </FormSection>

        {/* 07 — Visibility (admin-only: status/scheduling/featured are
            editorial calls the brand portal never makes directly — a
            brand-portal submission's status is always decided by the
            review flow, never typed in here) */}
        {!isBrandPortal && (
          <FormSection number="07" title="Visibility">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Status"
                required
                value={form.status}
                onChange={(v) => set("status", v as ProductStatus)}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "published", label: "Published" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <div>
                <TextField
                  label="Publish Date (optional)"
                  type="datetime-local"
                  value={form.publishDate}
                  onChange={(v) => set("publishDate", v)}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => set("featured", e.target.checked)}
                />
                Featured Product
              </label>
              <label className="flex items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={form.isNew}
                  onChange={(e) => set("isNew", e.target.checked)}
                />
                Mark as new (shows in New Arrivals)
              </label>
            </div>
          </FormSection>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-stone-150 pt-6">
          {ActionToolbar}
        </div>
      </div>

      <div ref={previewRef}>
        <ProductLivePreview
          form={form}
          productId={currentProductId}
          hasUnsavedChanges={hasUnsavedChanges}
          justSaved={justSaved}
        />
      </div>
    </div>
  );
}

function FormSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl3 border border-stone-150 bg-white p-6">
      <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
        <span className="text-ink-soft/40">{number}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TextField({
  label,
  type = "text",
  value,
  onChange,
  required,
  hint,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
      {hint && <span className="mt-1 block text-[11.5px] text-ink-soft/50">{hint}</span>}
    </label>
  );
}

function PriceField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1.5 flex items-center rounded-md border border-stone-150 bg-white focus-within:border-ink/30">
        <span className="border-r border-stone-150 px-3 py-2.5 text-[13px] font-semibold text-ink-soft/60">
          EGP
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full bg-transparent px-3.5 py-2.5 text-[14px] text-ink outline-none"
        />
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-ink-soft/40"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
    </label>
  );
}
