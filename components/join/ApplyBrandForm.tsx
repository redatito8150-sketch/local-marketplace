"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Loader2, MessageSquare, Upload, X } from "lucide-react";
import InlineError from "@/components/shared/InlineError";
import type { BrandApplicationRecord, BrandApplicationDocumentRecord, EgyptGovernorate, FulfillmentResponsibility } from "@/types";
import {
  APPLICANT_ROLES,
  BUSINESS_SIZE_OPTIONS,
  EGYPT_GOVERNORATES,
  FULFILLMENT_RESPONSIBILITY_OPTIONS,
  LEGAL_STATUS_OPTIONS,
  LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION,
  LEGAL_STATUSES_WITH_TAX_CARD,
  PREPARATION_TIME_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  RETURNS_POLICY_OPTIONS,
  SALES_CHANNEL_LINK_CONFIG,
  SALES_CHANNEL_OPTIONS,
  WEBSITE_CHANNEL,
} from "@/lib/join/constants";
import {
  applicantInfoSchema,
  brandInfoSchema,
  legalInfoSchema,
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
import TagInput from "@/components/shared/TagInput";

// Products & operations comes before Legal & documents on purpose — the
// applicant's brand/operations details are usually top of mind, while
// registration paperwork is often the thing they need to go look up.
const STEPS = [
  {
    id: "applicant",
    label: "About you",
    description: "Tell us who we should contact about this application.",
  },
  {
    id: "brand",
    label: "Your brand",
    description: "Share the essential details about your brand and how it currently sells.",
  },
  {
    id: "operations",
    label: "Products & operations",
    description: "Help us understand how your products are priced, prepared, and delivered.",
  },
  {
    id: "legal",
    label: "Legal & documents",
    description: "Tell us about your business registration and provide supporting documents if available.",
  },
  {
    id: "review",
    label: "Review & submit",
    description: "Review your information carefully before submitting your application.",
  },
] as const;
type StepId = (typeof STEPS)[number]["id"];

// Looked up by id rather than a hardcoded number so "Edit" links (and any
// other index reference) keep pointing at the right step regardless of
// STEPS' order.
const STEP_INDEX: Record<StepId, number> = Object.fromEntries(
  STEPS.map((step, index) => [step.id, index])
) as Record<StepId, number>;

interface FormState {
  founderName: string;
  email: string;
  phone: string;
  applicantRole: string;
  applicantRoleOther: string;
  brandNameAr: string;
  brandNameEn: string;
  productCategories: string[];
  productCategoryCustomTags: string[];
  brandStory: string;
  foundingYear: string;
  country: string;
  city: EgyptGovernorate | "";
  salesChannelsList: string[];
  salesChannelLinks: Record<string, string>;
  approxProductCountRange: string;
  approxMonthlyOrdersRange: string;
  legalStatus: string;
  commercialRegistrationNumber: string;
  taxRegistrationNumber: string;
  legalBusinessName: string;
  legalStatusOther: string;
  priceMin: string;
  priceMax: string;
  fulfillmentResponsibility: FulfillmentResponsibility | "";
  avgPreparationTimeRange: string;
  returnsPolicy: string;
  returnsPolicyDetails: string;
  consentAccurate: boolean;
  consentTerms: boolean;
}

// Reconstructs the preset pill selection + free-typed custom tags from the
// flat productCategory/additionalCategories the DB stores — any stored
// value that isn't one of the fixed preset options is treated as a custom
// tag the applicant typed in themselves.
function categoriesFromApp(app: BrandApplicationRecord): { categories: string[]; customTags: string[] } {
  const stored = [app.productCategory, ...app.additionalCategories].filter(Boolean);
  const categories: string[] = [];
  const customTags: string[] = [];
  for (const value of stored) {
    if ((PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(value)) {
      if (!categories.includes(value)) categories.push(value);
    } else if (!customTags.includes(value)) {
      customTags.push(value);
    }
  }
  return { categories, customTags };
}

// Inverse of categoriesFromApp — resolves the selected preset pills plus
// the custom typed tags into the flat, deduplicated list of strings the DB
// actually stores. Preset pills come first so the first preset picked stays
// the primary category; custom tags always land in additionalCategories.
function resolveCategories(form: FormState): string[] {
  const resolved: string[] = [];
  for (const category of [...form.productCategories, ...form.productCategoryCustomTags]) {
    if (!resolved.includes(category)) resolved.push(category);
  }
  return resolved;
}

function emptyForm(): FormState {
  return {
    founderName: "",
    email: "",
    phone: "",
    applicantRole: "",
    applicantRoleOther: "",
    brandNameAr: "",
    brandNameEn: "",
    productCategories: [],
    productCategoryCustomTags: [],
    brandStory: "",
    foundingYear: "",
    // Fixed — Mahaly is Egypt-only for now, see the locked Country field below.
    country: "Egypt",
    city: "",
    salesChannelsList: [],
    salesChannelLinks: {},
    approxProductCountRange: "",
    approxMonthlyOrdersRange: "",
    legalStatus: "",
    commercialRegistrationNumber: "",
    taxRegistrationNumber: "",
    legalBusinessName: "",
    legalStatusOther: "",
    priceMin: "",
    priceMax: "",
    fulfillmentResponsibility: "",
    avgPreparationTimeRange: "",
    returnsPolicy: "",
    returnsPolicyDetails: "",
    consentAccurate: false,
    consentTerms: false,
  };
}

function fromApplication(app: BrandApplicationRecord): FormState {
  // Legacy rows saved before this rework have an empty salesChannelLinks
  // (DB default) but may already have a websiteUrl from the old separate
  // field — surface it as the "Website" channel's link so it isn't lost.
  const salesChannelLinks =
    Object.keys(app.salesChannelLinks ?? {}).length > 0
      ? app.salesChannelLinks
      : app.websiteUrl
        ? { [WEBSITE_CHANNEL]: app.websiteUrl }
        : {};
  const { categories, customTags } = categoriesFromApp(app);
  return {
    founderName: app.founderName ?? "",
    email: app.email ?? "",
    phone: app.phone ?? "",
    applicantRole: app.applicantRole ?? "",
    applicantRoleOther: app.applicantRoleOther ?? "",
    brandNameAr: app.brandNameAr ?? "",
    brandNameEn: app.brandNameEn ?? "",
    productCategories: categories,
    productCategoryCustomTags: customTags,
    brandStory: app.brandStory ?? "",
    foundingYear: app.foundingYear ? String(app.foundingYear) : "",
    // Always fixed to Egypt going forward regardless of what a legacy row stored.
    country: "Egypt",
    city: app.city ?? "",
    salesChannelsList: app.salesChannelsList ?? [],
    salesChannelLinks,
    approxProductCountRange: app.approxProductCountRange ?? "",
    approxMonthlyOrdersRange: app.approxMonthlyOrdersRange ?? "",
    legalStatus: app.legalStatus ?? "",
    commercialRegistrationNumber: app.commercialRegistrationNumber ?? "",
    taxRegistrationNumber: app.taxRegistrationNumber ?? "",
    legalBusinessName: app.legalBusinessName ?? "",
    legalStatusOther: app.legalStatusOther ?? "",
    priceMin: app.priceMin !== undefined ? String(app.priceMin) : "",
    priceMax: app.priceMax !== undefined ? String(app.priceMax) : "",
    fulfillmentResponsibility: app.fulfillmentResponsibility ?? "",
    avgPreparationTimeRange: app.avgPreparationTimeRange ?? "",
    returnsPolicy: app.returnsPolicy ?? "",
    returnsPolicyDetails: app.returnsPolicyDetails ?? "",
    consentAccurate: app.consentAccurate ?? false,
    consentTerms: app.consentTerms ?? false,
  };
}

function toDraftInput(form: FormState): DraftApplicationInput {
  const resolvedCategories = resolveCategories(form);
  return {
    founderName: form.founderName || undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    applicantRole: (form.applicantRole || undefined) as DraftApplicationInput["applicantRole"],
    applicantRoleOther: form.applicantRoleOther || undefined,
    brandNameAr: form.brandNameAr || undefined,
    brandNameEn: form.brandNameEn || undefined,
    productCategory: resolvedCategories[0] || undefined,
    additionalCategories: resolvedCategories.length > 1 ? resolvedCategories.slice(1) : undefined,
    brandStory: form.brandStory || undefined,
    foundingYear: form.foundingYear ? Number(form.foundingYear) : undefined,
    country: form.country || undefined,
    city: form.city || undefined,
    salesChannelsList: form.salesChannelsList.length ? form.salesChannelsList : undefined,
    salesChannelLinks: form.salesChannelLinks,
    approxProductCountRange: (form.approxProductCountRange || undefined) as DraftApplicationInput["approxProductCountRange"],
    approxMonthlyOrdersRange: (form.approxMonthlyOrdersRange || undefined) as DraftApplicationInput["approxMonthlyOrdersRange"],
    legalStatus: (form.legalStatus || undefined) as DraftApplicationInput["legalStatus"],
    commercialRegistrationNumber: form.commercialRegistrationNumber || undefined,
    taxRegistrationNumber: form.taxRegistrationNumber || undefined,
    legalBusinessName: form.legalBusinessName || undefined,
    legalStatusOther: form.legalStatusOther || undefined,
    priceMin: form.priceMin ? Number(form.priceMin) : undefined,
    priceMax: form.priceMax ? Number(form.priceMax) : undefined,
    fulfillmentResponsibility:
      (form.fulfillmentResponsibility || undefined) as DraftApplicationInput["fulfillmentResponsibility"],
    avgPreparationTimeRange: (form.avgPreparationTimeRange || undefined) as DraftApplicationInput["avgPreparationTimeRange"],
    returnsPolicy: (form.returnsPolicy || undefined) as DraftApplicationInput["returnsPolicy"],
    returnsPolicyDetails: form.returnsPolicyDetails || undefined,
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
  // Steps the applicant has actually left (via Next/Back/clicking another
  // step, or a failed submit) at least once — the stepper only shows a red
  // "incomplete" X for a step once it's been left unfinished; an untouched
  // step ahead just shows an empty amber-outlined circle, not an error.
  const [attemptedSteps, setAttemptedSteps] = useState<Set<number>>(new Set());
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

  const toggleListItem = (key: "salesChannelsList" | "productCategories", value: string) => {
    setForm((f) => {
      const list = f[key];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  };

  // Selecting a sales channel also opens its link field; deselecting drops
  // whatever link was typed for it, so channelLinks never holds an entry
  // for a channel that isn't actually selected.
  const toggleSalesChannel = (channel: string) => {
    setForm((f) => {
      const selected = f.salesChannelsList.includes(channel);
      const { [channel]: _removed, ...remainingLinks } = f.salesChannelLinks;
      return {
        ...f,
        salesChannelsList: selected
          ? f.salesChannelsList.filter((v) => v !== channel)
          : [...f.salesChannelsList, channel],
        salesChannelLinks: selected ? remainingLinks : { ...f.salesChannelLinks, [channel]: f.salesChannelLinks[channel] ?? "" },
      };
    });
  };

  const setChannelLink = (channel: string, link: string) =>
    setForm((f) => ({ ...f, salesChannelLinks: { ...f.salesChannelLinks, [channel]: link } }));

  const stepSchemas = useMemo(
    () => ({
      applicant: applicantInfoSchema,
      brand: brandInfoSchema,
      legal: legalInfoSchema,
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
      // The last path segment, not the first — salesChannelLinks' per-channel
      // URL check reports issues at ["salesChannelLinks", channel], and it's
      // the channel name that matches each Field's own fieldErrors lookup.
      const key = issue.path[issue.path.length - 1];
      if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
    }
    setFieldErrors(errors);
    return false;
  }

  async function persistDraft({ quiet = false }: { quiet?: boolean } = {}): Promise<boolean> {
    setSaving(true);
    if (!quiet) setError("");
    try {
      const res = await saveDraft(toDraftInput(form));
      setApplication(res.application);
      return true;
    } catch (e) {
      if (!quiet) {
        setError(e instanceof Error ? e.message : "We couldn't save your progress. Check your connection and try again.");
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleNext() {
    const next = Math.min(stepIndex + 1, STEPS.length - 1);
    setAttemptedSteps((prev) => new Set(prev).add(stepIndex));
    setFieldErrors({});
    setStepIndex(next);
    void persistDraft({ quiet: true });
  }

  function handleBack() {
    setAttemptedSteps((prev) => new Set(prev).add(stepIndex));
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  // Draft data lives in `form` regardless of stepIndex, so jumping between
  // steps (in either direction) never loses anything.
  function goToStep(index: number) {
    if (index !== stepIndex) {
      setAttemptedSteps((prev) => new Set(prev).add(stepIndex));
    }
    setFieldErrors({});
    setStepIndex(index);
    void persistDraft({ quiet: true });
  }

  async function handleSubmit() {
    const draft = toDraftInput(form);
    const result = submitApplicationSchema.safeParse(draft);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        // The last path segment, not the first — salesChannelLinks' per-channel
      // URL check reports issues at ["salesChannelLinks", channel], and it's
      // the channel name that matches each Field's own fieldErrors lookup.
      const key = issue.path[issue.path.length - 1];
        if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      setAttemptedSteps(new Set(STEPS.map((_, i) => i)));
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
      setError(e instanceof Error ? e.message : "We couldn't submit your application. Check your connection and try again.");
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
      setError(e instanceof Error ? e.message : "The document upload was interrupted. Check your connection and try again.");
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
      setError(e instanceof Error ? e.message : "We couldn't withdraw your application. Check your connection and try again.");
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

  const activeStep = STEPS[stepIndex];
  const stepValidity = STEPS.map((step) =>
    stepSchemas[step.id].safeParse(toDraftInput(form)).success
  );
  // Driven entirely by which steps' required fields actually validate, not
  // by which step the applicant has scrolled/clicked to — so jumping ahead
  // to Review & submit before filling anything in no longer reports 100%.
  const overallProgress = Math.round(
    (stepValidity.filter(Boolean).length / STEPS.length) * 100
  );

  return (
    <div className="mx-auto max-w-4xl">
      {application?.status === "changes_requested" && application.changesRequestedMessage && (
        <div className="mb-8 flex gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
          <MessageSquare className="h-5 w-5 shrink-0 text-ink-soft/60" strokeWidth={1.8} />
          <div>
            <p className="text-[13px] font-semibold text-ink">Changes requested</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft/70">
              {application.changesRequestedMessage}
            </p>
          </div>
        </div>
      )}

      <Stepper
        steps={STEPS}
        currentIndex={stepIndex}
        stepValidity={stepValidity}
        attemptedSteps={attemptedSteps}
        onSelect={goToStep}
      />

      <StepHeader title={activeStep.label} description={activeStep.description} progress={overallProgress} />

      {activeStep.id === "applicant" && (
        <div className="max-w-lg space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Full name"
              value={form.founderName}
              onChange={(v) => set("founderName", v)}
              error={fieldErrors.founderName}
              required
            />
            <Field
              label="Business email"
              type="email"
              value={form.email}
              onChange={(v) => set("email", v)}
              error={fieldErrors.email}
              required
            />
          </div>
          <div className={`grid gap-4 ${form.applicantRole === "other" ? "grid-cols-3" : "grid-cols-2"}`}>
            <Field
              label="Phone number"
              type="tel"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              error={fieldErrors.phone}
              required
            />
            <SelectField
              label="Your role"
              value={form.applicantRole}
              onChange={(v) => set("applicantRole", v)}
              options={APPLICANT_ROLES.map((r) => ({ value: r.value, label: r.label }))}
              error={fieldErrors.applicantRole}
              required
            />
            {form.applicantRole === "other" && (
              <Field
                label="Please specify"
                value={form.applicantRoleOther}
                onChange={(v) => set("applicantRoleOther", v)}
                error={fieldErrors.applicantRoleOther}
                required
              />
            )}
          </div>
        </div>
      )}

      {activeStep.id === "brand" && (
        <div className="max-w-2xl space-y-8">
          <div className="space-y-5">
            <SectionLabel>A. Basic information</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Brand name (English)"
                value={form.brandNameEn}
                onChange={(v) => set("brandNameEn", v)}
                error={fieldErrors.brandNameEn}
                required
              />
              <Field
                label="Brand name (Arabic)"
                value={form.brandNameAr}
                onChange={(v) => set("brandNameAr", v)}
                error={fieldErrors.brandNameAr}
                required
              />
            </div>

            <div>
              <span className="text-[12.5px] font-medium text-ink-soft/70">Category<RequiredDot /></span>
              <div className="mt-1.5">
                <ChannelCards
                  options={PRODUCT_CATEGORY_OPTIONS}
                  selected={form.productCategories}
                  onToggle={(value) => toggleListItem("productCategories", value)}
                  error={fieldErrors.productCategory}
                />
              </div>
              <div className="mt-2.5">
                <span className="text-[12.5px] font-medium text-ink-soft/70">
                  Add more categories not listed above (optional)
                </span>
                <div className="mt-1.5">
                  <TagInput
                    value={form.productCategoryCustomTags}
                    onChange={(next) => setForm((f) => ({ ...f, productCategoryCustomTags: next }))}
                    placeholder="Type a category and press Enter"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <LockedField
                label="Country"
                value={form.country}
                tooltip="We hope to be available in every country around the world soon. At the moment, this option cannot be changed."
              />
              <SearchableSelect
                label="City"
                value={form.city}
                onChange={(v) => set("city", v)}
                options={EGYPT_GOVERNORATES}
                placeholder="Search governorates…"
                error={fieldErrors.city}
                required
              />
              <Field
                label="Founded"
                inputMode="numeric"
                value={form.foundingYear}
                onChange={(v) => set("foundingYear", v.replace(/\D/g, "").slice(0, 4))}
                error={fieldErrors.foundingYear}
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>B. Brand story</SectionLabel>
            <TextAreaField
              label="Brand story"
              placeholder={
                "Tell us about your brand.\n\n• What do you sell?\n• Who are your customers?\n• What makes your products unique?"
              }
              value={form.brandStory}
              onChange={(v) => set("brandStory", v)}
              error={fieldErrors.brandStory}
              rows={6}
              maxLength={500}
            />
          </div>

          <div className="space-y-3">
            <SectionLabel>C. Sales channels<RequiredDot /></SectionLabel>
            <ChannelCards
              options={SALES_CHANNEL_OPTIONS}
              selected={form.salesChannelsList}
              onToggle={toggleSalesChannel}
              error={fieldErrors.salesChannelsList}
            />
            {form.salesChannelsList.length > 0 && (
              <div className="space-y-2.5 pt-1">
                {form.salesChannelsList
                  .filter((channel) => SALES_CHANNEL_LINK_CONFIG[channel])
                  .map((channel) => {
                    const config = SALES_CHANNEL_LINK_CONFIG[channel];
                    return (
                      <Field
                        key={channel}
                        label={config.label}
                        placeholder={
                          config.strictUrl
                            ? channel === WEBSITE_CHANNEL
                              ? "https://yourbrand.com"
                              : "https://…"
                            : "Link or a short description"
                        }
                        value={form.salesChannelLinks[channel] ?? ""}
                        onChange={(v) => setChannelLink(channel, v)}
                        error={fieldErrors[channel]}
                      />
                    );
                  })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SectionLabel>D. Business size</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="Approx. product count"
                value={form.approxProductCountRange}
                onChange={(v) => set("approxProductCountRange", v)}
                options={BUSINESS_SIZE_OPTIONS}
                error={fieldErrors.approxProductCountRange}
                required
              />
              <SelectField
                label="Approx. monthly orders"
                value={form.approxMonthlyOrdersRange}
                onChange={(v) => set("approxMonthlyOrdersRange", v)}
                options={BUSINESS_SIZE_OPTIONS}
                error={fieldErrors.approxMonthlyOrdersRange}
                required
              />
            </div>
          </div>
        </div>
      )}

      {activeStep.id === "operations" && (
        <div className="max-w-lg space-y-6">
          <div className={`rounded-xl border p-4 ${
            fieldErrors.fulfillmentResponsibility ? "border-red-300" : "border-mahalyred/25 bg-mahalyred/[0.03]"
          }`}>
            <span className="inline-block rounded-full bg-mahalyred px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              Most important question
            </span>
            <p className="mt-2.5 text-[14.5px] font-semibold text-ink">
              Will you handle packaging & fulfillment yourself, or do you want to partner with Mahaly?
              <RequiredDot />
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft/60">
              If you partner with Mahaly, we take care of packaging, storage, and shipping — you only manage your brand page and product listings.
            </p>
            <div className="mt-3.5 space-y-2.5">
              {FULFILLMENT_RESPONSIBILITY_OPTIONS.map((option) => {
                const active = form.fulfillmentResponsibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => set("fulfillmentResponsibility", option.value)}
                    aria-pressed={active}
                    className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      active ? "border-ink bg-ink text-cream" : "border-stone-200 bg-white hover:border-ink/40"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        active ? "border-cream" : "border-stone-300"
                      }`}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-cream" />}
                    </span>
                    <span>
                      <span className="block text-[13.5px] font-semibold">{option.title}</span>
                      <span className={`mt-0.5 block text-[12.5px] leading-relaxed ${active ? "text-cream/75" : "text-ink-soft/60"}`}>
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.fulfillmentResponsibility && (
              <span className="mt-2.5 block text-[12px] text-red-600">{fieldErrors.fulfillmentResponsibility}</span>
            )}
          </div>

          <div>
            <span className="text-[12.5px] font-medium text-ink-soft/70">Price range (EGP) (optional)</span>
            <div className="mt-1.5 grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-[11.5px] text-ink-soft/50">Minimum price</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink-soft/50">EGP</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={form.priceMin}
                    onChange={(e) => set("priceMin", e.target.value)}
                    className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
                      fieldErrors.priceMin ? "border-red-300" : "border-stone-150"
                    }`}
                  />
                </div>
                {fieldErrors.priceMin && (
                  <span className="mt-1 block text-[12px] text-red-600">{fieldErrors.priceMin}</span>
                )}
              </label>
              <label className="block">
                <span className="text-[11.5px] text-ink-soft/50">Maximum price</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink-soft/50">EGP</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={form.priceMax}
                    onChange={(e) => set("priceMax", e.target.value)}
                    className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
                      fieldErrors.priceMax ? "border-red-300" : "border-stone-150"
                    }`}
                  />
                </div>
                {fieldErrors.priceMax && (
                  <span className="mt-1 block text-[12px] text-red-600">{fieldErrors.priceMax}</span>
                )}
              </label>
            </div>
          </div>

          <SelectField
            label="Average preparation time"
            value={form.avgPreparationTimeRange}
            onChange={(v) => set("avgPreparationTimeRange", v)}
            options={PREPARATION_TIME_OPTIONS}
            error={fieldErrors.avgPreparationTimeRange}
          />

          <div className="space-y-2.5">
            <SelectField
              label="Returns and exchanges"
              value={form.returnsPolicy}
              onChange={(v) => set("returnsPolicy", v)}
              options={RETURNS_POLICY_OPTIONS}
              error={fieldErrors.returnsPolicy}
            />
            <TextAreaField
              label="Returns & exchanges details"
              placeholder="Describe your exact returns/exchanges terms — return window, condition requirements, who covers return shipping, any non-returnable items…"
              value={form.returnsPolicyDetails}
              onChange={(v) => set("returnsPolicyDetails", v)}
              error={fieldErrors.returnsPolicyDetails}
              rows={4}
              maxLength={500}
            />
          </div>
        </div>
      )}

      {activeStep.id === "legal" && (
        <div className="max-w-lg space-y-5">
          <SelectField
            label="Business registration status"
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
          {(form.legalStatus === "both_docs" || form.legalStatus === "documents_pending") && (
            <Field
              label="Legal business name"
              value={form.legalBusinessName}
              onChange={(v) => set("legalBusinessName", v)}
            />
          )}
          {form.legalStatus === "other" && (
            <Field
              label="Please specify your registration status"
              value={form.legalStatusOther}
              onChange={(v) => set("legalStatusOther", v)}
              error={fieldErrors.legalStatusOther}
              required
            />
          )}

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
              {uploading ? "Uploading…" : "Upload a file (PDF, JPG, JPEG, or PNG)"}
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

      {activeStep.id === "review" && (
        <div className="max-w-2xl space-y-5">
          <ReviewSection title="About you" onEdit={() => goToStep(STEP_INDEX.applicant)}>
            <ReviewRow label="Full name" value={form.founderName} />
            <ReviewRow label="Business email" value={form.email} />
            <ReviewRow label="Phone number" value={form.phone} />
            <ReviewRow
              label="Role"
              value={
                form.applicantRole === "other"
                  ? form.applicantRoleOther || "Other"
                  : labelFor(APPLICANT_ROLES, form.applicantRole)
              }
            />
          </ReviewSection>

          <ReviewSection title="Your brand" onEdit={() => goToStep(STEP_INDEX.brand)}>
            <ReviewRow label="Brand name (English)" value={form.brandNameEn} />
            <ReviewRow label="Brand name (Arabic)" value={form.brandNameAr} />
            <ReviewRow
              label="Category"
              value={resolveCategories(form).join(", ")}
            />
            <ReviewRow label="Country" value={form.country} />
            <ReviewRow label="City" value={form.city} />
            <ReviewRow label="Founded" value={form.foundingYear} />
            <ReviewRow label="Brand story" value={form.brandStory} />
            <ReviewRow label="Sales channels" value={form.salesChannelsList.join(", ")} />
            {form.salesChannelsList
              .filter((channel) => SALES_CHANNEL_LINK_CONFIG[channel] && form.salesChannelLinks[channel])
              .map((channel) => (
                <ReviewRow
                  key={channel}
                  label={SALES_CHANNEL_LINK_CONFIG[channel].label}
                  value={form.salesChannelLinks[channel]}
                />
              ))}
            <ReviewRow
              label="Approx. product count"
              value={labelFor(BUSINESS_SIZE_OPTIONS, form.approxProductCountRange)}
            />
            <ReviewRow
              label="Approx. monthly orders"
              value={labelFor(BUSINESS_SIZE_OPTIONS, form.approxMonthlyOrdersRange)}
            />
          </ReviewSection>

          <ReviewSection title="Products & operations" onEdit={() => goToStep(STEP_INDEX.operations)}>
            <ReviewRow
              label="Fulfillment"
              value={
                FULFILLMENT_RESPONSIBILITY_OPTIONS.find((o) => o.value === form.fulfillmentResponsibility)
                  ?.title ?? ""
              }
            />
            <ReviewRow
              label="Price range"
              value={
                form.priceMin || form.priceMax
                  ? `EGP ${form.priceMin || "0"} – ${form.priceMax || "—"}`
                  : ""
              }
            />
            <ReviewRow
              label="Average preparation time"
              value={labelFor(PREPARATION_TIME_OPTIONS, form.avgPreparationTimeRange)}
            />
            <ReviewRow
              label="Returns and exchanges"
              value={labelFor(RETURNS_POLICY_OPTIONS, form.returnsPolicy)}
            />
            {Boolean(form.returnsPolicyDetails) && (
              <ReviewRow label="Returns & exchanges details" value={form.returnsPolicyDetails} />
            )}
          </ReviewSection>

          <ReviewSection title="Legal & documents" onEdit={() => goToStep(STEP_INDEX.legal)}>
            <ReviewRow
              label="Business registration status"
              value={
                form.legalStatus === "other"
                  ? form.legalStatusOther || "Other"
                  : labelFor(LEGAL_STATUS_OPTIONS, form.legalStatus)
              }
            />
            {Boolean(form.commercialRegistrationNumber) && (
              <ReviewRow
                label="Commercial registration number"
                value={form.commercialRegistrationNumber}
              />
            )}
            {Boolean(form.taxRegistrationNumber) && (
              <ReviewRow label="Tax registration number" value={form.taxRegistrationNumber} />
            )}
            <ReviewRow label="Legal business name" value={form.legalBusinessName} />
            <ReviewRow
              label="Documents"
              value={documents.length ? `${documents.length} uploaded` : "None uploaded"}
            />
          </ReviewSection>

          <div className="rounded-md bg-stone-50 p-4">
            <h3 className="text-[13px] font-bold text-ink">What happens next?</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink-soft/70">
              <li>Our team will review your application.</li>
              <li>We may contact you if we need more information.</li>
              <li>You will receive updates through your Mahaly account.</li>
            </ul>
          </div>

          <label className="flex items-start gap-2.5 text-[13px] text-ink-soft/80">
            <input
              type="checkbox"
              checked={form.consentAccurate}
              onChange={(e) => set("consentAccurate", e.target.checked)}
              className="mt-0.5"
            />
            I confirm the information provided is accurate to the best of my knowledge.
            <RequiredDot />
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
            <RequiredDot />
          </label>
          {fieldErrors.consentTerms && (
            <p className="text-[12px] text-red-600">{fieldErrors.consentTerms}</p>
          )}
        </div>
      )}

      {error && <InlineError error={error} className="mt-5 max-w-2xl" />}

      <div className="mt-8 flex max-w-2xl items-center gap-3">
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

// Clickable progress stepper — ●────────○────────○────────○────────○.
// Every step is a keyboard-accessible button, in one of four states:
//   - complete: that section currently passes validation — filled red check.
//   - current: the step being edited right now, not yet complete — filled
//     solid amber, no icon. This is what tells the applicant "you're here,
//     keep going," without implying anything is wrong yet.
//   - error: a step the applicant has already left (Next/Back/clicked
//     elsewhere, or a failed submit) while still incomplete — red X. This
//     only appears once they've actually moved away from it, never on a
//     step they simply haven't reached yet.
//   - untouched: a step ahead that hasn't been visited/left yet — empty
//     circle with an amber outline, no icon, nothing alarming.
function Stepper({
  steps,
  currentIndex,
  stepValidity,
  attemptedSteps,
  onSelect,
}: {
  steps: readonly { id: string; label: string }[];
  currentIndex: number;
  stepValidity: boolean[];
  attemptedSteps: Set<number>;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="mb-10 flex items-start rounded-2xl bg-[#f7f5f2] px-3 py-5 sm:px-6" aria-label="Application steps">
      {steps.map((s, i) => {
        const valid = stepValidity[i];
        const current = i === currentIndex;
        const attempted = attemptedSteps.has(i);
        const state: "complete" | "current" | "error" | "untouched" = valid
          ? "complete"
          : current
            ? "current"
            : attempted
              ? "error"
              : "untouched";

        const circleClass =
          state === "complete"
            ? "bg-mahalyred text-white shadow-sm"
            : state === "current"
              ? "bg-amber-400 text-white shadow-sm"
              : state === "error"
                ? "border border-red-300 bg-white text-red-500"
                : "border-2 border-amber-300 bg-white";

        const labelClass = current
          ? "text-ink"
          : state === "complete"
            ? "text-ink-soft/70"
            : state === "error"
              ? "text-red-500/70"
              : "text-ink-soft/40";

        const statusText =
          state === "complete"
            ? "complete"
            : state === "current"
              ? "in progress"
              : state === "error"
                ? "incomplete"
                : "not started";

        return (
          <li key={s.id} className="flex flex-1 flex-col items-center last:flex-none">
            <div className="flex w-full items-center">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={current ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${s.label}, ${statusText}${current ? ", current step" : ""}`}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${circleClass} ${
                  current ? "ring-2 ring-mahalyred/25 ring-offset-2" : ""
                } cursor-pointer`}
              >
                {state === "complete" ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : state === "error" ? (
                  <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                ) : null}
              </button>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 ${valid ? "bg-mahalyred/55" : "bg-stone-150"}`} />
              )}
            </div>
            <span className={`mt-2 max-w-[6.5rem] text-center text-[11px] font-medium leading-tight sm:text-[11.5px] ${labelClass}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeader({
  title,
  description,
  progress,
}: {
  title: string;
  description: string;
  progress: number;
}) {
  return (
    <div className="mb-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">{title}</h2>
        <span className="shrink-0 text-[12px] font-medium text-ink-soft/50">{progress}% Complete</span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft/70">{description}</p>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-mahalyred transition-all" style={{ width: `${progress}%` }} />
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

// One of Step 5's four review sections — a title, an Edit link back to the
// step it summarizes (never an inline-editable field), and its rows.
function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-stone-150 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12.5px] font-semibold text-mahalyred hover:underline"
        >
          Edit
        </button>
      </div>
      <div className="space-y-2 text-[13px] text-ink-soft/80">{children}</div>
    </div>
  );
}

// Turns a stored fixed-choice value (e.g. "own_production") back into its
// user-facing label (e.g. "We manufacture our products") for the review
// summary — falls back to the raw value so an unexpected/legacy value never
// renders blank.
function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

// Small red dot marking a required field's label — every field without one
// is optional. Purely visual (the actual required-ness still comes from
// each step's Zod schema; this prop just mirrors it into the UI).
function RequiredDot() {
  return <span aria-hidden="true" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />;
}

function Field({
  label,
  type = "text",
  inputMode,
  placeholder,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  const errorId = error ? `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-error` : undefined;
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}{required && <RequiredDot />}</span>
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`mt-1.5 w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
          error ? "border-red-300" : "border-stone-150"
        }`}
      />
      {error && (
        <span id={errorId} role="alert" className="mt-1 block text-[12px] text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

// A fixed, non-editable value (currently just Country, locked to Egypt) —
// shown disabled with an accessible info tooltip explaining why, instead of
// a normal editable Field.
function LockedField({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft/70">
        {label}
        <InfoTooltip text={tooltip} />
      </span>
      <input
        type="text"
        value={value}
        disabled
        aria-label={label}
        className="mt-1.5 w-full cursor-not-allowed rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5 text-[14px] text-ink-soft/70 outline-none"
      />
    </div>
  );
}

// Keyboard- and touch-friendly info tooltip — hover/focus for desktop, tap
// (via onClick toggle) for mobile where there is no hover state. onBlur
// closes it so it doesn't linger once focus moves elsewhere.
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="More information"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-stone-300 text-[10px] font-bold leading-none text-ink-soft/60 outline-none hover:border-ink/40 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1"
      >
        ?
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-[11.5px] font-normal leading-relaxed text-cream shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft/50">{children}</h3>
  );
}

// "Selectable cards" for Sales Channels — larger touch targets than the
// pill-style CheckboxGroup used elsewhere, per the design brief calling
// these out as cards specifically.
function ChannelCards({
  options,
  selected,
  onToggle,
  error,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              aria-pressed={active}
              className={`flex items-center justify-between gap-2 rounded-md border px-3.5 py-3 text-left text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                active
                  ? "border-ink bg-ink text-cream"
                  : "border-stone-200 text-ink-soft/80 hover:border-ink/40"
              }`}
            >
              {option}
              {active && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
            </button>
          );
        })}
      </div>
      {error && <span className="mt-1.5 block text-[12px] text-red-600">{error}</span>}
    </div>
  );
}

// Searchable, keyboard-navigable single-select from a fixed list of exact
// string values — used for City (27 Egyptian governorates) and, later,
// Step 4's governorate multi-select. Only ever calls onChange with a real
// option; typed text that doesn't match anything just filters the list, it
// is never itself submitted as the value.
function SearchableSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = "Search…",
  error,
  required,
}: {
  label: string;
  value: T | "";
  onChange: (value: T) => void;
  options: readonly T[];
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(option: T) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[activeIndex]) select(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <label className="block" htmlFor={baseId}>
        <span className="text-[12.5px] font-medium text-ink-soft/70">{label}{required && <RequiredDot />}</span>
        <input
          id={baseId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          value={open ? query : value}
          placeholder={placeholder}
          required={required}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          className={`mt-1.5 w-full rounded-md border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 ${
            error ? "border-red-300" : "border-stone-150"
          }`}
        />
      </label>
      {error && <span className="mt-1 block text-[12px] text-red-600">{error}</span>}
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-stone-150 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3.5 py-2 text-[13px] text-ink-soft/50">No matches</li>
          )}
          {filtered.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              onMouseDown={(e) => {
                e.preventDefault();
                select(option);
              }}
              className={`cursor-pointer px-3.5 py-2 text-[13px] ${
                i === activeIndex ? "bg-stone-100" : ""
              } ${option === value ? "font-semibold text-ink" : "text-ink-soft/80"}`}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
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
  maxLength,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  error?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink-soft/70">{label}{required && <RequiredDot />}</span>
        {maxLength !== undefined && (
          <span className="shrink-0 text-[11.5px] text-ink-soft/40">
            {value.length} / {maxLength}
          </span>
        )}
      </span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        maxLength={maxLength}
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
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}{required && <RequiredDot />}</span>
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

