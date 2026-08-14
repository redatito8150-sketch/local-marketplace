"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpRight, CalendarClock, Check, CircleAlert, Eye, PackageCheck, Store, Warehouse } from "lucide-react";
import type { Audience, ProductMaterialEntry, ProductRecord, ProductStatus, ProductTaxonomyContent, ProductVariant, TaxonomyNode } from "@/types";
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
  type VariantRow,
} from "@/components/admin/InventoryVariantsSection";
import type { NewColorInput } from "@/components/admin/ColorOptionPicker";
import CustomOptionManager from "@/components/admin/CustomOptionManager";
import DescriptionEditor from "@/components/admin/DescriptionEditor";
import HighlightsListBuilder from "@/components/admin/HighlightsListBuilder";
import CareInstructionsPicker from "@/components/admin/CareInstructionsPicker";
import MaterialsComposer from "@/components/admin/MaterialsComposer";
import FitSelect from "@/components/admin/FitSelect";
import { resolveShippingPolicy, type BrandPolicyFields } from "@/lib/admin/shippingPolicy";
import { DRAFT_EXPIRY_DAYS } from "@/lib/admin/expireDrafts";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import {
  PRODUCT_EDITOR_SECTIONS,
  ProductEditorBottomBar,
  ProductEditorHeader,
  ProductErrorSummary,
  ProductWizardBottomBar,
  UnsavedChangesDialog,
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
  // different API base path, and shows a single "Publish Product" action
  // (no separate Draft/Publish split) — the write goes live immediately
  // per the Instant-Publish model (see CLAUDE.md); the label used to say
  // "Submit for Review", which actively contradicted that and implied a
  // pre-approval gate that was deliberately removed.
  lockedBrand?: { id: string; name: string };
  // Brand-portal mode: passed directly since there's no brandOptions list
  // to look it up from (the brand is locked). Admin mode instead derives
  // this live from brandOptions as the Brand dropdown changes.
  isPartnerBrand?: boolean;
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

// The editor's Matrix rows are keyed by a flat optionValueIds array; the
// wire/DB shape (ProductVariant, from both an initial ProductRecord load
// and a save response's `data.variants`) carries the richer optionValues
// object array instead. Every place that feeds server variant data into
// form state must go through this — assigning ProductVariant[] straight
// into VariantRow[] type-checks fine (fetch responses are untyped `any`)
// but leaves every row's optionValueIds undefined, which throws the next
// time the Matrix renders (buildComboKey() calls .sort() on it) — that's
// what the post-save router.refresh() re-render was hitting, surfacing as
// the brand-portal error boundary right after a successful Publish.
function variantsToRows(variants: ProductVariant[]): VariantRow[] {
  return variants.map((v) => ({
    id: v.id,
    optionValueIds: v.optionValues.map((s) => s.optionValueId),
    sku: v.sku,
    quantity: v.quantity,
    variantPrice: v.variantPrice,
    variantDiscountPercent: v.variantDiscountPercent,
    lowStockThresholdOverride: v.lowStockThresholdOverride,
    sellingStatus: v.sellingStatus,
    updatedAt: v.updatedAt,
  }));
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
    variants: variantsToRows(product?.variants ?? []),
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
  isPartnerBrand: lockedIsPartnerBrand,
  lockedBrandPolicy,
  brandSlug,
  apiBasePath = "/api/admin/products",
  cancelHref = "/admin/products",
}: ProductFormProps) {
  const router = useRouter();
  const isBrandPortal = Boolean(lockedBrand);
  const isCreateExperience = mode === "create";
  const isStandaloneEditor = isBrandPortal && isCreateExperience;
  const optionsApiBase = isBrandPortal ? "/api/brand-portal" : "/api/admin";
  const brandQuery = isBrandPortal && brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : "";

  // Save now keeps the admin on this page instead of redirecting to the
  // list, so a first-time create needs to remember the id it gets back and
  // switch to PATCHing from then on instead of POSTing a duplicate.
  const [currentMode, setCurrentMode] = useState(mode);
  const [currentProductId, setCurrentProductId] = useState(productId);

  // Client-side only draft cache — never sent to the server, so it carries
  // none of the "incomplete data going live" risk a real autosave-to-DB
  // would for brand-portal's instant-publish model. Restores an in-progress
  // new product if the tab reloads or crashes; saved on every step
  // navigation so moving between sections never quietly loses work. Keyed
  // off currentMode (not the static mode prop) so it stops applying the
  // instant a real save succeeds and flips create -> edit — from then on
  // this always reflects the real saved DB state, never a stale local
  // copy. One slot per brand (not per random session id) so a reload can
  // actually find what an earlier tab cached.
  const localDraftKey = currentMode === "create" ? `mahaly:product-draft:${lockedBrand?.id ?? "admin"}` : null;
  function persistLocalDraft(nextForm: FormState) {
    if (!localDraftKey) return;
    try {
      window.localStorage.setItem(localDraftKey, JSON.stringify(nextForm));
    } catch {
      // Storage full/unavailable — losing the local safety-net cache isn't
      // worth surfacing an error over.
    }
  }
  function clearLocalDraft() {
    if (!localDraftKey) return;
    try {
      window.localStorage.removeItem(localDraftKey);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  const [form, setForm] = useState<FormState>(() => toFormState(initial, lockedBrand));
  const [submittingStatus, setSubmittingStatus] = useState<ProductStatus | null>(null);
  const [error, setError] = useState("");
  const [submittedIssues, setSubmittedIssues] = useState<ProductValidationIssue[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | undefined>();
  const [activeSection, setActiveSection] = useState<ProductEditorSectionId>("basic");
  // Closed by default — the live preview is opt-in via the floating eye
  // button rather than always claiming half the screen.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false);

  const [optionTypes, setOptionTypes] = useState<OptionTypeOption[]>([]);
  const [optionValues, setOptionValues] = useState<OptionValueOption[]>([]);
  const [optionLoadState, setOptionLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [optionLoadError, setOptionLoadError] = useState("");
  const colorType = optionTypes.find((t) => t.key === "color");
  const sizeType = optionTypes.find((t) => t.key === "size");

  const saveOperationKey = useRef(crypto.randomUUID());
  const [savedSnapshot, setSavedSnapshot] = useState(form);

  // Restoring the local draft cache after mount (not in the useState
  // initializer above) so the client's first render still matches the
  // server-rendered HTML — localStorage isn't available during SSR, and
  // reading it during the initial render would cause a hydration mismatch.
  // Same one-time-hydration pattern already used by CartContext/WishlistContext.
  useEffect(() => {
    if (!localDraftKey) return;
    try {
      const cached = window.localStorage.getItem(localDraftKey);
      if (cached) {
        const parsed = JSON.parse(cached) as FormState;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm(parsed);
        setSavedSnapshot(parsed);
      }
    } catch {
      // Corrupt/unreadable cache — ignore and keep the fresh-form default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time hydration on mount only
  }, []);

  useEffect(() => {
    if (!isCreateExperience) return;
    if (!window.matchMedia("(min-width: 1280px)").matches) return;
    const frame = requestAnimationFrame(() => setPreviewOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [isCreateExperience]);

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
    if (isCreateExperience) return;
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
  }, [isCreateExperience]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadOptions = async () => {
    if (!form.brandId) {
      setOptionTypes([]);
      setOptionValues([]);
      setOptionLoadState("idle");
      setOptionLoadError("");
      return;
    }
    setOptionLoadState("loading");
    setOptionLoadError("");
    try {
      const url =
        optionsApiBase === "/api/admin"
          ? `/api/admin/product-options?brandId=${encodeURIComponent(form.brandId)}`
          : "/api/brand-portal/product-options";
      const res = await fetch(`${url}${brandQuery}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "We couldn't load Colors and Sizes.");
      setOptionTypes(data.optionTypes ?? []);
      setOptionValues(data.optionValues ?? []);
      setOptionLoadState("ready");
    } catch (loadError) {
      setOptionTypes([]);
      setOptionValues([]);
      setOptionLoadState("error");
      setOptionLoadError(loadError instanceof Error ? loadError.message : "We couldn't load Colors and Sizes.");
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
      sortOrder: data.sortOrder,
      swatchType: data.swatchType,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      brandId: data.brandId,
    };
    setOptionValues((prev) => [...prev, created]);
    return created;
  };

  // A custom Size's up/down arrow in the Matrix (VariantTable) — the
  // actual zone/never-between-recognized-sizes math (lib/inventory/
  // sizeOrder.ts's reorderCustomSize) runs server-side; refetching here
  // rather than recomputing locally keeps this one source of truth.
  const handleReorderOptionValue = async (optionValueId: string, direction: "up" | "down") => {
    const res = await fetch(`${optionsApiBase}/product-options/values/${optionValueId}${brandQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", direction }),
    });
    if (res.ok) await loadOptions();
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

  // Computed here (not inline in buildPayload, and not further down where
  // it's also read for InventoryVariantsSection) so both usages share one
  // value — the server independently re-derives and enforces this from
  // the real brand row (never trusts this client computation), but the
  // client-side completeness badge/publish-readiness check below needs
  // the same signal to avoid showing a stock-related "issue" that a
  // partner brand can never actually resolve from this form.
  const isPartnerBrand = lockedBrand
    ? Boolean(lockedIsPartnerBrand)
    : Boolean(brandOptions.find((b) => b.id === form.brandId)?.isMahalyPartner);

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
    isPartnerBrand,
  });

  const submit = async (targetStatus: ProductStatus): Promise<boolean> => {
    const payload = buildPayload(targetStatus);
    const issues = validateProductSections(payload);
    const validationError = validateProductInput(payload);
    if (validationError) {
      setError(validationError);
      setSubmittedIssues(issues);
      const first = issues[0];
      if (first) requestAnimationFrame(() => navigateToIssue(first));
      return false;
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
        return false;
      }

      // Stay on the page — a first-time create switches to editing the
      // product it just made instead of re-posting a duplicate next save.
      setCurrentProductId(data.id);
      if (currentMode === "create") setCurrentMode("edit");
      // The real save succeeded — the local safety-net cache would only
      // ever go stale from here on, so drop it.
      clearLocalDraft();
      // Server-generated variant SKUs only exist after a successful save —
      // reflect them in the now-read-only fields immediately rather than
      // waiting on a full page reload.
      const nextVariants: InventoryVariantsValue = data.variants
        ? { ...form.inventoryVariants, variants: variantsToRows(data.variants) }
        : form.inventoryVariants;
      const nextForm = { ...form, status: targetStatus, inventoryVariants: nextVariants };
      setForm(nextForm);
      saveOperationKey.current = crypto.randomUUID();
      setSavedSnapshot(nextForm);
      setLastSavedAt(new Date());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh();
      return true;
    } catch {
      setError("Something went wrong. Please try again.");
      setSaveFailed(true);
      return false;
    } finally {
      setSubmittingStatus(null);
    }
  };

  const handleCancel = () => {
    if (!hasUnsavedChanges) {
      router.push(cancelHref);
      return;
    }
    setLeaveDialogOpen(true);
  };

  const saveDraftAndLeave = async () => {
    setSavingBeforeLeave(true);
    const saved = await submit("draft");
    setSavingBeforeLeave(false);
    if (saved) router.push(cancelHref);
  };

  const submitting = submittingStatus !== null;
  // Product-level Discount % and per-variant Variant Discount % are
  // mutually exclusive — a product is either discounted as a whole or
  // per-color, never both at once (avoids a variant's effective price
  // silently stacking two separate discounts).
  const hasVariantDiscount = form.inventoryVariants.variants.some(
    (v) => v.variantDiscountPercent != null && v.variantDiscountPercent > 0
  );
  const productDiscountPercent = form.discountPercent ? Number(form.discountPercent) : undefined;
  const currentIssues = validateProductSections(buildPayload(form.status));
  const draftReadinessIssues = validateProductSections(buildPayload("draft"));
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
  // Once a product leaves Draft there's no path back to it — no button
  // anywhere ever re-submits "draft" except Save as Draft itself, which
  // this hides — so the status it had when this edit session started is
  // enough to know whether it's ever been published: "draft" means it
  // hasn't; anything else (published, archived, or a legacy pending
  // status) means it has, or was archived directly without publishing
  // first — a rare initial choice treated the same way rather than
  // reopening Draft for it.
  const hasLeftDraft = currentMode === "edit" && initial?.status !== "draft";
  const completedSections = new Set<ProductEditorSectionId>(
    PRODUCT_EDITOR_SECTIONS.filter((section) =>
      section.id === "visibility"
        ? publishReadinessIssues.length === 0
        : !publishReadinessIssues.some((issue) => issue.section === section.id)
    ).map((section) => section.id)
  );
  const saveState: EditorSaveState = submitting ? "saving" : saveFailed ? "failed" : hasUnsavedChanges ? "unsaved" : "saved";

  const inventoryHref = currentProductId
    ? (isBrandPortal
        ? `/brand-portal/stock?product=${encodeURIComponent(currentProductId)}${brandSlug ? `&brand=${encodeURIComponent(brandSlug)}` : ""}`
        : `/admin/low-stock?product=${encodeURIComponent(currentProductId)}`)
    : undefined;
  const mediaColorIds = colorType ? form.inventoryVariants.valueIdsByOptionType[colorType.id] ?? [] : [];
  const activeStepIndex = Math.max(0, PRODUCT_EDITOR_SECTIONS.findIndex((section) => section.id === activeSection));

  // Recalculates the instant a different Brand is picked (Admin) or once,
  // from the locked Brand's own fields (brand-portal — the brand can't
  // change there). See lib/admin/shippingPolicy.ts for the priority rule.
  const selectedBrandPolicy: BrandPolicyFields | null = lockedBrand
    ? lockedBrandPolicy ?? null
    : brandOptions.find((b) => b.id === form.brandId) ?? null;
  const resolvedShippingPolicy = resolveShippingPolicy(selectedBrandPolicy);

  function navigateToSection(sectionId: ProductEditorSectionId) {
    // Cache progress locally every time the editor moves to another
    // section — a lightweight safety net, not a real save (nothing is sent
    // to the server here), so an in-progress product is never lost to a
    // closed tab or crash between real Publish/Save-as-Draft clicks.
    persistLocalDraft(form);
    if (isCreateExperience) {
      setActiveSection(sectionId);
      window.setTimeout(() => {
        const target = sectionRefs.current[sectionId];
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        target?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    const target = sectionRefs.current[sectionId];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }

  function navigateToIssue(issue: ProductValidationIssue) {
    navigateToSection(issue.section);
    window.setTimeout(() => document.getElementById(issue.fieldId)?.focus(), 350);
  }

  function moveWizard(direction: -1 | 1) {
    const next = PRODUCT_EDITOR_SECTIONS[activeStepIndex + direction];
    if (next) navigateToSection(next.id);
  }

  return (
    <div className={`min-w-0 ${isStandaloneEditor ? "mx-auto max-w-[1760px] px-4 pb-8 sm:px-6 lg:px-8" : ""}`}>
      <ProductEditorHeader
        title={form.name.trim() || (currentMode === "create" ? "New Product" : "Edit Product")}
        status={form.status}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        submitting={submitting}
        activeSection={activeSection}
        issues={currentIssues}
        completed={completedSections}
        onNavigateStep={navigateToSection}
        onSaveDraft={() => submit("draft")}
        onArchive={() => submit("archived")}
        canArchive={publishReadinessIssues.length === 0}
        onPublish={() => submit("published")}
        onBack={handleCancel}
        standalone={isStandaloneEditor}
        createExperience={isCreateExperience}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((value) => !value)}
        hasPersistedProduct={Boolean(currentProductId)}
        fulfillmentLabel={isPartnerBrand ? "Zakhnook fulfilled" : "Brand fulfilled"}
        showFulfillmentBadge={isCreateExperience && activeSection !== "basic"}
      />
      {(!isCreateExperience || activeSection === "basic") ? <div className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3.5 ${isPartnerBrand ? "border-[#e4cfc0] bg-[#fff7f1]" : "border-[#d9ddd4] bg-[#f5f7f1]"}`}>
        <div className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg ${isPartnerBrand ? "bg-[#C85956]/10 text-[#C85956]" : "bg-[#5d6c55]/10 text-[#5d6c55]"}`}>
          {isPartnerBrand ? <Warehouse className="h-4 w-4" /> : <Store className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-[#332c27]">{isPartnerBrand ? "Zakhnook fulfilled" : "Brand fulfilled"}</p>
          <p className="mt-1 max-w-[78ch] text-[11.5px] leading-5 text-[#75685f]">
            {isPartnerBrand
              ? "Create the product and its Variants now. It stays hidden from shoppers until Zakhnook receives the first shipment, then becomes available automatically."
              : "Add the quantity available for each Variant. Once the required product information is complete, publishing makes it available to shoppers immediately."}
          </p>
        </div>
      </div> : null}
      <div
        className={`grid min-w-0 grid-cols-1 gap-6 xl:items-start ${
          previewOpen ? "xl:grid-cols-[minmax(460px,1.08fr)_minmax(400px,0.92fr)] 2xl:grid-cols-[minmax(560px,1.08fr)_minmax(500px,0.92fr)]" : ""
        }`}
      >
        <div id="product-editor-content" className="min-w-0 space-y-6">
          <ProductErrorSummary issues={submittedIssues} onNavigate={navigateToIssue} />

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}

        {/* 01 — Basic Information — field order: Product Name, Brand,
            Audience, Main Category / Product Group / Product Type,
            Collection, Product SKU. */}
        {(!isCreateExperience || activeSection === "basic") ? <FormSection sectionId="basic" sectionRef={(node) => { sectionRefs.current.basic = node ?? undefined; }} number="01" title="Product basics" description="Add the information shoppers use to recognize and find this product." complete={completedSections.has("basic")} issues={currentIssues.filter((issue) => issue.section === "basic")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField id="product-name" label="Product Name" required value={form.name} onChange={(v) => set("name", v)} />
            <div id="product-brand"><BrandSelect
              options={lockedBrand ? [lockedBrand] : brandOptions}
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
        </FormSection> : null}

        {/* 02 — Pricing */}
        {(!isCreateExperience || activeSection === "pricing") ? <FormSection sectionId="pricing" sectionRef={(node) => { sectionRefs.current.pricing = node ?? undefined; }} number="02" title="Price" description="Set the regular price and add an optional time-limited discount." complete={completedSections.has("pricing")} issues={currentIssues.filter((issue) => issue.section === "pricing")}>
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
              disabled={hasVariantDiscount}
              lockMessage="Locked because a per-variant discount is set below — remove it first to discount the whole product instead."
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
          <p className="mt-2 text-[11.5px] text-ink-soft/50">Leave Discount % empty for no discount. Leave &quot;Discount ends&quot; empty for a discount that runs indefinitely. Variant Price remains the final price for that variant (the discount % still applies on top of it).</p>
        </FormSection> : null}

        {/* 03 — Variants (Inventory) — comes before Media because Media's
            Color images depend on the Colors defined here. */}
        {(!isCreateExperience || activeSection === "inventory") ? <FormSection sectionId="inventory" sectionRef={(node) => { sectionRefs.current.inventory = node ?? undefined; }} number="03" title="Colors, sizes & stock" description={isPartnerBrand ? "Create every sellable combination. Stock is added after Zakhnook confirms a shipment." : "Create every sellable combination and add the quantity currently available."} complete={completedSections.has("inventory")} issues={currentIssues.filter((issue) => issue.section === "inventory")}>
          <div id="inventory-variants" tabIndex={-1}><InventoryVariantsSection
            value={form.inventoryVariants}
            onChange={(next) => set("inventoryVariants", next)}
            availableOptionTypes={optionTypes}
            availableOptionValues={optionValues}
            onCreateOptionType={handleCreateOptionType}
            onCreateOptionValue={handleCreateOptionValue}
            onReorderOptionValue={handleReorderOptionValue}
            currency="EGP"
            productSkuPreview={form.sku || "(generated after first save)"}
            productPrice={Number(form.price) || 0}
            productDiscountPercent={productDiscountPercent}
            disabled={!form.brandId}
            taxonomyNodes={taxonomyNodes}
            productTypeId={form.productTypeId}
            inventoryHref={inventoryHref}
            isPartnerBrand={isPartnerBrand}
            optionLoadState={optionLoadState}
            optionLoadError={optionLoadError}
            onRetryOptions={loadOptions}
          /></div>
          <CustomOptionManager optionTypes={optionTypes} optionValues={optionValues} apiBasePath={optionsApiBase} brandId={form.brandId} brandSlug={brandSlug} onChanged={loadOptions} />
        </FormSection> : null}

        {/* 04 — Media */}
        {(!isCreateExperience || activeSection === "media") ? <FormSection sectionId="media" sectionRef={(node) => { sectionRefs.current.media = node ?? undefined; }} number="04" title="Photos" description="Choose the cover and arrange the images shoppers will see on the product page." complete={completedSections.has("media")} issues={currentIssues.filter((issue) => issue.section === "media")}>
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
        </FormSection> : null}

        {/* 05 — Product Details */}
        {(!isCreateExperience || activeSection === "details") ? <FormSection sectionId="details" sectionRef={(node) => { sectionRefs.current.details = node ?? undefined; }} number="05" title="Details & policies" description="Help shoppers understand the product, its fit, materials, care, shipping and returns." complete={completedSections.has("details")} issues={currentIssues.filter((issue) => issue.section === "details")}>
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
              Resolved automatically from the selected Brand&apos;s policy, falling back to Zakhnook&apos;s marketplace default. Set a Brand&apos;s own policy from its Brand settings.
            </p>
          </div>
        </FormSection> : null}

        {/* 06 — Visibility, available to both admin and brand-portal. Status
            itself is set by the Save as Draft / Archive / Publish Product
            actions in the header/bottom bar (not a dropdown here — a
            dropdown value with no dedicated "commit this" action was
            previously dead: Publish Product always forced "published"
            regardless of what was selected here). Archive and Publish both
            require the full product info below to be complete; Draft never
            does — that's the entire point of a draft. */}
        {(!isCreateExperience || activeSection === "visibility") ? <FormSection sectionId="visibility" sectionRef={(node) => { sectionRefs.current.visibility = node ?? undefined; }} number="06" title="Review & publish" description="Review readiness and choose whether to publish now or keep the product hidden." complete={completedSections.has("visibility")} issues={currentIssues.filter((issue) => issue.section === "visibility")}>
          <div className={`rounded-[16px] border p-4 sm:p-5 ${publishReadinessIssues.length ? "border-[#ead3bb] bg-[#fffaf3]" : "border-[#cfe0d0] bg-[#f7fbf5]"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${publishReadinessIssues.length ? "bg-[#e8a65c]/12 text-[#a85e24]" : "bg-emerald-100 text-emerald-700"}`}>
                  {publishReadinessIssues.length ? <CircleAlert className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-[13px] font-extrabold text-[#332c27]">{publishReadinessIssues.length ? `${publishReadinessIssues.length} required item${publishReadinessIssues.length === 1 ? "" : "s"} left` : "Ready to publish"}</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-[#75685f]">{publishReadinessIssues.length ? `Fix the items below. You can still save this as a Draft for up to ${DRAFT_EXPIRY_DAYS} days.` : "Every required section is complete. Review the storefront outcome before publishing."}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#ded4ca] bg-white px-3 text-[11px] font-bold text-[#62564e] transition-colors hover:border-[#C85956]/45 hover:text-[#C85956]"><Eye className="h-3.5 w-3.5" />Open customer preview</button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[16px] border border-[#e2dad2] bg-white">
            {PRODUCT_EDITOR_SECTIONS.filter((section) => section.id !== "visibility").map((section, index, sections) => {
              const sectionIssues = publishReadinessIssues.filter((issue) => issue.section === section.id);
              const complete = sectionIssues.length === 0;
              return (
                <div key={section.id} className={`${index < sections.length - 1 ? "border-b border-[#eee7e0]" : ""} px-4 py-3.5 sm:px-5`}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${complete ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-[#C85956]"}`}>{complete ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}</span>
                    <div className="min-w-0 flex-1"><p className="text-[12px] font-bold text-[#3b332d]">{section.label}</p><p className={`mt-0.5 text-[10.5px] ${complete ? "text-emerald-700" : "text-[#8b5d50]"}`}>{complete ? "Complete" : `${sectionIssues.length} item${sectionIssues.length === 1 ? "" : "s"} to fix`}</p></div>
                    <button type="button" onClick={() => sectionIssues[0] ? navigateToIssue(sectionIssues[0]) : navigateToSection(section.id)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold text-[#7b6d63] transition-colors hover:bg-[#f5eee8] hover:text-[#C85956]">{complete ? "Review" : "Fix now"}<ArrowUpRight className="h-3 w-3" /></button>
                  </div>
                  {sectionIssues.length > 0 ? <div className="ml-9 mt-2 flex flex-wrap gap-1.5">{sectionIssues.map((issue, issueIndex) => <button key={`${issue.fieldId}-${issueIndex}`} type="button" onClick={() => navigateToIssue(issue)} className="rounded-md bg-[#fff1ed] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-[#9b4b48] transition-colors hover:bg-[#f9dfd8]">{issue.message}</button>)}</div> : null}
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <div><TextField label="Publish Date (optional)" type="datetime-local" value={form.publishDate} onChange={(v) => set("publishDate", v)} /><p className="mt-2 text-[10.5px] leading-4 text-[#8c7f75]">Leave empty to publish as soon as all storefront gates are satisfied.</p></div>
            <div className={`rounded-[14px] border px-4 py-4 ${isPartnerBrand ? "border-[#e6d1c2] bg-[#fff7f1]" : "border-[#d9e0d4] bg-[#f6f8f3]"}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isPartnerBrand ? "bg-[#C85956]/10 text-[#C85956]" : "bg-[#5d6c55]/10 text-[#5d6c55]"}`}>{form.publishDate ? <CalendarClock className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}</div>
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#8c7f75]">Storefront state after publish</p><p className="mt-1.5 text-[13px] font-extrabold text-[#332c27]">{form.publishDate ? "Scheduled listing" : isPartnerBrand ? "Hidden until warehouse receipt" : "Visible to shoppers immediately"}</p><p className="mt-1 text-[11.5px] leading-5 text-[#75685f]">{form.publishDate ? `The listing waits until ${new Date(form.publishDate).toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })}. ${isPartnerBrand ? "It will still require received Zakhnook stock." : "It then becomes purchasable if stock is available."}` : isPartnerBrand ? "Publishing prepares the listing. It becomes visible only after Zakhnook receives the first shipment and an active Variant has available stock." : "The product enters the storefront and New Arrivals after publishing because your brand owns fulfillment and has sellable opening stock."}</p></div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10.5px] leading-4 text-ink-soft/45">Keep it archived if you want a complete listing to remain hidden. Published products are included in New Arrivals for their first 20 days; featured placement remains Admin-managed.</p>
        </FormSection> : null}

        {isCreateExperience ? (
          <ProductWizardBottomBar
            stepIndex={activeStepIndex}
            stepCount={PRODUCT_EDITOR_SECTIONS.length}
            submitting={submitting}
            canPublish={publishReadinessIssues.length === 0}
            isPartnerBrand={isPartnerBrand}
            hasPersistedProduct={Boolean(currentProductId)}
            onPrevious={() => moveWizard(-1)}
            onNext={() => moveWizard(1)}
            onSaveDraft={() => submit("draft")}
            onArchive={() => submit("archived")}
            onPublish={() => submit("published")}
          />
        ) : (
          <ProductEditorBottomBar
            dirty={hasUnsavedChanges}
            submitting={submitting}
            onSaveDraft={() => submit("draft")}
            onArchive={() => submit("archived")}
            canArchive={publishReadinessIssues.length === 0}
            onPublish={() => submit("published")}
            showDraft={!hasLeftDraft}
            publishLabel={hasLeftDraft ? "Update" : "Publish Product"}
          />
        )}
      </div>

      {previewOpen && (
        <div
          ref={previewRef}
          className="fixed inset-0 z-50 min-w-0 bg-[#FAF8F4] p-3 sm:p-6 xl:sticky xl:inset-auto xl:z-auto xl:h-[calc(100vh-190px)] xl:bg-transparent xl:p-0 xl:top-[174px]"
        >
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
            onClose={() => setPreviewOpen(false)}
          />
        </div>
      )}
      </div>

      <UnsavedChangesDialog
        open={leaveDialogOpen}
        saving={savingBeforeLeave}
        canSaveDraft={draftReadinessIssues.length === 0}
        onStay={() => setLeaveDialogOpen(false)}
        onLeave={() => { clearLocalDraft(); router.push(cancelHref); }}
        onSaveAndLeave={() => { void saveDraftAndLeave(); }}
      />

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
  disabled,
  lockMessage,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  lockMessage?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <div className={`mt-1.5 flex items-center rounded-md border border-stone-150 bg-white focus-within:border-ink/30 ${disabled ? "opacity-50" : ""}`}>
        <input
          id={id}
          type="number"
          min={0}
          max={99}
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          className="w-full bg-transparent px-3.5 py-2.5 text-[14px] text-ink outline-none disabled:cursor-not-allowed"
        />
        <span className="border-l border-stone-150 px-3 py-2.5 text-[13px] font-semibold text-ink-soft/60">%</span>
      </div>
      {disabled && lockMessage && (
        <span className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          {lockMessage}
        </span>
      )}
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
