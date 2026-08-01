"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Audience, ProductMaterialEntry, ProductRecord, ProductStatus, ProductTaxonomyContent, TaxonomyNode } from "@/types";
import {
  validateProductInput,
  validateProductSections,
  type ProductEditorSectionId,
  type ProductValidationIssue,
  type ProductInput,
} from "@/lib/admin/productValidation";
import MediaGallery from "@/components/admin/MediaGallery";
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
import CustomOptionManager from "@/components/admin/CustomOptionManager";
import DescriptionEditor from "@/components/admin/DescriptionEditor";
import HighlightsListBuilder from "@/components/admin/HighlightsListBuilder";
import CareInstructionsPicker from "@/components/admin/CareInstructionsPicker";
import MaterialsComposer from "@/components/admin/MaterialsComposer";
import FitSelect from "@/components/admin/FitSelect";
import { resolveShippingPolicy, type BrandPolicyFields } from "@/lib/admin/shippingPolicy";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import {
  PRODUCT_EDITOR_SECTIONS,
  ProductEditorBottomBar,
  ProductEditorHeader,
  ProductErrorSummary,
  type EditorSaveState,
} from "@/components/admin/ProductEditorChrome";

// Quick-fill buttons for the "Discount ends" field — covers the common
// relative durations while the datetime-local input right above them still
// takes an exact date/time directly, so both duration styles are one control.
const DISCOUNT_DURATION_PRESETS: { id: string; label: string; hours?: number }[] = [
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "3d", label: "3 days", hours: 72 },
  { id: "1w", label: "1 week", hours: 24 * 7 },
  { id: "1m", label: "1 month", hours: 24 * 30 },
  { id: "none", label: "No end date" },
];

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
  // Brand-portal mode has no BrandSelect list to read policy fields from
  // (the brand is locked) — this carries the locked brand's own Shipping &
  // Returns policy fields so the resolved policy can still be computed.
  lockedBrandPolicy?: BrandPolicyFields;
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
  discountPercent: string;
  discountEndsAt: string; // datetime-local value, "" = no end date (runs forever)
  image: string;
  images: string[];
  // Legacy single-material field — no longer editable; kept only so an
  // existing product's old value isn't lost from FormState. `materials`
  // (below) is the real, structured composition the editor now uses.
  material: string;
  materials: ProductMaterialEntry[];
  fit: string;
  inventoryVariants: InventoryVariantsValue;
  description: string;
  details: string[];
  careInstructions: string[];
  modelHeight: string;
  modelWearing: string;
  status: ProductStatus;
  featured: boolean;
  publishDate: string;
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
    discountPercent: product?.discountPercent != null ? String(product.discountPercent) : "",
    discountEndsAt: product?.discountEndsAt ? toDatetimeLocalValue(product.discountEndsAt) : "",
    image: product?.image ?? "",
    // `product.images` is the flattened, persisted [cover, ...gallery,
    // ...colorImages] order — strip the cover back out here since the
    // editor's `images` field represents everything *except* the cover
    // (MediaGallery renders the cover in its own fixed, non-reorderable slot).
    images: (product?.images ?? []).filter((url) => url !== product?.image),
    material: product?.material ?? "",
    // Client-side fallback for the same migration the DB backfill already
    // does (supabase/migrations/20260803000003_product_details_rebuild.sql)
    // — belt-and-braces in case a product predates that backfill.
    materials: product?.materials?.length
      ? product.materials
      : product?.material?.trim()
      ? [{ material: product.material.trim(), percentage: 100 }]
      : [],
    fit: product?.fit ?? "",
    inventoryVariants: toInventoryVariantsValue(product),
    description: product?.description ?? "",
    details: product?.details ?? [],
    careInstructions: product?.careInstructions ?? [],
    modelHeight: product?.modelHeight ?? "",
    modelWearing: product?.modelWearing ?? "",
    status: product?.status ?? "draft",
    featured: product?.featured ?? false,
    publishDate: product?.publishDate ? toDatetimeLocalValue(product.publishDate) : "",
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
  lockedBrandPolicy,
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
  const colorType = optionTypes.find((t) => t.key === "color");
  const sizeType = optionTypes.find((t) => t.key === "size");

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
    discountPercent: form.discountPercent ? Number(form.discountPercent) : undefined,
    discountEndsAt: form.discountEndsAt ? new Date(form.discountEndsAt).toISOString() : undefined,
    currency: "EGP",
    image: form.image.trim(),
    images: form.images,
    // Legacy `material`/`shippingReturns` are intentionally omitted — the
    // editor no longer collects them (materials[] and the resolved Brand
    // policy replaced them), and productPersistence.ts only overwrites
    // those DB columns when a value is explicitly provided.
    materials: form.materials.filter((m) => m.material.trim()),
    fit: form.fit || undefined,
    description: form.description.trim(),
    details: form.details.map((d) => d.trim()).filter(Boolean),
    careInstructions: form.careInstructions,
    modelHeight: form.modelHeight || undefined,
    modelWearing: form.modelWearing || undefined,
    // Featured (admin-list-only now) and isNew (computed automatically from
    // status + Publish Date, see lib/newArrivals.ts) are never sent from
    // this editor — omitting them keeps productPersistence.ts's conditional
    // writes from ever touching either column here.
    status: targetStatus,
    publishDate: form.publishDate ? new Date(form.publishDate).toISOString() : undefined,
    defaultLowStockThreshold: form.inventoryVariants.defaultLowStockThreshold,
    optionTypeIds: form.inventoryVariants.optionTypeIds,
    valueIdsByOptionType: form.inventoryVariants.valueIdsByOptionType,
    allowedCombinations: form.inventoryVariants.allowedCombinations,
    variants: form.inventoryVariants.variants,
    colorImages: form.inventoryVariants.colorImages,
    colorOptionTypeId: colorType?.id,
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

  const submitting = submittingStatus !== null;
  const currentIssues = validateProductSections(buildPayload(form.status));
  // The green "Complete" badge means "actually ready to publish", not just
  // "no errors for the current Draft/Published status" — some rules (e.g.
  // every Color needs an image once there are 2+) only turn into a real
  // validation issue at status: "published", so a Draft product with
  // missing Color images would otherwise show every section as falsely
  // Complete. Always check against "published" for the badge; the red
  // issue-count chips below still use currentIssues, so Draft doesn't get
  // nagged with premature errors — a not-yet-ready section just reads
  // "Incomplete", not an error.
  const publishReadinessIssues = validateProductSections(buildPayload("published"));
  const completedSections = new Set<ProductEditorSectionId>(
    PRODUCT_EDITOR_SECTIONS.filter((section) => !publishReadinessIssues.some((issue) => issue.section === section.id)).map((section) => section.id)
  );
  const saveState: EditorSaveState = submitting ? "saving" : saveFailed ? "failed" : hasUnsavedChanges ? "unsaved" : "saved";

  const inventoryHref = currentProductId
    ? (isBrandPortal
        ? `/brand-portal/stock?product=${encodeURIComponent(currentProductId)}${brandSlug ? `&brand=${encodeURIComponent(brandSlug)}` : ""}`
        : `/admin/low-stock?product=${encodeURIComponent(currentProductId)}`)
    : undefined;
  const mediaColorIds = colorType ? form.inventoryVariants.valueIdsByOptionType[colorType.id] ?? [] : [];

  // Recalculates the instant a different Brand is picked (Admin) or once,
  // from the locked Brand's own fields (brand-portal — the brand can't
  // change there). See lib/admin/shippingPolicy.ts for the priority rule.
  const selectedBrandPolicy: BrandPolicyFields | null = lockedBrand
    ? lockedBrandPolicy ?? null
    : brandOptions.find((b) => b.id === form.brandId) ?? null;
  const resolvedShippingPolicy = resolveShippingPolicy(selectedBrandPolicy);

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
        activeSection={activeSection}
        issues={currentIssues}
        completed={completedSections}
        onNavigateStep={navigateToSection}
        onSaveDraft={() => submit("draft")}
        onPublish={() => submit("published")}
        onBack={handleCancel}
      />
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(420px,1.08fr)_minmax(390px,0.92fr)] 2xl:grid-cols-[minmax(520px,1.05fr)_minmax(500px,0.95fr)] xl:items-start">
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
        <FormSection sectionId="basic" sectionRef={(node) => { sectionRefs.current.basic = node ?? undefined; }} number="01" title="Basic Information" description="Define ownership, audience, taxonomy, Collection, and the immutable product identity." complete={completedSections.has("basic")} issues={currentIssues.filter((issue) => issue.section === "basic")}>
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
        <FormSection sectionId="pricing" sectionRef={(node) => { sectionRefs.current.pricing = node ?? undefined; }} number="02" title="Pricing" description="Set the permanent base price. A discount is a % plus an optional end time — it reverts to the base price automatically the instant it ends, no action needed." complete={completedSections.has("pricing")} issues={currentIssues.filter((issue) => issue.section === "pricing")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <PriceField
              id="product-price"
              label="Price"
              required
              value={form.price}
              onChange={(v) => set("price", v)}
            />
            <PercentField
              id="product-discount-percent"
              label="Discount %"
              value={form.discountPercent}
              onChange={(v) => set("discountPercent", v)}
            />
            <div>
              <label htmlFor="product-discount-ends-at" className="text-[12.5px] font-medium text-ink-soft/70">
                Discount ends
              </label>
              <input
                id="product-discount-ends-at"
                type="datetime-local"
                value={form.discountEndsAt}
                onChange={(e) => set("discountEndsAt", e.target.value)}
                className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DISCOUNT_DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      set(
                        "discountEndsAt",
                        preset.hours ? toDatetimeLocalValue(new Date(Date.now() + preset.hours * 3_600_000).toISOString()) : ""
                      )
                    }
                    className="rounded-full border border-stone-150 px-2.5 py-1 text-[11px] font-medium text-ink-soft/70 transition hover:border-ink/30 hover:text-ink"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {(() => {
            const price = Number(form.price);
            const discountPercent = form.discountPercent ? Number(form.discountPercent) : undefined;
            const discountEndsAt = form.discountEndsAt ? new Date(form.discountEndsAt).toISOString() : undefined;
            const active = price > 0 && isDiscountActive(discountPercent, discountEndsAt);
            const effectivePrice = active ? getEffectivePrice(price, discountPercent, discountEndsAt) : price;
            const savings = active ? price - effectivePrice : 0;
            return (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-stone-150 bg-stone-50 px-4 py-3">
                <div className="flex items-baseline gap-2.5">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft/45">Price preview</p>
                    <p className="mt-1 text-[18px] font-bold text-ink">{price > 0 ? `${effectivePrice.toLocaleString()} EGP` : "— EGP"}</p>
                  </div>
                  {active && <p className="text-[13px] text-ink-soft/45 line-through">{price.toLocaleString()} EGP</p>}
                </div>
                {active && <p className="text-[12.5px] font-semibold text-emerald-700">Save {savings.toLocaleString()} EGP</p>}
              </div>
            );
          })()}
          <p className="mt-2 text-[11.5px] text-ink-soft/50">Leave Discount % empty for no discount. Leave "Discount ends" empty for a discount that runs indefinitely. Variant Price remains the final price for that variant (the discount % still applies on top of it).</p>
        </FormSection>

        {/* 03 — Variants (Inventory) — comes before Media because Media's
            Color images depend on the Colors defined here. */}
        <FormSection sectionId="inventory" sectionRef={(node) => { sectionRefs.current.inventory = node ?? undefined; }} number="03" title="Inventory & Variants" description="Choose option values, define the combinations that exist, and manage inventory safely." complete={completedSections.has("inventory")} issues={currentIssues.filter((issue) => issue.section === "inventory")}>
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
            inventoryHref={inventoryHref}
          /></div>
          <CustomOptionManager optionTypes={optionTypes} optionValues={optionValues} apiBasePath={optionsApiBase} brandId={form.brandId} brandSlug={brandSlug} onChanged={loadOptions} />
        </FormSection>

        {/* 04 — Media */}
        <FormSection sectionId="media" sectionRef={(node) => { sectionRefs.current.media = node ?? undefined; }} number="04" title="Media" description="Manage the cover and the ordered product-detail media collection." complete={completedSections.has("media")} issues={currentIssues.filter((issue) => issue.section === "media")}>
          <p className="mb-3 text-[12px] text-ink-soft/55">
            One place for every product image, in one freely reorderable order. Cover always leads the gallery
            {mediaColorIds.length >= 2 ? "; each color needs its own image (this product has multiple colors)" : ""} — drag Gallery and Color images into whatever order the storefront should show them.
          </p>
          <div id="product-media" tabIndex={-1}>
            <MediaGallery
              folderId={uploadFolderId}
              coverUrl={form.image}
              onCoverChange={(url) => set("image", url)}
              images={form.images}
              onImagesChange={(urls) => set("images", urls)}
              colorImages={form.inventoryVariants.colorImages}
              onColorImagesChange={(next) => set("inventoryVariants", { ...form.inventoryVariants, colorImages: next })}
              colors={mediaColorIds.length >= 2 ? mediaColorIds.map((id) => {
                const v = optionValues.find((option) => option.id === id);
                return { id, label: v?.label ?? "—", swatchType: v?.swatchType, primaryColor: v?.primaryColor, secondaryColor: v?.secondaryColor };
              }) : []}
              disabled={!form.brandId}
            />
          </div>
        </FormSection>

        {/* 05 — Product Details */}
        <FormSection sectionId="details" sectionRef={(node) => { sectionRefs.current.details = node ?? undefined; }} number="05" title="Product Details" description="Add descriptive, material, care, fit, and policy information for this product." complete={completedSections.has("details")} issues={currentIssues.filter((issue) => issue.section === "details")}>
          <DescriptionEditor
            id="product-description"
            value={form.description}
            onChange={(v) => set("description", v)}
            disabled={!form.brandId}
          />

          <div className="mt-5">
            <HighlightsListBuilder value={form.details} onChange={(v) => set("details", v)} disabled={!form.brandId} />
          </div>

          <div className="mt-5">
            <CareInstructionsPicker value={form.careInstructions} onChange={(v) => set("careInstructions", v)} disabled={!form.brandId} />
          </div>

          <div className="mt-5">
            <MaterialsComposer value={form.materials} onChange={(v) => set("materials", v)} disabled={!form.brandId} />
          </div>

          <div className="mt-5 max-w-sm">
            <FitSelect
              value={form.fit}
              onChange={(v) => set("fit", v)}
              taxonomyNodes={taxonomyNodes}
              productTypeId={form.productTypeId}
              disabled={!form.brandId}
            />
          </div>

          <div className="mt-5 rounded-md border border-stone-150 bg-stone-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-ink-soft/70">Shipping &amp; Returns</span>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${resolvedShippingPolicy.source === "brand" ? "bg-emerald-100 text-emerald-800" : "bg-stone-150 text-ink-soft/60"}`}>
                {resolvedShippingPolicy.source === "brand" ? "Brand policy" : "Marketplace default"}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-ink-soft/75">{resolvedShippingPolicy.text}</p>
            <p className="mt-1.5 text-[11px] text-ink-soft/45">
              Resolved automatically from the selected Brand&apos;s policy, falling back to Mahaly&apos;s marketplace default. Set a Brand&apos;s own policy from its Brand settings.
            </p>
          </div>
        </FormSection>

        {/* 06 — Visibility (admin-only: status/scheduling/featured are
            editorial calls the brand portal never makes directly — a
            brand-portal submission's status is always decided by the
            review flow, never typed in here) */}
        {!isBrandPortal && (
          <FormSection sectionId="visibility" sectionRef={(node) => { sectionRefs.current.visibility = node ?? undefined; }} number="06" title="Visibility" description="Use the existing publication and merchandising controls." complete={completedSections.has("visibility")} issues={currentIssues.filter((issue) => issue.section === "visibility")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                id="product-status"
                label="Status"
                required
                value={form.status}
                onChange={(v) => set("status", v as ProductStatus)}
                options={[
                  // "Draft" is no longer offered as a choice here — use the
                  // "Save as Draft" action below instead. Still shown if
                  // that's this product's current status, so an existing
                  // Draft product doesn't render an unselected dropdown.
                  ...(form.status === "draft" ? [{ value: "draft", label: "Draft" }] : []),
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

            <p className="mt-4 text-[11px] text-ink-soft/45">
              A product is automatically marked <strong>New</strong> — badged on its cover image and included in New Arrivals — for the first 20 days after it&apos;s Published, then removed from both automatically. There&apos;s nothing to set by hand. Featured Product is managed by Admin from the products list, not here.
            </p>
          </FormSection>
        )}

        <ProductEditorBottomBar dirty={hasUnsavedChanges} submitting={submitting} isBrandPortal={isBrandPortal} onSaveDraft={() => submit("draft")} onPublish={() => submit("published")} />
      </div>

      <div ref={previewRef} className="min-w-0 xl:sticky xl:top-[158px] xl:h-[calc(100vh-174px)]">
        <ProductLivePreview
          form={{
            name: form.name,
            brandName: form.brandName,
            audience: form.audience,
            productTypeId: form.productTypeId,
            collectionName: "",
            price: form.price,
            discountPercent: form.discountPercent,
            discountEndsAt: form.discountEndsAt,
            image: form.image,
            images: form.images,
            inventoryVariants: form.inventoryVariants,
            description: form.description,
            details: form.details,
            careInstructions: form.careInstructions,
            materials: form.materials,
            fit: form.fit,
            shippingReturns: resolvedShippingPolicy.text,
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
  );
}

function FormSection({
  sectionId,
  sectionRef,
  number,
  title,
  description,
  complete,
  issues,
  children,
}: {
  sectionId: ProductEditorSectionId;
  sectionRef: (node: HTMLElement | null) => void;
  number: string;
  title: string;
  description: string;
  complete: boolean;
  issues: ProductValidationIssue[];
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
        <IssueBadge issues={issues} complete={complete} />
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// The "N issue(s)" badge — a "!" mark next to a count of only the
// *required* things still missing from this section (optional issues, if
// any are ever added, don't inflate the number). Hovering/focusing the "!"
// shows exactly which fields are missing, so the merchant never has to
// hunt for what's wrong — no separate error list to read, just a tooltip.
function IssueBadge({ issues, complete }: { issues: ProductValidationIssue[]; complete: boolean }) {
  const required = issues.filter((issue) => !issue.optional);

  if (required.length === 0) {
    return (
      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${complete ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-ink-soft/55"}`}>
        {complete ? "Complete" : "Incomplete"}
      </span>
    );
  }

  return (
    <span tabIndex={0} className="group relative inline-flex cursor-help items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-300">
      <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold leading-none text-white">!</span>
      {required.length} issue{required.length === 1 ? "" : "s"}
      <div
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 hidden w-64 rounded-md border border-stone-200 bg-white p-2.5 text-left normal-case text-ink shadow-lg group-hover:block group-focus-visible:block"
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-soft/50">What&apos;s missing</p>
        <ul className="space-y-1">
          {required.map((issue, i) => (
            <li key={i} className="flex gap-1.5 text-[11.5px] font-normal leading-snug text-ink">
              <span className="text-red-600">•</span>
              {issue.message}
            </li>
          ))}
        </ul>
      </div>
    </span>
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

// Just a labeled 0-99 percent input — the "Discount %" call site writes
// straight to form.discountPercent, no derived value to keep in sync here.
function PercentField({
  id,
  label,
  value,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <div className="mt-1.5 flex items-center rounded-md border border-stone-150 bg-white focus-within:border-ink/30">
        <input
          id={id}
          type="number"
          min={0}
          max={99}
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent px-3.5 py-2.5 text-[14px] text-ink outline-none"
        />
        <span className="border-l border-stone-150 px-3 py-2.5 text-[13px] font-semibold text-ink-soft/60">%</span>
      </div>
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
  hint,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-ink-soft/70">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </span>
        {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
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
