"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import type { BrandApplicationDocumentRecord, BrandApplicationRecord } from "@/types";
import {
  APPLICANT_ROLES,
  LEGAL_STATUS_OPTIONS,
  LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION,
  LEGAL_STATUSES_WITH_TAX_CARD,
  PRODUCT_CATEGORY_OPTIONS,
  SALES_CHANNEL_OPTIONS,
} from "@/lib/join/constants";
import {
  applicantInfoSchema,
  brandInfoSchema,
  legalInfoObjectSchema,
  operationsInfoSchema,
  consentSchema,
  submitApplicationSchema,
  type DraftApplicationInput,
} from "@/lib/join/validation";
import {
  fetchMyDocuments,
  saveDraft,
  submitApplicationRequest,
  uploadDocument,
  withdrawApplicationRequest,
} from "@/lib/join/clientApi";
import ApplicationStatusView from "@/components/join/ApplicationStatusView";

const STEPS = [
  { id: "applicant", label: "About you" },
  { id: "brand", label: "Your brand" },
  { id: "legal", label: "Legal & documents" },
  { id: "operations", label: "Products & operations" },
  { id: "review", label: "Review & submit" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

interface FormState {
  founderName: string;
  email: string;
  phone: string;
  applicantRole: string;
  brandName: string;
  brandNameAr: string;
  brandNameEn: string;
  instagramUsername: string;
  websiteUrl: string;
  otherSocialUrls: string;
  productCategory: string;
  additionalCategories: string[];
  brandStory: string;
  foundingYear: string;
  country: string;
  city: string;
  salesChannelsList: string[];
  approxProductCount: string;
  approxMonthlyOrders: string;
  legalStatus: string;
  commercialRegistrationNumber: string;
  taxRegistrationNumber: string;
  legalBusinessName: string;
  productPriceRange: string;
  productsManufacturedByBrand: boolean | null;
  madeToOrder: boolean | null;
  avgPreparationTime: string;
  shippingCoverage: string;
  returnExchangeAvailable: boolean | null;
  inventoryStatus: string;
  consentAccurate: boolean;
  consentTerms: boolean;
}

function emptyForm(): FormState {
  return {
    founderName: "",
    email: "",
    phone: "",
    applicantRole: "",
    brandName: "",
    brandNameAr: "",
    brandNameEn: "",
    instagramUsername: "",
    websiteUrl: "",
    otherSocialUrls: "",
    productCategory: "",
    additionalCategories: [],
    brandStory: "",
    foundingYear: "",
    country: "",
    city: "",
    salesChannelsList: [],
    approxProductCount: "",
    approxMonthlyOrders: "",
    legalStatus: "",
    commercialRegistrationNumber: "",
    taxRegistrationNumber: "",
    legalBusinessName: "",
    productPriceRange: "",
    productsManufacturedByBrand: null,
    madeToOrder: null,
    avgPreparationTime: "",
    shippingCoverage: "",
    returnExchangeAvailable: null,
    inventoryStatus: "",
    consentAccurate: false,
    consentTerms: false,
  };
}

function fromApplication(app: BrandApplicationRecord): FormState {
  return {
    founderName: app.founderName ?? "",
    email: app.email ?? "",
    phone: app.phone ?? "",
    applicantRole: app.applicantRole ?? "",
    brandName: app.brandName ?? "",
    brandNameAr: app.brandNameAr ?? "",
    brandNameEn: app.brandNameEn ?? "",
    instagramUsername: app.instagramOrWebsite?.startsWith("http") ? "" : app.instagramOrWebsite ?? "",
    websiteUrl: app.websiteUrl ?? "",
    otherSocialUrls: (app.otherSocialUrls ?? []).join(", "),
    productCategory: app.productCategory ?? "",
    additionalCategories: app.additionalCategories ?? [],
    brandStory: app.brandStory ?? "",
    foundingYear: app.foundingYear ? String(app.foundingYear) : "",
    country: app.country ?? "",
    city: app.city ?? "",
    salesChannelsList: app.salesChannelsList ?? [],
    approxProductCount: app.approxProductCount ? String(app.approxProductCount) : "",
    approxMonthlyOrders: app.approxMonthlyOrders ?? "",
    legalStatus: app.legalStatus ?? "",
    commercialRegistrationNumber: app.commercialRegistrationNumber ?? "",
    taxRegistrationNumber: app.taxRegistrationNumber ?? "",
    legalBusinessName: app.legalBusinessName ?? "",
    productPriceRange: app.productPriceRange ?? "",
    productsManufacturedByBrand: app.productsManufacturedByBrand ?? null,
    madeToOrder: app.madeToOrder ?? null,
    avgPreparationTime: app.avgPreparationTime ?? "",
    shippingCoverage: app.shippingCoverage ?? "",
    returnExchangeAvailable: app.returnExchangeAvailable ?? null,
    inventoryStatus: app.inventoryStatus ?? "",
    consentAccurate: app.consentAccurate ?? false,
    consentTerms: app.consentTerms ?? false,
  };
}

function toDraftInput(form: FormState): DraftApplicationInput {
  return {
    founderName: form.founderName || undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    applicantRole: (form.applicantRole || undefined) as DraftApplicationInput["applicantRole"],
    brandName: form.brandName || undefined,
    brandNameAr: form.brandNameAr || undefined,
    brandNameEn: form.brandNameEn || undefined,
    instagramUsername: form.instagramUsername || undefined,
    websiteUrl: form.websiteUrl || undefined,
    otherSocialUrls: form.otherSocialUrls
      ? form.otherSocialUrls.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    productCategory: form.productCategory || undefined,
    additionalCategories: form.additionalCategories,
    brandStory: form.brandStory || undefined,
    foundingYear: form.foundingYear ? Number(form.foundingYear) : undefined,
    country: form.country || undefined,
    city: form.city || undefined,
    salesChannelsList: form.salesChannelsList.length ? form.salesChannelsList : undefined,
    approxProductCount: form.approxProductCount ? Number(form.approxProductCount) : undefined,
    approxMonthlyOrders: form.approxMonthlyOrders || undefined,
    legalStatus: (form.legalStatus || undefined) as DraftApplicationInput["legalStatus"],
    commercialRegistrationNumber: form.commercialRegistrationNumber || undefined,
    taxRegistrationNumber: form.taxRegistrationNumber || undefined,
    legalBusinessName: form.legalBusinessName || undefined,
    productPriceRange: form.productPriceRange || undefined,
    productsManufacturedByBrand: form.productsManufacturedByBrand ?? undefined,
    madeToOrder: form.madeToOrder ?? undefined,
    avgPreparationTime: form.avgPreparationTime || undefined,
    shippingCoverage: form.shippingCoverage || undefined,
    returnExchangeAvailable: form.returnExchangeAvailable ?? undefined,
    inventoryStatus: form.inventoryStatus || undefined,
    consentAccurate: form.consentAccurate || undefined,
    consentTerms: form.consentTerms || undefined,
  };
}

const EDITABLE_STATUSES: BrandApplicationRecord["status"][] = ["draft", "changes_requested"];

export default function ApplyBrandForm({
  initialApplication,
  initialCooldownActive = false,
}: {
  initialApplication: BrandApplicationRecord | null;
  initialCooldownActive?: boolean;
}) {
  const [application, setApplication] = useState<BrandApplicationRecord | null>(initialApplication);
  const [cooldownActive, setCooldownActive] = useState(initialCooldownActive);
  const [form, setForm] = useState<FormState>(
    initialApplication ? fromApplication(initialApplication) : emptyForm()
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [documents, setDocuments] = useState<BrandApplicationDocumentRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (application && (application.status === "draft" || application.status === "changes_requested")) {
      fetchMyDocuments()
        .then((res) => setDocuments(res.documents))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off id only, so editing form fields doesn't retrigger a document refetch
  }, [application?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleListItem = (key: "additionalCategories" | "salesChannelsList", value: string) => {
    setForm((f) => {
      const list = f[key];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  };

  const stepSchemas = useMemo(
    () => ({
      applicant: applicantInfoSchema,
      brand: brandInfoSchema,
      legal: legalInfoObjectSchema,
      operations: operationsInfoSchema,
      review: consentSchema,
    }),
    []
  );

  function validateStep(id: StepId): boolean {
    const draft = toDraftInput(form);
    const schema = stepSchemas[id];
    const result = schema.safeParse(draft);
    if (result.success) {
      setFieldErrors({});
      return true;
    }
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
    }
    setFieldErrors(errors);
    return false;
  }

  async function persistDraft(): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const res = await saveDraft(toDraftInput(form));
      setApplication(res.application);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save your progress.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    const current = STEPS[stepIndex].id;
    if (!validateStep(current)) return;
    const ok = await persistDraft();
    if (!ok) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSubmit() {
    if (!validateStep("review")) return;
    const draft = toDraftInput(form);
    const result = submitApplicationSchema.safeParse(draft);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      setError("Please complete all required fields before submitting.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await submitApplicationRequest(result.data);
      setApplication(res.application);
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit your application.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(fileList)) {
        const res = await uploadDocument(file);
        setDocuments((docs) => [...docs, res.document]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleWithdraw() {
    setWithdrawing(true);
    try {
      const res = await withdrawApplicationRequest();
      setApplication(res.application);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to withdraw application.");
    } finally {
      setWithdrawing(false);
    }
  }

  function handleStartNew() {
    setApplication(null);
    setForm(emptyForm());
    setDocuments([]);
    setStepIndex(0);
    setSubmitted(false);
    setCooldownActive(false);
  }

  const isEditable = !application || EDITABLE_STATUSES.includes(application.status);

  if (!isEditable && !submitted && application) {
    return (
      <ApplicationStatusView
        application={application}
        cooldownActive={cooldownActive}
        onWithdraw={handleWithdraw}
        onStartNew={handleStartNew}
        withdrawing={withdrawing}
      />
    );
  }

  if (submitted && application) {
    return (
      <ApplicationStatusView
        application={application}
        cooldownActive={cooldownActive}
        onWithdraw={handleWithdraw}
        onStartNew={handleStartNew}
        withdrawing={withdrawing}
      />
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-10 flex flex-wrap items-center gap-3">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                i < stepIndex
                  ? "bg-ink text-cream"
                  : i === stepIndex
                    ? "border-2 border-ink text-ink"
                    : "border border-stone-150 text-ink-soft/40"
              }`}
            >
              {i < stepIndex ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
            </div>
            <span
              className={`text-[13px] font-medium ${i <= stepIndex ? "text-ink" : "text-ink-soft/40"}`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-stone-150 sm:w-12" />}
          </div>
        ))}
      </div>

      {stepIndex === 0 && (
        <div className="max-w-lg space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Full name"
              value={form.founderName}
              onChange={(v) => set("founderName", v)}
              error={fieldErrors.founderName}
              required
            />
            <SelectField
              label="Your role at the brand"
              value={form.applicantRole}
              onChange={(v) => set("applicantRole", v)}
              options={APPLICANT_ROLES.map((r) => ({ value: r.value, label: r.label }))}
              error={fieldErrors.applicantRole}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => set("email", v)}
              error={fieldErrors.email}
              required
            />
            <Field
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              error={fieldErrors.phone}
              required
            />
          </div>
        </div>
      )}

      {stepIndex === 1 && (
        <div className="max-w-lg space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Brand name"
              value={form.brandName}
              onChange={(v) => set("brandName", v)}
              error={fieldErrors.brandName}
              required
            />
            <SelectField
              label="Main product category"
              value={form.productCategory}
              onChange={(v) => set("productCategory", v)}
              options={PRODUCT_CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
              error={fieldErrors.productCategory}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Brand name (Arabic)"
              value={form.brandNameAr}
              onChange={(v) => set("brandNameAr", v)}
            />
            <Field
              label="Brand name (English)"
              value={form.brandNameEn}
              onChange={(v) => set("brandNameEn", v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Instagram username"
              placeholder="@yourbrand"
              value={form.instagramUsername}
              onChange={(v) => set("instagramUsername", v)}
            />
            <Field
              label="Website URL"
              placeholder="https://yourbrand.com"
              value={form.websiteUrl}
              onChange={(v) => set("websiteUrl", v)}
              error={fieldErrors.websiteUrl}
            />
          </div>
          <Field
            label="Other social media (comma-separated)"
            value={form.otherSocialUrls}
            onChange={(v) => set("otherSocialUrls", v)}
          />
          <TextAreaField
            label="Brand story"
            value={form.brandStory}
            onChange={(v) => set("brandStory", v)}
            error={fieldErrors.brandStory}
            rows={4}
            required
          />
          <div className="grid grid-cols-3 gap-4">
            <Field
              label="Founding year"
              value={form.foundingYear}
              onChange={(v) => set("foundingYear", v)}
            />
            <Field
              label="Country"
              value={form.country}
              onChange={(v) => set("country", v)}
              error={fieldErrors.country}
              required
            />
            <Field
              label="City"
              value={form.city}
              onChange={(v) => set("city", v)}
              error={fieldErrors.city}
              required
            />
          </div>
          <CheckboxGroup
            label="Current sales channels"
            options={SALES_CHANNEL_OPTIONS}
            selected={form.salesChannelsList}
            onToggle={(v) => toggleListItem("salesChannelsList", v)}
            error={fieldErrors.salesChannelsList}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Approx. product count"
              value={form.approxProductCount}
              onChange={(v) => set("approxProductCount", v)}
            />
            <Field
              label="Approx. monthly orders"
              value={form.approxMonthlyOrders}
              onChange={(v) => set("approxMonthlyOrders", v)}
            />
          </div>
        </div>
      )}

      {stepIndex === 2 && (
        <div className="max-w-lg space-y-5">
          <SelectField
            label="Legal status"
            value={form.legalStatus}
            onChange={(v) => set("legalStatus", v)}
            options={LEGAL_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            error={fieldErrors.legalStatus}
            required
          />
          {LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION.includes(form.legalStatus as never) && (
            <Field
              label="Commercial registration number"
              value={form.commercialRegistrationNumber}
              onChange={(v) => set("commercialRegistrationNumber", v)}
              error={fieldErrors.commercialRegistrationNumber}
              required
            />
          )}
          {LEGAL_STATUSES_WITH_TAX_CARD.includes(form.legalStatus as never) && (
            <Field
              label="Tax registration number"
              value={form.taxRegistrationNumber}
              onChange={(v) => set("taxRegistrationNumber", v)}
              error={fieldErrors.taxRegistrationNumber}
              required
            />
          )}
          <Field
            label="Legal business name"
            value={form.legalBusinessName}
            onChange={(v) => set("legalBusinessName", v)}
          />

          <div>
            <span className="text-[12.5px] font-medium text-ink-soft/70">
              Supporting documents (optional)
            </span>
            <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-stone-200 px-3.5 py-4 text-[13px] font-medium text-ink-soft/70 hover:border-ink/30">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={1.8} />
              )}
              {uploading ? "Uploading…" : "Upload PDF, JPG, or PNG"}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                multiple
                className="hidden"
                disabled={uploading || !application}
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
            {!application && (
              <p className="mt-1.5 text-[12px] text-ink-soft/50">
                Save your progress (click Next) before uploading documents.
              </p>
            )}
            {documents.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-[13px] text-ink-soft/80"
                  >
                    <Check className="h-3.5 w-3.5 text-green-600" strokeWidth={2.5} />
                    {doc.fileName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {stepIndex === 3 && (
        <div className="max-w-lg space-y-5">
          <Field
            label="Typical price range"
            placeholder="e.g. EGP 300 - 1,200"
            value={form.productPriceRange}
            onChange={(v) => set("productPriceRange", v)}
          />
          <BooleanField
            label="Are your products manufactured by your own brand?"
            value={form.productsManufacturedByBrand}
            onChange={(v) => set("productsManufacturedByBrand", v)}
          />
          <BooleanField
            label="Are items made to order?"
            value={form.madeToOrder}
            onChange={(v) => set("madeToOrder", v)}
          />
          <Field
            label="Average preparation time"
            placeholder="e.g. 3-5 business days"
            value={form.avgPreparationTime}
            onChange={(v) => set("avgPreparationTime", v)}
          />
          <Field
            label="Shipping coverage"
            placeholder="e.g. All of Egypt"
            value={form.shippingCoverage}
            onChange={(v) => set("shippingCoverage", v)}
          />
          <BooleanField
            label="Do you offer returns/exchanges?"
            value={form.returnExchangeAvailable}
            onChange={(v) => set("returnExchangeAvailable", v)}
          />
          <Field
            label="Inventory status"
            placeholder="e.g. In stock, made-to-order, limited drops"
            value={form.inventoryStatus}
            onChange={(v) => set("inventoryStatus", v)}
          />
        </div>
      )}

      {stepIndex === 4 && (
        <div className="max-w-lg space-y-5">
          <div className="space-y-3 rounded-md bg-white p-4 text-[13px] text-ink-soft/80">
            <ReviewRow label="Founder" value={form.founderName} />
            <ReviewRow label="Email" value={form.email} />
            <ReviewRow label="Brand name" value={form.brandName} />
            <ReviewRow label="Category" value={form.productCategory} />
            <ReviewRow label="Legal status" value={form.legalStatus} />
          </div>

          <label className="flex items-start gap-2.5 text-[13px] text-ink-soft/80">
            <input
              type="checkbox"
              checked={form.consentAccurate}
              onChange={(e) => set("consentAccurate", e.target.checked)}
              className="mt-0.5"
            />
            I confirm the information provided is accurate to the best of my knowledge.
          </label>
          {fieldErrors.consentAccurate && (
            <p className="text-[12px] text-red-600">{fieldErrors.consentAccurate}</p>
          )}

          <label className="flex items-start gap-2.5 text-[13px] text-ink-soft/80">
            <input
              type="checkbox"
              checked={form.consentTerms}
              onChange={(e) => set("consentTerms", e.target.checked)}
              className="mt-0.5"
            />
            I agree to Mahaly&apos;s review process and privacy terms.
          </label>
          {fieldErrors.consentTerms && (
            <p className="text-[12px] text-red-600">{fieldErrors.consentTerms}</p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-5 max-w-lg rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-8 flex max-w-lg items-center gap-3">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md border border-stone-200 px-5 py-3 text-[14px] font-semibold text-ink transition-colors hover:border-ink/40"
          >
            Back
          </button>
        )}
        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-ink py-3 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Next"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-ink py-3 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit application"}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-soft/50">{label}</span>
      <span className="truncate font-medium text-ink">{value || "—"}</span>
    </div>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`mt-1.5 w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
          error ? "border-red-300" : "border-stone-150"
        }`}
      />
      {error && <span className="mt-1 block text-[12px] text-red-600">{error}</span>}
    </label>
  );
}

function TextAreaField({
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
  required,
  error,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        className={`mt-1.5 w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
          error ? "border-red-300" : "border-stone-150"
        }`}
      />
      {error && <span className="mt-1 block text-[12px] text-red-600">{error}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`mt-1.5 w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
          error ? "border-red-300" : "border-stone-150"
        }`}
      >
        <option value="" disabled>
          Select
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-[12px] text-red-600">{error}</span>}
    </label>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onToggle,
  error,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                active
                  ? "border-ink bg-ink text-cream"
                  : "border-stone-200 text-ink-soft/70 hover:border-ink/40"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {error && <span className="mt-1.5 block text-[12px] text-red-600">{error}</span>}
    </div>
  );
}

function BooleanField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <div className="mt-1.5 flex gap-2">
        {[
          { label: "Yes", val: true },
          { label: "No", val: false },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.val)}
            className={`rounded-md border px-4 py-2 text-[13px] font-medium transition-colors ${
              value === opt.val
                ? "border-ink bg-ink text-cream"
                : "border-stone-200 text-ink-soft/70 hover:border-ink/40"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
