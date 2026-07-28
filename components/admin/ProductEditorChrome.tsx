"use client";

import { AlertCircle, Check, ChevronLeft, Clock3, Eye, Loader2, Save } from "lucide-react";
import type { ProductStatus } from "@/types";
import type { ProductEditorSectionId, ProductValidationIssue } from "@/lib/admin/productValidation";

export const PRODUCT_EDITOR_SECTIONS: { id: ProductEditorSectionId; number: string; label: string }[] = [
  { id: "basic", number: "01", label: "Basic Information" },
  { id: "pricing", number: "02", label: "Pricing" },
  { id: "media", number: "03", label: "Media" },
  { id: "inventory", number: "04", label: "Inventory & Variants" },
  { id: "details", number: "05", label: "Product Details" },
  { id: "visibility", number: "06", label: "Visibility" },
];

export type EditorSaveState = "saved" | "unsaved" | "saving" | "failed";

export function ProductEditorHeader({
  title,
  status,
  saveState,
  lastSavedAt,
  submitting,
  isBrandPortal,
  onSaveDraft,
  onPublish,
  onPreview,
  onBack,
}: {
  title: string;
  status: ProductStatus;
  saveState: EditorSaveState;
  lastSavedAt?: Date;
  submitting: boolean;
  isBrandPortal: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPreview: () => void;
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
    <header className="sticky top-[72px] z-30 -mx-4 mb-6 border-y border-stone-150 bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10">
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
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPreview} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-stone-150 px-3 text-[12px] font-semibold text-ink hover:bg-stone-50">
            <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Live Preview</span>
          </button>
          {!isBrandPortal && <button type="button" disabled={submitting} onClick={onSaveDraft} className="hidden min-h-10 items-center gap-1.5 rounded-md border border-stone-150 px-3 text-[12px] font-semibold text-ink hover:bg-stone-50 disabled:opacity-50 sm:inline-flex"><Save className="h-3.5 w-3.5" /> Save as Draft</button>}
          <button type="button" disabled={submitting} onClick={onPublish} className="min-h-10 rounded-md bg-ink px-4 text-[12px] font-semibold text-cream disabled:opacity-50">
            {isBrandPortal ? "Submit for Review" : "Publish Product"}
          </button>
        </div>
      </div>
    </header>
  );
}

export function ProductSectionNavigation({
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
  return (
    <nav aria-label="Product editor sections" className="lg:sticky lg:top-[158px]">
      <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible">
        {PRODUCT_EDITOR_SECTIONS.filter((section) => !isBrandPortal || section.id !== "visibility").map((section) => {
          const issueCount = issues.filter((issue) => issue.section === section.id).length;
          const active = activeSection === section.id;
          return (
            <button key={section.id} type="button" onClick={() => onNavigate(section.id)} aria-current={active ? "step" : undefined} className={`min-w-[155px] rounded-lg border px-3 py-2.5 text-left transition-colors lg:min-w-0 lg:w-full ${active ? "border-ink bg-ink text-cream" : "border-transparent text-ink hover:border-stone-150 hover:bg-white"}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold ${active ? "text-cream/55" : "text-ink-soft/40"}`}>{section.number}</span>
                <span className="text-[12px] font-semibold">{section.label}</span>
              </div>
              <div className={`mt-1 flex items-center gap-1 text-[10.5px] ${active ? "text-cream/70" : issueCount ? "text-red-700" : completed.has(section.id) ? "text-emerald-700" : "text-ink-soft/45"}`}>
                {issueCount ? <><AlertCircle className="h-3 w-3" /> {issueCount} issue{issueCount === 1 ? "" : "s"}</> : completed.has(section.id) ? <><Check className="h-3 w-3" /> Complete</> : "Incomplete"}
              </div>
            </button>
          );
        })}
      </div>
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
