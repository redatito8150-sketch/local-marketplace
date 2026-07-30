"use client";

import { AlertCircle, Check, ChevronLeft, Clock3, Loader2, Save } from "lucide-react";
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
  { id: "basic", number: "1", label: "Basic Information" },
  { id: "pricing", number: "2", label: "Pricing" },
  { id: "inventory", number: "3", label: "Variants" },
  { id: "media", number: "4", label: "Media" },
  { id: "details", number: "5", label: "Product Details" },
  { id: "details", number: "6", label: "Shipping" },
  { id: "visibility", number: "7", label: "Visibility" },
];

export type EditorSaveState = "saved" | "unsaved" | "saving" | "failed";

export function ProductEditorHeader({
  title,
  status,
  saveState,
  lastSavedAt,
  submitting,
  isBrandPortal,
  activeSection,
  issues,
  completed,
  onNavigateStep,
  onSaveDraft,
  onPublish,
  onBack,
}: {
  title: string;
  status: ProductStatus;
  saveState: EditorSaveState;
  lastSavedAt?: Date;
  submitting: boolean;
  isBrandPortal: boolean;
  activeSection: ProductEditorSectionId;
  issues: ProductValidationIssue[];
  completed: Set<ProductEditorSectionId>;
  onNavigateStep: (id: ProductEditorSectionId) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onBack: () => void;
}) {
  const statusStyles: Record<ProductStatus, string> = {
    draft: "bg-amber-50 text-amber-800",
    published: "bg-emerald-50 text-emerald-700",
    archived: "bg-stone-100 text-ink-soft/65",
    pending_review: "bg-sky-50 text-sky-700",
    changes_requested: "bg-red-50 text-red-700",
  };
  const saveCopy = saveState === "saving" ? "Saving" : saveState === "failed" ? "Save failed" : saveState === "unsaved" ? "Unsaved changes" : "Saved";

  return (
    <header className="sticky top-[72px] z-30 -mx-4 mb-6 space-y-2.5 border-y border-stone-150 bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10">
      <div className="flex flex-wrap items-center gap-3">
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
            {lastSavedAt && saveState === "saved" && <span>· Last saved {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ProductStepper activeSection={activeSection} issues={issues} completed={completed} onNavigate={onNavigateStep} isBrandPortal={isBrandPortal} />
        <div className="flex shrink-0 items-center gap-2">
          {!isBrandPortal && <button type="button" disabled={submitting} onClick={onSaveDraft} className="hidden min-h-10 items-center gap-1.5 rounded-md border border-stone-150 px-3 text-[12px] font-semibold text-ink hover:bg-stone-50 disabled:opacity-50 sm:inline-flex"><Save className="h-3.5 w-3.5" /> Save as Draft</button>}
          <button type="button" disabled={submitting} onClick={onPublish} className="min-h-10 rounded-md bg-ink px-4 text-[12px] font-semibold text-cream disabled:opacity-50">
            {isBrandPortal ? "Submit for Review" : "Publish Product"}
          </button>
        </div>
      </div>
    </header>
  );
}

// Horizontal seven-step workflow indicator, positioned in the editor header
// beside Save as Draft / Publish Product. Navigation-only: each step
// scrolls to (and reflects the validation state of) a real section — see
// PRODUCT_EDITOR_STEPS above for the id mapping.
function ProductStepper({
  activeSection,
  issues,
  completed,
  onNavigate,
  isBrandPortal,
}: {
  activeSection: ProductEditorSectionId;
  issues: ProductValidationIssue[];
  completed: Set<ProductEditorSectionId>;
  onNavigate: (id: ProductEditorSectionId) => void;
  isBrandPortal: boolean;
}) {
  const steps = PRODUCT_EDITOR_STEPS.filter((step) => !isBrandPortal || step.id !== "visibility");
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

export function ProductEditorBottomBar({ dirty, submitting, isBrandPortal, onSaveDraft, onPublish }: { dirty: boolean; submitting: boolean; isBrandPortal: boolean; onSaveDraft: () => void; onPublish: () => void }) {
  return <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex items-center gap-2 border-t border-stone-150 bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-xl lg:border">
    <span className="mr-auto text-[11.5px] font-medium text-ink-soft/55">{dirty ? "Unsaved changes" : "All changes saved"}</span>
    {!isBrandPortal && <button type="button" disabled={submitting} onClick={onSaveDraft} className="min-h-10 rounded-md border border-stone-150 px-3 text-[12px] font-semibold disabled:opacity-50">Save as Draft</button>}
    <button type="button" disabled={submitting} onClick={onPublish} className="min-h-10 rounded-md bg-ink px-4 text-[12px] font-semibold text-cream disabled:opacity-50">{isBrandPortal ? "Submit for Review" : "Publish Product"}</button>
  </div>;
}
