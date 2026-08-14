"use client";

import { AlertCircle, Archive, ArrowLeft, ArrowRight, Check, ChevronLeft, Clock3, Eye, EyeOff, Loader2, Save } from "lucide-react";
import type { ProductStatus } from "@/types";
import type { ProductEditorSectionId, ProductValidationIssue } from "@/lib/admin/productValidation";

export const PRODUCT_EDITOR_SECTIONS: { id: ProductEditorSectionId; number: string; label: string }[] = [
  { id: "basic", number: "01", label: "Basic Information" },
  { id: "pricing", number: "02", label: "Pricing" },
  { id: "inventory", number: "03", label: "Inventory & Variants" },
  { id: "media", number: "04", label: "Media" },
  { id: "details", number: "05", label: "Product Details" },
  { id: "visibility", number: "06", label: "Visibility" },
];

// Display-only order/labels for the horizontal header stepper — a
// navigation aid, not a change to the underlying sections. Each entry
// still targets a real ProductEditorSectionId (used by PRODUCT_EDITOR_SECTIONS
// above for completion/validation tracking), so clicking a step scrolls to
// and reflects the state of an actual section. "Shipping" has no section
// of its own yet (shipping content currently lives inside Product
// Details), so it targets "details" too — purely a navigation label, not
// a new section.
export const PRODUCT_EDITOR_STEPS: { id: ProductEditorSectionId; number: string; label: string }[] = [
  { id: "basic", number: "1", label: "Product basics" },
  { id: "pricing", number: "2", label: "Price" },
  { id: "inventory", number: "3", label: "Colors, sizes & stock" },
  { id: "media", number: "4", label: "Photos" },
  { id: "details", number: "5", label: "Details & policies" },
  { id: "visibility", number: "6", label: "Review & publish" },
];

export type EditorSaveState = "saved" | "unsaved" | "saving" | "failed";

export function ProductEditorHeader({
  title,
  status,
  saveState,
  lastSavedAt,
  submitting,
  activeSection,
  issues,
  completed,
  onNavigateStep,
  onSaveDraft,
  onArchive,
  canArchive,
  onPublish,
  onBack,
  standalone = false,
  createExperience = false,
  previewOpen = false,
  onTogglePreview,
  hasPersistedProduct = true,
}: {
  title: string;
  status: ProductStatus;
  saveState: EditorSaveState;
  lastSavedAt?: Date;
  submitting: boolean;
  activeSection: ProductEditorSectionId;
  issues: ProductValidationIssue[];
  completed: Set<ProductEditorSectionId>;
  onNavigateStep: (id: ProductEditorSectionId) => void;
  onSaveDraft: () => void;
  onArchive: () => void;
  // Archiving needs the same full-info completeness as Publishing (just
  // not live purchasable stock) — disabled with an explanatory title
  // until that's true, same as Publish itself failing validation would.
  canArchive: boolean;
  onPublish: () => void;
  onBack: () => void;
  standalone?: boolean;
  createExperience?: boolean;
  previewOpen?: boolean;
  onTogglePreview?: () => void;
  hasPersistedProduct?: boolean;
}) {
  const statusStyles: Record<ProductStatus, string> = {
    draft: "bg-amber-50 text-amber-800",
    published: "bg-emerald-50 text-emerald-700",
    archived: "bg-stone-100 text-ink-soft/65",
    pending_review: "bg-sky-50 text-sky-700",
    changes_requested: "bg-red-50 text-red-700",
  };
  const saveCopy = saveState === "saving"
    ? "Saving"
    : saveState === "failed"
    ? "Save failed"
    : saveState === "unsaved"
    ? "Unsaved changes"
    : hasPersistedProduct
    ? "Saved to your account"
    : "Not saved to your account yet";
  const activeStepIndex = Math.max(0, PRODUCT_EDITOR_STEPS.findIndex((step) => step.id === activeSection));
  const showPublishAction = !createExperience || activeSection === "visibility";

  return (
    <header className={`sticky z-30 mb-6 border-b border-[#e4ddd5] bg-[#FAF8F4]/95 backdrop-blur ${standalone ? "top-0 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" : "top-[72px] -mx-4 border-y px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10"}`}>
      <div className="mx-auto max-w-[1760px] sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1 rounded-md text-[11.5px] font-semibold text-ink-soft/65">
            <ChevronLeft className="h-4 w-4" /> Back to Products
          </button>
          {onTogglePreview ? (
            <button
              type="button"
              onClick={onTogglePreview}
              aria-pressed={previewOpen}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-[11.5px] font-bold ${previewOpen ? "border-[#332c27] bg-[#332c27] text-white" : "border-[#dcd3ca] bg-white text-[#51473f]"}`}
            >
              {previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {previewOpen ? "Hide preview" : "Preview product"}
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight text-ink">{title || "New Product"}</h1>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusStyles[status]}`}>{status}</span>
        </div>
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-ink-soft/55">
          {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : saveState === "failed" ? <AlertCircle className="h-3 w-3 text-red-600" /> : saveState === "saved" ? <Check className="h-3 w-3 text-emerald-700" /> : <Clock3 className="h-3 w-3" />}
          {saveCopy}
        </span>
      </div>
      <div className="mx-auto hidden max-w-[1760px] flex-wrap items-center gap-3 sm:flex">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-ink-soft/65 hover:bg-stone-100 hover:text-ink">
          <ChevronLeft className="h-4 w-4" /> Back to Products
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[18px] font-bold tracking-tight text-ink">{title || "New Product"}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize ${statusStyles[status]}`}>{status}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-soft/55" aria-live="polite">
            {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : saveState === "failed" ? <AlertCircle className="h-3 w-3 text-red-600" /> : saveState === "saved" ? <Check className="h-3 w-3 text-emerald-700" /> : <Clock3 className="h-3 w-3" />}
            <span>{saveCopy}</span>
            {lastSavedAt && saveState === "saved" && <span>· Last saved {lastSavedAt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
        {createExperience ? (
          <div className="hidden min-w-[190px] lg:block">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-[#81746a]">
              <span>Step {activeStepIndex + 1} of {PRODUCT_EDITOR_STEPS.length}</span>
              <span>{Math.round(((activeStepIndex + 1) / PRODUCT_EDITOR_STEPS.length) * 100)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9e2da]">
              <div className="h-full rounded-full bg-[#C85956] transition-[width] duration-300" style={{ width: `${((activeStepIndex + 1) / PRODUCT_EDITOR_STEPS.length) * 100}%` }} />
            </div>
          </div>
        ) : null}
        {onTogglePreview ? (
          <button
            type="button"
            onClick={onTogglePreview}
            aria-pressed={previewOpen}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${previewOpen ? "border-[#332c27] bg-[#332c27] text-white" : "border-[#dcd3ca] bg-white text-[#51473f] hover:border-[#C85956]/50 hover:text-[#C85956]"}`}
          >
            {previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewOpen ? "Hide preview" : "Preview product"}
          </button>
        ) : null}
        <button type="button" disabled={submitting} onClick={onSaveDraft} className="hidden min-h-10 items-center gap-1.5 rounded-lg border border-[#dcd3ca] bg-white px-3.5 text-[12px] font-semibold text-ink hover:bg-[#f4eee8] disabled:opacity-50 sm:inline-flex"><Save className="h-3.5 w-3.5" /> Save draft</button>
        {!createExperience ? (
          <button
            type="button"
            disabled={submitting || !canArchive}
            onClick={onArchive}
            title={canArchive ? undefined : "Complete all required product info first"}
            className="hidden min-h-10 items-center gap-1.5 rounded-lg border border-[#dcd3ca] bg-white px-3.5 text-[12px] font-semibold text-ink hover:bg-[#f4eee8] disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
          >
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
        ) : null}
        {showPublishAction ? (
          <button
            type="button"
            disabled={submitting || (createExperience && !canArchive)}
            onClick={onPublish}
            title={createExperience && !canArchive ? "Complete all required product info first" : undefined}
            className="min-h-10 rounded-lg bg-mahalyred px-4 text-[12px] font-semibold text-cream transition-colors hover:bg-[#b94d4a] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Publish Product
          </button>
        ) : null}
      </div>
      <div className="mx-auto mt-3 flex max-w-[1760px] items-center gap-3">
        <ProductStepper activeSection={activeSection} issues={issues} completed={completed} onNavigate={onNavigateStep} />
      </div>
    </header>
  );
}

// Horizontal six-step workflow indicator, positioned in the editor header
// beside Save as Draft / Publish Product. Navigation-only: each step
// scrolls to (and reflects the validation state of) a real section — see
// PRODUCT_EDITOR_STEPS above for the id mapping.
function ProductStepper({
  activeSection,
  issues,
  completed,
  onNavigate,
}: {
  activeSection: ProductEditorSectionId;
  issues: ProductValidationIssue[];
  completed: Set<ProductEditorSectionId>;
  onNavigate: (id: ProductEditorSectionId) => void;
}) {
  const steps = PRODUCT_EDITOR_STEPS;
  return (
    <nav aria-label="Product editor steps" className="min-w-0 flex-1 overflow-x-auto">
      <ol className="flex items-center gap-1.5">
        {steps.map((step, index) => {
          const issueCount = issues.filter((issue) => issue.section === step.id).length;
          const active = activeSection === step.id;
          const stepComplete = completed.has(step.id);
          return (
            <li key={`${step.id}-${step.number}`} className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNavigate(step.id)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  active
                    ? "border-ink bg-ink text-cream"
                    : issueCount
                    ? "border-red-200 bg-red-50 text-red-700"
                    : stepComplete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-stone-200 text-ink-soft/65 hover:border-ink/40"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold ${
                    active ? "bg-cream/25 text-cream" : issueCount ? "bg-red-100 text-red-700" : stepComplete ? "bg-emerald-100 text-emerald-700" : "bg-stone-150 text-ink-soft/60"
                  }`}
                >
                  {issueCount ? <AlertCircle className="h-3 w-3" /> : stepComplete && !active ? <Check className="h-3 w-3" /> : step.number}
                </span>
                {step.label}
              </button>
              {index < steps.length - 1 && <span aria-hidden="true" className="h-px w-2.5 shrink-0 bg-stone-200" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ProductErrorSummary({ issues, onNavigate }: { issues: ProductValidationIssue[]; onNavigate: (issue: ProductValidationIssue) => void }) {
  if (!issues.length) return null;
  return (
    <div role="alert" aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 p-4">
      <h2 className="text-[13px] font-bold text-red-800">{issues.length} issue{issues.length === 1 ? "" : "s"} must be fixed.</h2>
      <div className="mt-2 space-y-1">
        {issues.map((issue, index) => <button key={`${issue.fieldId}-${index}`} type="button" onClick={() => onNavigate(issue)} className="block text-left text-[12px] font-medium text-red-700 underline-offset-2 hover:underline">{PRODUCT_EDITOR_SECTIONS.find((section) => section.id === issue.section)?.label}: {issue.message}</button>)}
      </div>
    </div>
  );
}

export function ProductEditorBottomBar({
  dirty,
  submitting,
  onSaveDraft,
  onArchive,
  canArchive,
  onPublish,
  showDraft = true,
  publishLabel = "Publish Product",
}: {
  dirty: boolean;
  submitting: boolean;
  onSaveDraft: () => void;
  onArchive: () => void;
  canArchive: boolean;
  onPublish: () => void;
  // False once a product has ever left Draft — there's no path back to
  // it, so re-offering "Save as Draft" on an already-published/archived
  // product would be a dead end, not a real option.
  showDraft?: boolean;
  // "Update" once it's already live — "Publish Product" only makes sense
  // the first time.
  publishLabel?: string;
}) {
  return <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex flex-wrap items-center gap-2 border-t border-stone-150 bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-xl lg:border">
    <span className="mr-auto text-[11.5px] font-medium text-ink-soft/55">{dirty ? "Unsaved changes" : "All changes saved"}</span>
    {showDraft && <button type="button" disabled={submitting} onClick={onSaveDraft} className="min-h-10 rounded-md border border-stone-150 px-3 text-[12px] font-semibold disabled:opacity-50">Save as Draft</button>}
    <button
      type="button"
      disabled={submitting || !canArchive}
      onClick={onArchive}
      title={canArchive ? undefined : "Complete all required product info first"}
      className="min-h-10 rounded-md border border-stone-150 px-3 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
    >
      Archive
    </button>
    <button type="button" disabled={submitting} onClick={onPublish} className="min-h-10 rounded-md bg-mahalyred px-4 text-[12px] font-semibold text-cream disabled:opacity-50">{publishLabel}</button>
  </div>;
}

export function ProductWizardBottomBar({
  stepIndex,
  stepCount,
  submitting,
  canPublish,
  isPartnerBrand,
  hasPersistedProduct,
  onPrevious,
  onNext,
  onSaveDraft,
  onArchive,
  onPublish,
}: {
  stepIndex: number;
  stepCount: number;
  submitting: boolean;
  canPublish: boolean;
  isPartnerBrand: boolean;
  hasPersistedProduct: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onArchive: () => void;
  onPublish: () => void;
}) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === stepCount - 1;

  return (
    <div className="sticky bottom-0 z-20 mt-7 flex flex-wrap items-center gap-2 rounded-xl border border-[#ded6cd] bg-[#fffdf9]/95 px-4 py-3 shadow-[0_-12px_32px_rgba(68,49,36,0.06)] backdrop-blur">
      <button type="button" disabled={isFirst || submitting} onClick={onPrevious} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[12px] font-semibold text-[#6f6259] transition-colors hover:bg-[#f3ece5] disabled:opacity-35">
        <ArrowLeft className="h-4 w-4" /> Previous
      </button>
      <p className="hidden text-[11px] text-[#8d8076] sm:block">Step {stepIndex + 1} of {stepCount}</p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!hasPersistedProduct ? <button type="button" disabled={submitting} onClick={onSaveDraft} className="min-h-10 rounded-lg border border-[#dcd3ca] bg-white px-3.5 text-[12px] font-semibold text-[#51473f] hover:bg-[#f4eee8] disabled:opacity-50">Save draft</button> : null}
        {isLast ? (
          <>
            <button type="button" disabled={submitting || !canPublish} onClick={onArchive} className="min-h-10 rounded-lg border border-[#dcd3ca] bg-white px-3.5 text-[12px] font-semibold text-[#51473f] hover:bg-[#f4eee8] disabled:cursor-not-allowed disabled:opacity-45">Keep archived</button>
            <button type="button" disabled={submitting || !canPublish} onClick={onPublish} className="min-h-10 rounded-lg bg-[#C85956] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#b94d4a] disabled:cursor-not-allowed disabled:opacity-45">
              {isPartnerBrand ? "Publish & prepare stock" : "Publish product"}
            </button>
          </>
        ) : (
          <button type="button" disabled={submitting} onClick={onNext} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#332c27] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#4a4039] disabled:opacity-50">
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
