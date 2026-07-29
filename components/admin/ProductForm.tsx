"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Audience, ProductRecord, ProductStatus, ProductTaxonomyContent, TaxonomyNode } from "@/types";
import { parseLines } from "@/lib/admin/parseTextInputs";
import {
  validateProductInput,
  validateProductSections,
  type ProductEditorSectionId,
  type ProductValidationIssue,
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
  type VariantRow,
} from "@/components/admin/InventoryVariantsSection";
import VariantDrawer from "@/components/admin/VariantDrawer";
import type { NewColorInput } from "@/components/admin/ColorOptionPicker";
import CustomOptionManager from "@/components/admin/CustomOptionManager";
import { buildComboKey } from "@/lib/inventory/variantCombinations";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import {
  PRODUCT_EDITOR_SECTIONS,
  ProductEditorBottomBar,
  ProductEditorHeader,
  ProductErrorSummary,
  ProductSectionNavigation,
  type EditorSaveState,
} from "@/components/admin/ProductEditorChrome";

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
  brandSlug?: string;
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
    allowedCombinations: (product?.variants ?? []).map((v) => v.optionValues.map((s) => s.optionValueId)),
    variants: (product?.variants ?? []).map((v) => ({
      id: v.id,
      optionValueIds: v.optionValues.map((s) => s.optionValueId),
      sku: v.sku,
      quantity: v.quantity,
      variantPrice: v.variantPrice,
      lowStockThresholdOverride: v.lowStockThresholdOverride,
      sellingStatus: v.sellingStatus,
      updatedAt: v.updatedAt,
    })),
    colorImages: product?.colorImages ?? {},
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
  brandSlug,
  apiBasePath = "/api/admin/products",
  cancelHref = "/admin/products",
}: ProductFormProps) {
  const router = useRouter();
  const isBrandPortal = Boolean(lockedBrand);
  const optionsApiBase = isBrandPortal ? "/api/brand-portal" : "/api/admin";
  const brandQuery = isBrandPortal && brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : "";
  const [form, setForm] = useState<FormState>(() => toFormState(initial, lockedBrand));
  const [submittingStatus, setSubmittingStatus] = useState<ProductStatus | null>(null);
  const [error, setError] = useState("");
  const [submittedIssues, setSubmittedIssues] = useState<ProductValidationIssue[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | undefined>();
  const [activeSection, setActiveSection] = useState<ProductEditorSectionId>("basic");

  const [optionTypes, setOptionTypes] = useState<OptionTypeOption[]>([]);
  const [optionValues, setOptionValues] = useState<OptionValueOption[]>([]);
  const [activeVariantCell, setActiveVariantCell] = useState<{ colorId: string; sizeId: string } | null>(null);

  // Save now keeps the admin on this page instead of redirecting to the
  // list, so a first-time create needs to remember the id it gets back and
  // switch to PATCHing from then on instead of POSTing a duplicate.
  const [currentMode, setCurrentMode] = useState(mode);
  const [currentProductId, setCurrentProductId] = useState(productId);
  const saveOperationKey = useRef(crypto.randomUUID());
  const [savedSnapshot, setSavedSnapshot] = useState(form);
  const [justSaved, setJustSaved] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<ProductEditorSectionId, HTMLElement>>>({});

  // Storage folder for image uploads: the real product id once one exists,
  // otherwise a stable per-session temporary id so images can be uploaded
  // before the product row is ever created.
  const [uploadFolderId] = useState(() => productId ?? crypto.randomUUID());

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedSnapshot),
    [form, savedSnapshot]
  );

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id.startsWith("product-section-")) {
          setActiveSection(visible.target.id.replace("product-section-", "") as ProductEditorSectionId);
        }
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: [0.05, 0.25, 0.6] }
    );
    for (const section of Object.values(sectionRefs.current)) if (section) observer.observe(section);
    return () => observer.disconnect();
  }, []);

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
    const res = await fetch(`${url}${brandQuery}`);
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
    const res = await fetch(`${optionsApiBase}/product-options/types${brandQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optionsApiBase === "/api/admin" ? { brandId: form.brandId, name } : { name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create option type");
    const created: OptionTypeOption = { id: data.id, name: data.name, key: data.key, isSystem: data.isSystem, brandId: data.brandId };
    setOptionTypes((prev) => [...prev, created]);
    return created;
  };

  const handleCreateOptionValue = async (
    optionTypeId: string,
    label: string,
    colorInput?: NewColorInput
  ): Promise<OptionValueOption> => {
    const res = await fetch(`${optionsApiBase}/product-options/values${brandQuery}`, {
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
      brandId: data.brandId,
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
      inventoryVariants: { ...f.inventoryVariants, optionTypeIds: [], valueIdsByOptionType: {}, allowedCombinations: [], variants: [], colorImages: {} },
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
    allowedCombinations: form.inventoryVariants.allowedCombinations,
    variants: form.inventoryVariants.variants,
    colorImages: form.inventoryVariants.colorImages,
  });

  const submit = async (targetStatus: ProductStatus) => {
    const payload = buildPayload(targetStatus);
    const issues = validateProductSections(payload);
    const validationError = validateProductInput(payload);
    if (validationError) {
      setError(validationError);
      setSubmittedIssues(issues);
      const first = issues[0];
      if (first) requestAnimationFrame(() => navigateToIssue(first));
      return;
    }

    setSubmittingStatus(targetStatus);
    setError("");
    setSubmittedIssues([]);
    setSaveFailed(false);

    try {
      const targetUrl = currentMode === "create" ? apiBasePath : `${apiBasePath}/${currentProductId}`;
      const res = await fetch(
        `${targetUrl}${brandQuery}`,
        {
          method: currentMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", "Idempotency-Key": saveOperationKey.current },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setSaveFailed(true);
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
      saveOperationKey.current = crypto.randomUUID();
      setSavedSnapshot(nextForm);
      setLastSavedAt(new Date());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaveFailed(true);
    } finally {
      setSubmittingStatus(null);
    }
  };

  const handleCancel = () => {
    if (!hasUnsavedChanges || window.confirm("You have unsaved changes. Leave this product editor?")) router.push(cancelHref);
  };
  const handlePreview = () =>
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const submitting = submittingStatus !== null;
  const currentIssues = validateProductSections(buildPayload(form.status));
  const completedSections = new Set<ProductEditorSectionId>(
    PRODUCT_EDITOR_SECTIONS.filter((section) => !currentIssues.some((issue) => issue.section === section.id)).map((section) => section.id)
  );
  const saveState: EditorSaveState = submitting ? "saving" : saveFailed ? "failed" : hasUnsavedChanges ? "unsaved" : "saved";

  const colorType = optionTypes.find((t) => t.key === "color");
  const sizeType = optionTypes.find((t) => t.key === "size");
  const activeColor = activeVariantCell ? optionValues.find((v) => v.id === activeVariantCell.colorId) : undefined;
  const activeSize = activeVariantCell ? optionValues.find((v) => v.id === activeVariantCell.sizeId) : undefined;
  const activeColorCount = colorType ? (form.inventoryVariants.valueIdsByOptionType[colorType.id] ?? []).length : 0;
  const activeExistingVariant = activeVariantCell
    ? form.inventoryVariants.variants.find(
        (v) => buildComboKey(v.optionValueIds) === buildComboKey([activeVariantCell.colorId, activeVariantCell.sizeId].sort())
      )
    : undefined;
  const inventoryHref = currentProductId
    ? (isBrandPortal
        ? `/brand-portal/stock?product=${encodeURIComponent(currentProductId)}${brandSlug ? `&brand=${encodeURIComponent(brandSlug)}` : ""}`
        : `/admin/low-stock?product=${encodeURIComponent(currentProductId)}`)
    : undefined;

  function saveVariantFromDrawer(input: { openingStock: number; variantPrice: number | undefined; lowStockThresholdOverride: number | undefined }) {
    if (!activeVariantCell || !colorType || !sizeType) return;
    const optionValueIds = [activeVariantCell.colorId, activeVariantCell.sizeId];
    const comboKey = buildComboKey(optionValueIds);
    const existing = form.inventoryVariants.variants.find((v) => buildComboKey(v.optionValueIds) === comboKey);
    let nextVariants: VariantRow[];
    if (existing) {
      nextVariants = form.inventoryVariants.variants.map((v) =>
        buildComboKey(v.optionValueIds) === comboKey
          ? { ...v, variantPrice: input.variantPrice, lowStockThresholdOverride: input.lowStockThresholdOverride }
          : v
      );
    } else {
      const newRow: VariantRow = {
        optionValueIds,
        quantity: input.openingStock,
        openingStock: input.openingStock,
        variantPrice: input.variantPrice,
        lowStockThresholdOverride: input.lowStockThresholdOverride,
        sellingStatus: "active",
      };
      nextVariants = [...form.inventoryVariants.variants, newRow];
    }
    set("inventoryVariants", { ...form.inventoryVariants, variants: nextVariants });
    setActiveVariantCell(null);
  }

  function navigateToSection(sectionId: ProductEditorSectionId) {
    const target = sectionRefs.current[sectionId];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }

  function navigateToIssue(issue: ProductValidationIssue) {
    navigateToSection(issue.section);
    window.setTimeout(() => document.getElementById(issue.fieldId)?.focus(), 350);
  }

  return (
    <div className="min-w-0">
      <ProductEditorHeader
        title={form.name.trim() || (currentMode === "create" ? "New Product" : "Edit Product")}
        status={form.status}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        submitting={submitting}
        isBrandPortal={isBrandPortal}
        onSaveDraft={() => submit("draft")}
        onPublish={() => submit("published")}
        onPreview={handlePreview}
        onBack={handleCancel}
      />
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[190px_minmax(420px,1.08fr)_minmax(390px,0.92fr)] 2xl:grid-cols-[210px_minmax(520px,1.05fr)_minmax(500px,0.95fr)] xl:items-start">
        <ProductSectionNavigation activeSection={activeSection} issues={currentIssues} completed={completedSections} onNavigate={navigateToSection} isBrandPortal={isBrandPortal} />
        <div className="min-w-0 space-y-6">
          <ProductErrorSummary issues={submittedIssues} onNavigate={navigateToIssue} />

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}

        {/* 01 — Basic Information — field order: Product Name, Brand,
            Audience, Main Category / Product Group / Product Type,
            Collection, Product SKU. */}
        <FormSection sectionId="basic" sectionRef={(node) => { sectionRefs.current.basic = node ?? undefined; }} number="01" title="Basic Information" description="Define ownership, audience, taxonomy, Collection, and the immutable product identity." complete={completedSections.has("basic")} issueCount={currentIssues.filter((issue) => issue.section === "basic").length}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField id="product-name" label="Product Name" required value={form.name} onChange={(v) => set("name", v)} />
            <div id="product-brand"><BrandSelect
              options={brandOptions}
              value={form.brandId}
              onChange={handleBrandChange}
              disabled={Boolean(lockedBrand) || mode === "edit"}
            /></div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              id="product-audience"
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
              brandSlug={brandSlug}
            />
          </div>

          <div id="product-taxonomy" className="mt-4" tabIndex={-1}>
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
        <FormSection sectionId="pricing" sectionRef={(node) => { sectionRefs.current.pricing = node ?? undefined; }} number="02" title="Pricing" description="Set the default selling price used whenever a variant does not define its own final price." complete={completedSections.has("pricing")} issueCount={currentIssues.filter((issue) => issue.section === "pricing").length}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PriceField
              id="product-price"
              label="Price"
              required
              value={form.price}
              onChange={(v) => set("price", v)}
            />
            <PriceField
              id="product-compare-price"
              label="Compare At Price"
              value={form.compareAtPrice}
              onChange={(v) => set("compareAtPrice", v)}
            />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-stone-150 bg-stone-50 px-4 py-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft/45">Price preview</p>
              <p className="mt-1 text-[18px] font-bold text-ink">{Number(form.price) > 0 ? `${Number(form.price).toLocaleString()} EGP` : "— EGP"}</p>
            </div>
            {Number(form.compareAtPrice) > Number(form.price) && <p className="text-[13px] text-ink-soft/45 line-through">{Number(form.compareAtPrice).toLocaleString()} EGP</p>}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-soft/50">Compare At Price is used to display a discount when higher than the selling price. Variant Price remains the final price for that variant.</p>
        </FormSection>

        {/* 03 — Media */}
        <FormSection sectionId="media" sectionRef={(node) => { sectionRefs.current.media = node ?? undefined; }} number="03" title="Media" description="Manage the cover and the ordered product-detail media collection." complete={completedSections.has("media")} issueCount={currentIssues.filter((issue) => issue.section === "media").length}>
          <p className="mb-3 text-[12px] text-ink-soft/55">The Main Image remains the listing cover and also participates in the ordered product-detail gallery. Product media is limited to 10 unique images, including Color-mapped images.</p>
          <div id="product-media" tabIndex={-1} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageUploader
              label="Main Image *"
              hint="Required cover; automatically included in Gallery"
              folderId={uploadFolderId}
              value={form.image ? [form.image] : []}
              onChange={(urls) => set("image", urls[0] ?? "")}
              maxImages={1}
            />
            <ImageUploader
              label="Gallery Images"
              hint="Ordered after Main Image; up to 9 additional images"
              folderId={uploadFolderId}
              multiple
              maxImages={9}
              value={form.images}
              onChange={(urls) => set("images", urls)}
            />
          </div>
        </FormSection>

        {/* 04 — Inventory & Variants */}
        <FormSection sectionId="inventory" sectionRef={(node) => { sectionRefs.current.inventory = node ?? undefined; }} number="04" title="Inventory & Variants" description="Choose option values, define the combinations that exist, and manage inventory safely." complete={completedSections.has("inventory")} issueCount={currentIssues.filter((issue) => issue.section === "inventory").length}>
          <div id="inventory-variants" tabIndex={-1}><InventoryVariantsSection
            value={form.inventoryVariants}
            onChange={(next) => set("inventoryVariants", next)}
            availableOptionTypes={optionTypes}
            availableOptionValues={optionValues}
            onCreateOptionType={handleCreateOptionType}
            onCreateOptionValue={handleCreateOptionValue}
            currency="EGP"
            productSkuPreview={form.sku || "(generated after first save)"}
            productPrice={Number(form.price) || 0}
            disabled={!form.brandId}
            taxonomyNodes={taxonomyNodes}
            productTypeId={form.productTypeId}
            productPublished={form.status === "published"}
            inventoryHref={inventoryHref}
            onCellClick={(colorId, sizeId) => setActiveVariantCell({ colorId, sizeId })}
          /></div>
          <CustomOptionManager optionTypes={optionTypes} optionValues={optionValues} apiBasePath={optionsApiBase} brandId={form.brandId} brandSlug={brandSlug} onChanged={loadOptions} />
        </FormSection>

        {/* 05 — Product Details */}
        <FormSection sectionId="details" sectionRef={(node) => { sectionRefs.current.details = node ?? undefined; }} number="05" title="Product Details" description="Present the current descriptive, care, shipping, and model information." complete={completedSections.has("details")} issueCount={currentIssues.filter((issue) => issue.section === "details").length}>
          <TextArea
            id="product-description"
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
          <FormSection sectionId="visibility" sectionRef={(node) => { sectionRefs.current.visibility = node ?? undefined; }} number="06" title="Visibility" description="Use the existing publication and merchandising controls." complete={completedSections.has("visibility")} issueCount={currentIssues.filter((issue) => issue.section === "visibility").length}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                id="product-status"
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

        <ProductEditorBottomBar dirty={hasUnsavedChanges} submitting={submitting} isBrandPortal={isBrandPortal} onSaveDraft={() => submit("draft")} onPublish={() => submit("published")} />
      </div>

      <div ref={previewRef} className="min-w-0 xl:sticky xl:top-[158px] xl:h-[calc(100vh-174px)]">
        {activeVariantCell && activeColor && activeSize && (
          <VariantDrawer
            color={activeColor}
            size={activeSize}
            existing={activeExistingVariant}
            colorImageUrl={form.inventoryVariants.colorImages[activeColor.id]}
            isMultiColor={activeColorCount >= 2}
            basePrice={Number(form.price) || 0}
            currency="EGP"
            defaultLowStockThreshold={form.inventoryVariants.defaultLowStockThreshold}
            inventoryHref={inventoryHref}
            onUploadColorImage={(url) =>
              set("inventoryVariants", {
                ...form.inventoryVariants,
                colorImages: { ...form.inventoryVariants.colorImages, [activeColor.id]: url },
              })
            }
            onSave={saveVariantFromDrawer}
            onCancel={() => setActiveVariantCell(null)}
          />
        )}
        {/* Kept mounted (not conditionally unmounted) while the Drawer is open, only
            visually hidden, so ProductLivePreview's own state — selected Color/Size,
            gallery position, desktop/mobile viewport — survives the Drawer opening
            and closing instead of resetting on remount. */}
        <div className={activeVariantCell ? "hidden" : "contents"}>
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
          optionTypes={optionTypes}
          productId={currentProductId}
          hasUnsavedChanges={hasUnsavedChanges}
          justSaved={justSaved}
        />
        </div>
      </div>
      </div>
    </div>
  );
}

function FormSection({
  sectionId,
  sectionRef,
  number,
  title,
  description,
  complete,
  issueCount,
  children,
}: {
  sectionId: ProductEditorSectionId;
  sectionRef: (node: HTMLElement | null) => void;
  number: string;
  title: string;
  description: string;
  complete: boolean;
  issueCount: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`product-section-${sectionId}`}
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby={`product-section-${sectionId}-title`}
      className="scroll-mt-44 rounded-xl3 border border-stone-150 bg-white p-5 outline-none focus-visible:ring-2 focus-visible:ring-ink/20 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-stone-100 px-2 py-1 text-[10px] font-bold text-ink-soft/55">{number}</span>
        <div className="min-w-0 flex-1">
          <h2 id={`product-section-${sectionId}-title`} className="text-[15px] font-bold text-ink">{title}</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft/55">{description}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${issueCount ? "bg-red-50 text-red-700" : complete ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-ink-soft/55"}`}>
          {issueCount ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : complete ? "Complete" : "Incomplete"}
        </span>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  required,
  hint,
  placeholder,
}: {
  id?: string;
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
        id={id}
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
  id,
  label,
  value,
  onChange,
  required,
}: {
  id?: string;
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
        id={id}
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
  id,
  label,
  value,
  onChange,
  options,
  required,
  disabled,
}: {
  id?: string;
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
        id={id}
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
  id,
  label,
  value,
  onChange,
  rows = 3,
  required,
}: {
  id?: string;
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
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
    </label>
  );
}
