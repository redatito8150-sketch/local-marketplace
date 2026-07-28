"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Audience, ProductRecord, ProductStatus, ProductTaxonomyContent, TaxonomyNode } from "@/types";
import { parseLines } from "@/lib/admin/parseTextInputs";
import {
  validateProductInput,
  type ProductInput,
} from "@/lib/admin/productValidation";
import ImageUploader from "@/components/admin/ImageUploader";
import ProductLivePreview from "@/components/admin/ProductLivePreview";
import TaxonomySelector from "@/components/admin/TaxonomySelector";
import BrandSelect, { type BrandOption } from "@/components/admin/BrandSelect";
import CollectionSelect from "@/components/admin/CollectionSelect";
import InventoryVariantsSection, {
  type InventoryVariantsValue,
  type OptionTypeOption,
  type OptionValueOption,
} from "@/components/admin/InventoryVariantsSection";
import type { NewColorInput } from "@/components/admin/ColorOptionPicker";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "unisex", label: "Unisex" },
  { value: "kids_baby", label: "Kids & Baby" },
];

interface ProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  initial?: ProductRecord;
  brandOptions: BrandOption[];
  // Admin-editable (Round 2 Phase 2) — falls back to the static defaults so
  // any caller that doesn't fetch site_content still works unchanged. Only
  // Materials/Fits still come from this — Main Category/Product Group/
  // Product Type/Collection are driven by `taxonomyNodes`/CollectionSelect
  // instead. Material/Fit stay in Product Content & Specifications going
  // forward and are not part of Inventory & Variants.
  taxonomy?: ProductTaxonomyContent;
  // The flat, active Main Category -> Product Group -> Product Type tree
  // (lib/data/taxonomy.ts) backing the cascading taxonomy selects.
  taxonomyNodes: TaxonomyNode[];
  // Brand-portal mode: forces the brand field to one brand (shown
  // read-only, never editable — a brand owner/assistant can never
  // reassign their own product to a different brand), submits to a
  // different API base path, and replaces Draft/Publish with a single
  // "Submit for Review" action label (the write itself still publishes
  // immediately per the Instant-Publish model — see CLAUDE.md).
  lockedBrand?: { id: string; name: string };
  apiBasePath?: string;
  cancelHref?: string;
}

interface FormState {
  name: string;
  brandId: string;
  brandName: string; // display-only (preview + locked-brand label), never submitted
  audience: Audience | "";
  productTypeId: string;
  collectionId: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  image: string;
  images: string[];
  material: string;
  fit: string;
  inventoryVariants: InventoryVariantsValue;
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
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toInventoryVariantsValue(product?: ProductRecord): InventoryVariantsValue {
  const optionTypeIds: string[] = [];
  const valueIdsByOptionType: Record<string, string[]> = {};
  for (const variant of product?.variants ?? []) {
    for (const selection of variant.optionValues) {
      if (!optionTypeIds.includes(selection.optionTypeId)) optionTypeIds.push(selection.optionTypeId);
      const current = valueIdsByOptionType[selection.optionTypeId] ?? [];
      if (!current.includes(selection.optionValueId)) {
        valueIdsByOptionType[selection.optionTypeId] = [...current, selection.optionValueId];
      }
    }
  }

  return {
    defaultLowStockThreshold: product?.defaultLowStockThreshold ?? 5,
    optionTypeIds,
    valueIdsByOptionType,
    variants: (product?.variants ?? []).map((v) => ({
      optionValueIds: v.optionValues.map((s) => s.optionValueId),
      sku: v.sku,
      quantity: v.quantity,
      variantPrice: v.variantPrice,
      lowStockThresholdOverride: v.lowStockThresholdOverride,
      sellingStatus: v.sellingStatus,
    })),
    colorImages: {},
  };
}

function toFormState(
  product?: ProductRecord,
  lockedBrand?: { id: string; name: string }
): FormState {
  return {
    name: product?.name ?? "",
    brandId: lockedBrand?.id ?? product?.brandId ?? "",
    brandName: lockedBrand?.name ?? product?.brandName ?? "",
    audience: product?.audience ?? "",
    productTypeId: product?.productTypeId ?? "",
    collectionId: product?.collectionId ?? "",
    sku: product?.sku ?? "",
    price: product ? String(product.price) : "",
    compareAtPrice: product?.compareAtPrice != null ? String(product.compareAtPrice) : "",
    image: product?.image ?? "",
    images: product?.images ?? [],
    material: product?.material ?? "",
    fit: product?.fit ?? "",
    inventoryVariants: toInventoryVariantsValue(product),
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
  };
}

export default function ProductForm({
  mode,
  productId,
  initial,
  brandOptions,
  taxonomy = DEFAULT_PRODUCT_TAXONOMY,
  taxonomyNodes,
  lockedBrand,
  apiBasePath = "/api/admin/products",
  cancelHref = "/admin/products",
}: ProductFormProps) {
  const router = useRouter();
  const isBrandPortal = Boolean(lockedBrand);
  const optionsApiBase = isBrandPortal ? "/api/brand-portal" : "/api/admin";
  const [form, setForm] = useState<FormState>(() => toFormState(initial, lockedBrand));
  const [submittingStatus, setSubmittingStatus] = useState<ProductStatus | null>(null);
  const [error, setError] = useState("");

  const [optionTypes, setOptionTypes] = useState<OptionTypeOption[]>([]);
  const [optionValues, setOptionValues] = useState<OptionValueOption[]>([]);

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

  const loadOptions = async () => {
    if (!form.brandId) {
      setOptionTypes([]);
      setOptionValues([]);
      return;
    }
    const url =
      optionsApiBase === "/api/admin"
        ? `/api/admin/product-options?brandId=${encodeURIComponent(form.brandId)}`
        : "/api/brand-portal/product-options";
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      setOptionTypes(data.optionTypes ?? []);
      setOptionValues(data.optionValues ?? []);
    }
  };

  useEffect(() => {
    // Fetching from the network on a prop/state change (brandId) is the
    // canonical use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.brandId]);

  const handleCreateOptionType = async (name: string): Promise<OptionTypeOption> => {
    const res = await fetch(`${optionsApiBase}/product-options/types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optionsApiBase === "/api/admin" ? { brandId: form.brandId, name } : { name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create option type");
    const created: OptionTypeOption = { id: data.id, name: data.name, key: data.key, isSystem: data.isSystem };
    setOptionTypes((prev) => [...prev, created]);
    return created;
  };

  const handleCreateOptionValue = async (
    optionTypeId: string,
    label: string,
    colorInput?: NewColorInput
  ): Promise<OptionValueOption> => {
    const res = await fetch(`${optionsApiBase}/product-options/values`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(optionsApiBase === "/api/admin" ? { brandId: form.brandId } : {}),
        optionTypeId,
        label,
        swatchType: colorInput?.swatchType,
        primaryColor: colorInput?.primaryColor,
        secondaryColor: colorInput?.secondaryColor,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create option value");
    const created: OptionValueOption = {
      id: data.id,
      optionTypeId: data.optionTypeId,
      label: data.label,
      swatchType: data.swatchType,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
    };
    setOptionValues((prev) => [...prev, created]);
    return created;
  };

  const handleTaxonomyChange = (productTypeId: string) => {
    setForm((f) => ({ ...f, productTypeId }));
  };

  const handleAudienceChange = (audience: Audience) => {
    setForm((f) => ({ ...f, audience }));
  };

  const handleBrandChange = (brandId: string) => {
    const brand = brandOptions.find((option) => option.id === brandId);
    setForm((f) => ({
      ...f,
      brandId,
      brandName: brand?.name ?? f.brandName,
      // A different brand's collections/private options are a different
      // pool entirely — never keep selections from the brand just left.
      collectionId: "",
      inventoryVariants: { ...f.inventoryVariants, optionTypeIds: [], valueIdsByOptionType: {}, variants: [], colorImages: {} },
    }));
  };

  const buildPayload = (targetStatus: ProductStatus): ProductInput => ({
    name: form.name.trim(),
    brandId: lockedBrand?.id ?? form.brandId,
    audience: form.audience as Audience,
    productTypeId: form.productTypeId,
    collectionId: form.collectionId || undefined,
    price: Number(form.price),
    compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
    currency: "EGP",
    image: form.image.trim(),
    images: form.images,
    material: form.material || undefined,
    fit: form.fit || undefined,
    description: form.description.trim(),
    details: parseLines(form.detailsText),
    careInstructions: parseLines(form.careInstructionsText),
    shippingReturns: form.shippingReturns.trim(),
    modelHeight: form.modelHeight || undefined,
    modelWearing: form.modelWearing || undefined,
    isNew: form.isNew,
    featured: form.featured,
    status: targetStatus,
    publishDate: form.publishDate ? new Date(form.publishDate).toISOString() : undefined,
    defaultLowStockThreshold: form.inventoryVariants.defaultLowStockThreshold,
    optionTypeIds: form.inventoryVariants.optionTypeIds,
    valueIdsByOptionType: form.inventoryVariants.valueIdsByOptionType,
    variants: form.inventoryVariants.variants,
    colorImages: form.inventoryVariants.colorImages,
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
      // Server-generated variant SKUs only exist after a successful save —
      // reflect them in the now-read-only fields immediately rather than
      // waiting on a full page reload.
      const nextVariants: InventoryVariantsValue = data.variants
        ? { ...form.inventoryVariants, variants: data.variants }
        : form.inventoryVariants;
      const nextForm = { ...form, status: targetStatus, inventoryVariants: nextVariants };
      setForm(nextForm);
      setSavedSnapshot(nextForm);
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

        {/* 01 — Basic Information — field order: Product Name, Brand,
            Audience, Main Category / Product Group / Product Type,
            Collection, Product SKU. */}
        <FormSection number="01" title="Basic Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Product Name" required value={form.name} onChange={(v) => set("name", v)} />
            <BrandSelect
              options={brandOptions}
              value={form.brandId}
              onChange={handleBrandChange}
              disabled={Boolean(lockedBrand) || mode === "edit"}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Audience"
              required
              value={form.audience}
              onChange={(v) => handleAudienceChange(v as Audience)}
              options={[
                { value: "", label: "Select audience" },
                ...AUDIENCE_OPTIONS,
              ]}
            />
            <CollectionSelect
              brandId={form.brandId}
              value={form.collectionId}
              onChange={(v) => set("collectionId", v)}
              apiBasePath={optionsApiBase}
            />
          </div>

          <div className="mt-4">
            <TaxonomySelector
              nodes={taxonomyNodes}
              value={form.productTypeId}
              onChange={handleTaxonomyChange}
            />
          </div>

          <div className="mt-4">
            <span className="text-[12.5px] font-medium text-ink-soft/70">Product SKU</span>
            {form.sku ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5">
                <code className="select-all text-[14px] text-ink">{form.sku}</code>
                <span className="text-[11px] font-medium text-ink-soft/45">Read-only</span>
              </div>
            ) : (
              <div className="mt-1.5 rounded-md border border-dashed border-stone-150 px-3.5 py-2.5 text-[13px] text-ink-soft/50">
                Generated automatically after saving
              </div>
            )}
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

        {/* 04 — Inventory & Variants */}
        <FormSection number="04" title="Inventory & Variants">
          <InventoryVariantsSection
            value={form.inventoryVariants}
            onChange={(next) => set("inventoryVariants", next)}
            availableOptionTypes={optionTypes}
            availableOptionValues={optionValues}
            onCreateOptionType={handleCreateOptionType}
            onCreateOptionValue={handleCreateOptionValue}
            currency="EGP"
            productSkuPreview={form.sku || "(generated after first save)"}
            disabled={!form.brandId}
          />
        </FormSection>

        {/* 05 — Product Details */}
        <FormSection number="05" title="Product Details">
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
          {/* Material/Fit intentionally stay here for now (unchanged
              inputs) — they'll move into Product Content & Specifications
              in a later phase, not into Inventory & Variants. */}
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
        </FormSection>

        {/* 06 — Visibility (admin-only: status/scheduling/featured are
            editorial calls the brand portal never makes directly — a
            brand-portal submission's status is always decided by the
            review flow, never typed in here) */}
        {!isBrandPortal && (
          <FormSection number="06" title="Visibility">
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
          form={{
            name: form.name,
            brandName: form.brandName,
            audience: form.audience,
            productTypeId: form.productTypeId,
            collectionName: "",
            price: form.price,
            compareAtPrice: form.compareAtPrice,
            image: form.image,
            images: form.images,
            inventoryVariants: form.inventoryVariants,
            description: form.description,
            detailsText: form.detailsText,
            careInstructionsText: form.careInstructionsText,
            shippingReturns: form.shippingReturns,
            modelHeight: form.modelHeight,
            modelWearing: form.modelWearing,
            sku: form.sku,
            featured: form.featured,
          }}
          taxonomyNodes={taxonomyNodes}
          optionValues={optionValues}
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
