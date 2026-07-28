"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  HelpCircle,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  APPLICATION_CATEGORIES,
  SALES_CHANNELS,
  TARGET_AUDIENCES,
  brandApplicationDataSchema,
  structuredErrors,
} from "@/lib/join/rebuildValidation";
import type {
  ApplicantAccountSnapshot,
  ApplicationDocumentType,
  BrandApplicationData,
  BrandApplicationDocumentRecord,
  BrandApplicationRecord,
} from "@/types";

const STEPS = [
  { title: "Contact Information", subtitle: "Tell us about you" },
  { title: "Brand Overview", subtitle: "Introduce your brand" },
  { title: "Business Verification", subtitle: "Legal information" },
  { title: "Products & Operations", subtitle: "How you work" },
  { title: "Review & Submit", subtitle: "Check and send" },
] as const;

const HELP = [
  {
    need: "We need your contact information to communicate with you about your application.",
    why: "This helps our team reach you if we need details or have questions about your brand.",
    tips: ["Use a valid business email", "Make sure your phone number is active", "Application contact details do not change your account"],
  },
  {
    need: "A clear picture of your brand, audience, story, current presence, and business size.",
    why: "It helps us understand where your brand belongs in Mahaly and how customers may discover it.",
    tips: ["Keep the short description under 160 characters", "Use complete social links", "Tell us what genuinely makes the brand different"],
  },
  {
    need: "Your current registration status and supporting business documents when available.",
    why: "Verification protects customers, brands, and the integrity of the marketplace.",
    tips: ["PDF, JPG and PNG are accepted", "Files remain private", "Do not upload personal identity documents unless requested"],
  },
  {
    need: "A practical view of your products, production, inventory, fulfillment, and returns readiness.",
    why: "These answers help us prepare onboarding without changing Mahaly's marketplace policies.",
    tips: ["Use realistic preparation times", "Price ranges are estimates only", "Selecting pre-order does not enable backorders"],
  },
  {
    need: "A final check that every required section is complete and accurate.",
    why: "Submitted applications are locked while our team reviews them.",
    tips: ["Open any incomplete section from its card", "Confirm all three agreements", "You will receive an application reference"],
  },
] as const;

const DOCUMENT_TYPES: { value: ApplicationDocumentType; label: string }[] = [
  { value: "commercial_registration", label: "Commercial Registration" },
  { value: "tax_card", label: "Tax Card" },
  { value: "trademark_certificate", label: "Trademark Certificate" },
  { value: "authorized_representative", label: "Authorized Representative Document" },
  { value: "other_supporting_document", label: "Other Supporting Document" },
];

type SaveState = "idle" | "saving" | "saved" | "failed";

function initialData(
  application: BrandApplicationRecord | null,
  account: ApplicantAccountSnapshot
): Partial<BrandApplicationData> {
  return {
    fullName: account.fullName ?? "",
    businessEmail: account.email ?? "",
    phone: account.phone ?? "",
    applicantRole: "founder",
    preferredContactMethod: "email",
    country: "Egypt",
    city: "Cairo",
    targetAudiences: [],
    salesChannels: [],
    socialLinks: {},
    productCategories: [],
    inventoryModels: [],
    shippingCoverage: [],
    returnsAccepted: true,
    exchangesAccepted: true,
    agreementAccurate: false,
    agreementAuthorized: false,
    agreementReview: false,
    ...(application?.applicationData ?? {}),
  };
}

export default function BrandApplicationExperience({
  initialApplication,
  accountSnapshot,
}: {
  initialApplication: BrandApplicationRecord | null;
  accountSnapshot: ApplicantAccountSnapshot;
}) {
  const [application, setApplication] = useState(initialApplication);
  const [data, setData] = useState<Partial<BrandApplicationData>>(() =>
    initialData(initialApplication, accountSnapshot)
  );
  const [step, setStep] = useState(Math.max(1, Math.min(initialApplication?.currentStep ?? 1, 5)));
  const [maxReached, setMaxReached] = useState(step);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<BrandApplicationDocumentRecord[]>([]);
  const [documentType, setDocumentType] = useState<ApplicationDocumentType>("commercial_registration");
  const [uploading, setUploading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applicantResponse, setApplicantResponse] = useState("");
  const hydrated = useRef(false);
  const requestSequence = useRef(0);
  const lockVersion = useRef(initialApplication?.lockVersion);

  useEffect(() => {
    fetch("/api/join/application/documents")
      .then((response) => response.json())
      .then((payload) => setDocuments(payload.documents ?? []))
      .catch(() => undefined);
    hydrated.current = true;
  }, []);

  const save = useCallback(
    async (nextStep = step) => {
      const sequence = ++requestSequence.current;
      setSaveState("saving");
      setSaveError("");
      const response = await fetch("/api/join/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationData: data,
          currentStep: nextStep,
          lockVersion: lockVersion.current,
        }),
      });
      const payload = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok) {
        setSaveState("failed");
        setSaveError(payload.error ?? "We could not save your progress.");
        return;
      }
      lockVersion.current = payload.application.lockVersion;
      setApplication(payload.application);
      setSaveState("saved");
    },
    [data, step]
  );

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => void save(step), 900);
    return () => window.clearTimeout(timer);
  }, [data, step, save]);

  const set = <K extends keyof BrandApplicationData>(key: K, value: BrandApplicationData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const stepErrors = (target: number) => {
    const parsed = brandApplicationDataSchema.safeParse(data);
    if (parsed.success) return {};
    return Object.fromEntries(
      structuredErrors(parsed.error)
        .filter((error) => error.step === target)
        .map((error) => [error.field, error.message])
    );
  };

  const goNext = async () => {
    const found = stepErrors(step);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    const next = Math.min(5, step + 1);
    await save(next);
    setStep(next);
    setMaxReached((value) => Math.max(value, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    const parsed = brandApplicationDataSchema.safeParse(data);
    if (!parsed.success) {
      const validation = structuredErrors(parsed.error);
      setErrors(Object.fromEntries(validation.map((error) => [error.field, error.message])));
      setConfirmSubmit(false);
      setStep(validation[0]?.step ?? 1);
      return;
    }
    setSubmitting(true);
    const response = await fetch("/api/join/application/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationData: parsed.data,
        currentStep: 5,
        lockVersion: lockVersion.current,
        applicantResponse,
      }),
    });
    const payload = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setSaveError(payload.error ?? "Submission failed.");
      setConfirmSubmit(false);
      return;
    }
    setApplication(payload.application);
  };

  if (application && !["draft", "changes_requested"].includes(application.status)) {
    return <ApplicationStatus application={application} />;
  }

  const uploadDocument = async (file: File) => {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("documentType", documentType);
    const response = await fetch("/api/join/application/documents", { method: "POST", body });
    const payload = await response.json();
    setUploading(false);
    if (!response.ok) {
      setSaveError(payload.error ?? "Upload failed.");
      return;
    }
    setDocuments((current) => [...current, payload.document]);
  };

  const removeDocument = async (id: string) => {
    const response = await fetch(`/api/join/application/documents?documentId=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (response.ok) setDocuments((current) => current.filter((document) => document.id !== id));
  };

  const progress = step * 20;
  const help = HELP[step - 1];
  return (
    <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 bg-[#fdfcfb] lg:grid-cols-[285px_minmax(0,1fr)] xl:grid-cols-[305px_minmax(560px,1fr)_390px]">
      <aside className="border-b border-stone-150 bg-white/70 px-5 py-5 lg:border-b-0 lg:border-r lg:px-8 lg:py-14">
        <nav aria-label="Application progress">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-0">
            {STEPS.map((item, index) => {
              const number = index + 1;
              const active = number === step;
              const complete = number < step;
              const available = number <= maxReached;
              return (
                <li key={item.title} className="relative min-w-[190px] lg:min-w-0 lg:pb-10">
                  {index < STEPS.length - 1 && (
                    <span className="absolute left-[13px] top-8 hidden h-[calc(100%-18px)] w-px bg-stone-200 lg:block" aria-hidden />
                  )}
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => available && setStep(number)}
                    aria-current={active ? "step" : undefined}
                    className="group flex w-full items-start gap-4 text-left disabled:cursor-default"
                  >
                    <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      active ? "border-mahalyred bg-mahalyred text-white" : complete ? "border-ink bg-ink text-white" : "border-stone-250 bg-white text-ink-soft"
                    }`}>
                      {complete ? <Check className="h-3.5 w-3.5" /> : number}
                    </span>
                    <span>
                      <span className={`block text-[13px] font-semibold ${active ? "text-ink" : "text-ink-soft/75"}`}>{item.title}</span>
                      <span className="mt-1 block text-[12px] text-ink-soft/50">{item.subtitle}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-12 xl:px-12">
        <div className="mx-auto max-w-[760px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-soft/55">Join Mahaly</p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-ink sm:text-4xl">Apply to sell on Mahaly</h1>
              <p className="mt-3 text-[14px] leading-6 text-ink-soft/65">We review every application carefully to maintain the quality of our marketplace.</p>
            </div>
            <button type="button" onClick={() => setShowHelp((value) => !value)} className="flex shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs xl:hidden">
              <HelpCircle className="h-4 w-4" /> Help
            </button>
          </div>

          {application?.status === "changes_requested" && (
            <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-semibold">Mahaly requested more information</p>
              <p className="mt-2 leading-6">{application.applicantVisibleMessage || application.changesRequestedMessage}</p>
              {application.requestedFields?.length ? (
                <p className="mt-3 text-xs">Requested fields: {application.requestedFields.join(", ")}</p>
              ) : null}
              <TextArea label="Your response (optional)" value={applicantResponse} onChange={setApplicantResponse} />
            </div>
          )}

          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_18px_60px_rgba(45,34,26,.035)] sm:p-7">
            <div className="mb-7 border-b border-stone-150 pb-5">
              <p className="text-xs font-semibold text-mahalyred">Step {step} of 5</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">{STEPS[step - 1].title}</h2>
              <p className="mt-2 text-sm text-ink-soft/60">{stepSubtitle(step)}</p>
            </div>

            {step === 1 && <ContactStep data={data} set={set} errors={errors} />}
            {step === 2 && <OverviewStep data={data} set={set} errors={errors} />}
            {step === 3 && (
              <VerificationStep
                data={data}
                set={set}
                errors={errors}
                documents={documents}
                documentType={documentType}
                setDocumentType={setDocumentType}
                uploadDocument={uploadDocument}
                removeDocument={removeDocument}
                uploading={uploading}
                canUpload={Boolean(application)}
              />
            )}
            {step === 4 && <OperationsStep data={data} set={set} errors={errors} />}
            {step === 5 && <ReviewStep data={data} documents={documents} onEdit={setStep} set={set} />}

            {saveError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-stone-150 pt-5">
              <button type="button" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))} className="inline-flex h-11 items-center gap-2 rounded-lg border border-stone-200 px-5 text-sm font-semibold disabled:opacity-35">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex items-center gap-3">
                <SaveIndicator state={saveState} lastSaved={application?.lastSavedAt} />
                {step < 5 ? (
                  <button type="button" onClick={() => void goNext()} className="inline-flex h-11 items-center gap-3 rounded-lg bg-[#111115] px-6 text-sm font-semibold text-white">
                    Save and continue <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirmSubmit(true)} className="inline-flex h-11 items-center gap-3 rounded-lg bg-mahalyred px-6 text-sm font-semibold text-white">
                    Submit application <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-ink-soft/55">
              <LockKeyhole className="h-3.5 w-3.5" /> Your information is used only to review and communicate about this application.
            </p>
          </section>
        </div>
      </main>

      <aside className={`${showHelp ? "block" : "hidden"} border-l border-stone-150 bg-[#faf7f3] px-5 py-7 xl:block xl:px-7 xl:py-12`}>
        <div className="sticky top-6 mx-auto max-w-md rounded-2xl border border-[#e8e0d8] bg-white/70 p-6">
          <div className="flex items-center justify-between"><h2 className="text-base font-bold">Application progress</h2><span className="text-xs text-ink-soft/60">{progress}% complete</span></div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e8e2dc]"><div className="h-full rounded-full bg-mahalyred transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-4 text-xs text-ink-soft/65">Step {step} of 5</p>
          <HelpBlock icon={FileText} title="What we need" body={help.need} />
          <HelpBlock icon={ShieldCheck} title="Why we ask this" body={help.why} />
          <div className="border-t border-stone-150 py-5">
            <div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4eee7]"><Lightbulb className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold">Tips</h3><ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-5 text-ink-soft/65">{help.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div></div>
          </div>
          <div className="rounded-xl bg-[#f5efe8] p-4"><p className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4" /> You can save and come back anytime.</p><SaveIndicator state={saveState} lastSaved={application?.lastSavedAt} /></div>
          <p className="mt-5 flex items-center gap-2 text-xs text-ink-soft/60"><ShieldCheck className="h-4 w-4" /> Secure, private, and reviewed in 2–5 business days.</p>
        </div>
      </aside>

      {confirmSubmit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="submit-title" className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-mahalyred"><FileText className="h-5 w-5" /></div>
            <h2 id="submit-title" className="mt-5 text-xl font-bold">Submit your application?</h2>
            <p className="mt-3 text-sm leading-6 text-ink-soft/65">You will not be able to edit the application while it is under review unless Mahaly requests additional information.</p>
            <div className="mt-7 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmSubmit(false)} className="rounded-lg border border-stone-200 px-5 py-2.5 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={submitting} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-lg bg-mahalyred px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stepSubtitle(step: number) {
  return [
    "Tell us who we should contact about this application.",
    "Tell us about your brand, audience, and current presence.",
    "Tell us about your business registration and provide supporting documents when available.",
    "Help us understand your products, inventory, preparation, and delivery operations.",
    "Review your information carefully before submitting your application.",
  ][step - 1];
}

type StepProps = {
  data: Partial<BrandApplicationData>;
  set: <K extends keyof BrandApplicationData>(key: K, value: BrandApplicationData[K]) => void;
  errors: Record<string, string>;
};

function ContactStep({ data, set, errors }: StepProps) {
  return <div className="space-y-6">
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" required value={data.fullName} error={errors.fullName} onChange={(value) => set("fullName", value)} />
      <Field label="Business email" required type="email" value={data.businessEmail} error={errors.businessEmail} onChange={(value) => set("businessEmail", value)} />
      <Field label="Phone number" required type="tel" value={data.phone} error={errors.phone} onChange={(value) => set("phone", value)} />
      <Select label="Your role" required value={data.applicantRole} error={errors.applicantRole} onChange={(value) => set("applicantRole", value)} options={[
        ["founder", "Founder"], ["co_founder", "Co-Founder"], ["owner", "Owner"], ["brand_manager", "Brand Manager"], ["operations_manager", "Operations Manager"], ["authorized_representative", "Authorized Representative"], ["other", "Other"],
      ]} />
    </div>
    {data.applicantRole === "other" && <Field label="Specify your role" required value={data.applicantRoleOther} error={errors.applicantRoleOther} onChange={(value) => set("applicantRoleOther", value)} />}
    <div><Label>Preferred contact method</Label><div className="mt-2 flex flex-wrap gap-3">{[["email", Mail, "Email"], ["phone", Phone, "Phone"], ["whatsapp", Phone, "WhatsApp"]].map(([value, Icon, label]) => <ChoiceButton key={value as string} active={data.preferredContactMethod === value} onClick={() => set("preferredContactMethod", value as "email")}><Icon className="h-4 w-4" />{label as string}</ChoiceButton>)}</div></div>
  </div>;
}

function OverviewStep({ data, set, errors }: StepProps) {
  return <div className="space-y-8">
    <SectionTitle title="Brand identity" />
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Brand name" required value={data.brandName} error={errors.brandName} onChange={(value) => set("brandName", value)} />
      <Field label="Brand name in Arabic (optional)" dir="rtl" value={data.brandNameAr} onChange={(value) => set("brandNameAr", value)} />
      <Select label="Primary category" required value={data.primaryCategory} error={errors.primaryCategory} onChange={(value) => set("primaryCategory", value)} options={APPLICATION_CATEGORIES.map((item) => [item, item])} />
      <Field label="Founded year" required type="number" value={data.foundedYear} onChange={(value) => set("foundedYear", Number(value))} />
      <Field label="Country" required value={data.country} onChange={(value) => set("country", value)} />
      <Field label="City" required value={data.city} onChange={(value) => set("city", value)} />
    </div>
    <Pills label="Target audiences" required options={TARGET_AUDIENCES} values={data.targetAudiences ?? []} onChange={(value) => set("targetAudiences", value)} error={errors.targetAudiences} />
    <SectionTitle title="Brand story" />
    <TextArea label="Short brand description" required maxLength={160} value={data.shortDescription} error={errors.shortDescription} onChange={(value) => set("shortDescription", value)} />
    <TextArea label="Full brand story" required maxLength={1500} rows={6} value={data.fullBrandStory} error={errors.fullBrandStory} onChange={(value) => set("fullBrandStory", value)} />
    <TextArea label="What makes your brand different?" required maxLength={800} rows={4} value={data.brandDifference} error={errors.brandDifference} onChange={(value) => set("brandDifference", value)} />
    <SectionTitle title="Sales channels & online presence" />
    <Pills label="Where do you currently sell?" required options={SALES_CHANNELS} values={data.salesChannels ?? []} onChange={(value) => set("salesChannels", value)} error={errors.salesChannels} />
    {(data.salesChannels ?? []).filter((channel) => !["Physical Store", "Pop-up Markets"].includes(channel)).map((channel) => <Field key={channel} label={`${channel} URL or handle`} value={data.socialLinks?.[channel]?.url ?? ""} onChange={(value) => set("socialLinks", { ...(data.socialLinks ?? {}), [channel]: { ...(data.socialLinks?.[channel] ?? {}), url: value } })} />)}
    <SectionTitle title="Business size" />
    <div className="grid gap-5 sm:grid-cols-2">
      <Select label="Approximate product count" required value={data.productCountRange} onChange={(value) => set("productCountRange", value)} options={[["1_20","1–20"],["21_50","21–50"],["51_100","51–100"],["101_250","101–250"],["251_500","251–500"],["500_plus","500+"]]} />
      <Select label="Approximate monthly orders" required value={data.monthlyOrdersRange} onChange={(value) => set("monthlyOrdersRange", value)} options={[["not_selling","Not selling yet"],["1_20","1–20"],["21_50","21–50"],["51_100","51–100"],["101_250","101–250"],["251_500","251–500"],["500_plus","500+"]]} />
      <Select label="Current team size" required value={data.teamSizeRange} onChange={(value) => set("teamSizeRange", value)} options={[["1","1"],["2_5","2–5"],["6_10","6–10"],["11_25","11–25"],["25_plus","25+"]]} />
      <Select label="Monthly sales range (optional)" value={data.monthlySalesRange} onChange={(value) => set("monthlySalesRange", value)} options={[["prefer_not","Prefer not to say"],["under_25k","Under EGP 25k"],["25k_100k","EGP 25k–100k"],["100k_500k","EGP 100k–500k"],["500k_plus","EGP 500k+"]]} />
    </div>
  </div>;
}

function VerificationStep({ data, set, errors, documents, documentType, setDocumentType, uploadDocument, removeDocument, uploading, canUpload }: StepProps & {
  documents: BrandApplicationDocumentRecord[]; documentType: ApplicationDocumentType; setDocumentType: (value: ApplicationDocumentType) => void; uploadDocument: (file: File) => void; removeDocument: (id: string) => void; uploading: boolean; canUpload: boolean;
}) {
  const registered = ["registered_company", "registered_sole_proprietorship"].includes(data.businessType ?? "");
  return <div className="space-y-7">
    <Select label="Business type" required value={data.businessType} error={errors.businessType} onChange={(value) => set("businessType", value)} options={[["registered_company","Registered Company"],["registered_sole_proprietorship","Registered Sole Proprietorship"],["unregistered_individual","Individual Business Without Registration"],["registration_in_progress","Registration in Progress"],["other","Other"]]} />
    {registered && <div className="grid gap-5 sm:grid-cols-2"><Field label="Legal business name" required value={data.legalBusinessName} error={errors.legalBusinessName} onChange={(value) => set("legalBusinessName", value)} /><Field label="Commercial registration number" required value={data.commercialRegistrationNumber} onChange={(value) => set("commercialRegistrationNumber", value)} /><Field label="Tax registration number (optional)" value={data.taxRegistrationNumber} onChange={(value) => set("taxRegistrationNumber", value)} /><Field label="Registration country" required value={data.registrationCountry} onChange={(value) => set("registrationCountry", value)} /></div>}
    {data.businessType === "unregistered_individual" && <Field label="Operating name (optional)" value={data.operatingName} onChange={(value) => set("operatingName", value)} />}
    {data.businessType === "registration_in_progress" && <Field label="Expected completion date (optional)" type="date" value={data.registrationExpectedDate} onChange={(value) => set("registrationExpectedDate", value)} />}
    <div className="rounded-xl border border-stone-200 bg-[#fbfaf8] p-5"><h3 className="font-semibold">Supporting documents</h3><p className="mt-1 text-xs leading-5 text-ink-soft/60">Private files only. PDF, JPG, JPEG or PNG, up to 10MB.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><Select label="Document type" value={documentType} onChange={(value) => setDocumentType(value as ApplicationDocumentType)} options={DOCUMENT_TYPES.map((item) => [item.value,item.label])} /><label className={`mt-auto inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white ${!canUpload || uploading ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-4 w-4" />{uploading ? "Uploading…" : "Upload file"}<input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => event.target.files?.[0] && uploadDocument(event.target.files[0])} /></label></div>{!canUpload && <p className="mt-3 text-xs text-amber-700">Save this step once before uploading a document.</p>}<div className="mt-4 space-y-2">{documents.map((document) => <div key={document.id} className="flex items-center justify-between rounded-lg border bg-white p-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-4 w-4 shrink-0 text-mahalyred" /><div className="min-w-0"><p className="truncate text-sm font-medium">{document.fileName}</p><p className="text-[11px] text-ink-soft/50">{DOCUMENT_TYPES.find((item) => item.value === document.documentType)?.label ?? "Supporting document"} · Uploaded</p></div></div><button type="button" onClick={() => removeDocument(document.id)} className="text-xs font-semibold text-red-600">Remove</button></div>)}</div></div>
  </div>;
}

function OperationsStep({ data, set, errors }: StepProps) {
  return <div className="space-y-8">
    <SectionTitle title="Product offering" />
    <Pills label="Main product categories" required options={APPLICATION_CATEGORIES} values={data.productCategories ?? []} onChange={(value) => set("productCategories", value)} error={errors.productCategories} />
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Typical minimum price (EGP)" required type="number" value={data.typicalMinimumPrice} error={errors.typicalMinimumPrice} onChange={(value) => set("typicalMinimumPrice", Number(value))} /><Field label="Typical maximum price (EGP)" required type="number" value={data.typicalMaximumPrice} error={errors.typicalMaximumPrice} onChange={(value) => set("typicalMaximumPrice", Number(value))} /><Select label="Do products have variants?" required value={data.variantReadiness} onChange={(value) => set("variantReadiness", value)} options={[["none","No Variants"],["size","Size Only"],["color","Color Only"],["size_and_color","Size and Color"],["other","Other Options"]]} /></div>
    <SectionTitle title="Manufacturing" />
    <div className="grid gap-5 sm:grid-cols-2"><Select label="Manufacturing model" required value={data.manufacturingModel} error={errors.manufacturingModel} onChange={(value) => set("manufacturingModel", value)} options={[["in_house","Manufactured In-House"],["local_workshop","Local Workshop"],["third_party","Third-Party Manufacturer"],["imported_finished","Imported Finished Products"],["mixed","Mixed Model"],["made_to_order","Made to Order"]]} /><Field label="Country of manufacturing" value={data.manufacturingCountry} onChange={(value) => set("manufacturingCountry", value)} /><Field label="Typical production lead time" value={data.productionLeadTime} onChange={(value) => set("productionLeadTime", value)} /></div>
    <SectionTitle title="Inventory & fulfillment" />
    <Pills label="Inventory model" required options={["in_stock","made_to_order","pre_order","limited_drops","seasonal","consignment"]} labels={["In Stock","Made to Order","Pre-order","Limited Drops","Seasonal Collections","Consignment"]} values={data.inventoryModels ?? []} onChange={(value) => set("inventoryModels", value)} />
    <div className="grid gap-5 sm:grid-cols-2"><Select label="Where is inventory stored?" required value={data.inventoryStorage} onChange={(value) => set("inventoryStorage", value)} options={[["brand_studio","Brand Studio"],["warehouse","Warehouse"],["physical_store","Physical Store"],["third_party","Third-Party Fulfillment Center"],["multiple","Multiple Locations"],["other","Other"]]} /><Select label="Who prepares orders?" required value={data.orderPreparation} onChange={(value) => set("orderPreparation", value)} options={[["brand_team","Brand Team"],["warehouse_team","Warehouse Team"],["third_party","Third-Party Fulfillment Provider"],["other","Other"]]} /><Select label="Can couriers collect?" required value={data.courierPickup} onChange={(value) => set("courierPickup", value)} options={[["yes","Yes"],["no","No"],["sometimes","Sometimes"]]} /><Select label="Average preparation time" required value={data.preparationTime} onChange={(value) => set("preparationTime", value)} options={[["same_day","Same Day"],["1_day","1 Business Day"],["2_3_days","2–3 Business Days"],["4_7_days","4–7 Business Days"],["more_7_days","More Than 7 Days"],["varies","Varies by Product"]]} /></div>
    <Pills label="Shipping coverage" required options={["cairo_giza","alexandria","major_cities","nationwide","selected_areas","international"]} labels={["Cairo & Giza","Alexandria","Major Cities","Nationwide Egypt","Selected Areas","International"]} values={data.shippingCoverage ?? []} onChange={(value) => set("shippingCoverage", value)} />
    <Field label="Current shipping provider (optional)" value={data.shippingProvider} onChange={(value) => set("shippingProvider", value)} />
    <SectionTitle title="Returns & exchanges" /><div className="grid gap-5 sm:grid-cols-2"><BooleanChoice label="Currently accepts returns" value={data.returnsAccepted} onChange={(value) => set("returnsAccepted", value)} /><BooleanChoice label="Currently accepts exchanges" value={data.exchangesAccepted} onChange={(value) => set("exchangesAccepted", value)} /><Field label="Current return window" required value={data.returnWindow} onChange={(value) => set("returnWindow", value)} /><Field label="Non-returnable categories (optional)" value={data.nonReturnableCategories} onChange={(value) => set("nonReturnableCategories", value)} /></div><p className="rounded-xl bg-[#f7f2ec] p-4 text-xs leading-5 text-ink-soft/65">Mahaly&apos;s marketplace policies will apply after onboarding. These answers are used only for readiness evaluation.</p>
  </div>;
}

function ReviewStep({ data, documents, onEdit, set }: Omit<StepProps, "errors"> & { documents: BrandApplicationDocumentRecord[]; onEdit: (step: number) => void }) {
  const cards = [
    { title: "Contact Information", step: 1, summary: `${data.fullName || "Missing name"} · ${data.businessEmail || "Missing email"}`, complete: Boolean(data.fullName && data.businessEmail && data.phone && data.preferredContactMethod) },
    { title: "Brand Overview", step: 2, summary: `${data.brandName || "Missing brand"} · ${data.primaryCategory || "Missing category"}`, complete: Boolean(data.brandName && data.primaryCategory && data.shortDescription && data.fullBrandStory) },
    { title: "Business Verification", step: 3, summary: `${data.businessType?.replaceAll("_"," ") || "Missing business type"} · ${documents.length} document(s)`, complete: Boolean(data.businessType) },
    { title: "Products & Operations", step: 4, summary: `${data.productCategories?.join(", ") || "Missing categories"} · ${data.preparationTime?.replaceAll("_"," ") || "Missing preparation time"}`, complete: Boolean(data.productCategories?.length && data.manufacturingModel && data.inventoryModels?.length && data.shippingCoverage?.length) },
  ];
  return <div className="space-y-5">{cards.map((card) => <div key={card.title} className="rounded-xl border border-stone-200 p-5"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 font-semibold">{card.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}{card.title}</p><p className="mt-2 text-sm text-ink-soft/60">{card.summary}</p></div><button type="button" onClick={() => onEdit(card.step)} className="text-xs font-semibold text-mahalyred">Edit</button></div></div>)}<div className="rounded-xl bg-[#faf7f3] p-5"><h3 className="font-semibold">Application checklist</h3><div className="mt-4 space-y-3"><Agreement checked={Boolean(data.agreementAccurate)} onChange={(value) => set("agreementAccurate", value)}>I confirm the provided information is accurate.</Agreement><Agreement checked={Boolean(data.agreementAuthorized)} onChange={(value) => set("agreementAuthorized", value)}>I confirm that I am authorized to represent this brand.</Agreement><Agreement checked={Boolean(data.agreementReview)} onChange={(value) => set("agreementReview", value)}>I agree to Mahaly&apos;s application review process and privacy policy.</Agreement></div></div></div>;
}

function ApplicationStatus({ application }: { application: BrandApplicationRecord }) {
  const approved = ["approved", "approved_pending_creation", "converted_to_brand"].includes(application.status);
  const rejected = application.status === "rejected";
  const timeline = ["Submitted", "Initial Review", "Verification", "Final Decision"];
  const active = application.status === "submitted" ? 1 : ["under_review","resubmitted"].includes(application.status) ? 2 : approved || rejected ? 4 : 1;
  return <div className="min-h-[calc(100vh-72px)] bg-[#faf8f5] px-5 py-12"><div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-7 sm:p-10"><div className={`flex h-12 w-12 items-center justify-center rounded-full ${rejected ? "bg-red-50 text-red-600" : approved ? "bg-emerald-50 text-emerald-700" : "bg-[#f5eee7] text-mahalyred"}`}>{approved ? <CheckCircle2 /> : rejected ? <AlertCircle /> : <Clock3 />}</div><h1 className="mt-5 text-3xl font-bold">{approved ? "Application approved" : rejected ? "Application decision" : "Your application is under review"}</h1><p className="mt-3 text-sm leading-6 text-ink-soft/65">{application.applicantVisibleMessage || application.rejectionReason || "We are reviewing your information and will contact you if anything else is needed."}</p><div className="mt-7 grid gap-3 rounded-xl bg-[#faf7f3] p-5 sm:grid-cols-3"><Stat label="Application reference" value={application.referenceNumber ?? application.id.slice(0, 8).toUpperCase()} /><Stat label="Submitted" value={new Date(application.submittedAt ?? application.createdAt).toLocaleDateString()} /><Stat label="Estimated review" value="2–5 business days" /></div><ol className="mt-8 grid gap-4 sm:grid-cols-4">{timeline.map((item,index) => <li key={item} className="flex items-center gap-3 sm:block"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${index < active ? "bg-mahalyred text-white" : "bg-stone-100 text-ink-soft/50"}`}>{index < active ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><p className="mt-2 text-xs font-semibold">{item}</p></li>)}</ol>{approved && <Link href="/brand-portal" className="mt-8 inline-flex rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-white">Complete Your Brand Setup</Link>}<Link href="/" className="mt-5 block text-sm text-ink-soft/60">Back to Mahaly</Link></div></div>;
}

function Field({ label, value, onChange, error, required, type = "text", dir }: { label: string; value?: string | number; onChange: (value: string) => void; error?: string; required?: boolean; type?: string; dir?: "rtl" }) { return <label className="block"><Label>{label}{required && <span className="text-mahalyred"> *</span>}</Label><input dir={dir} type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className={`mt-1.5 h-12 w-full rounded-lg border bg-white px-4 text-sm outline-none transition ${error ? "border-red-400 focus:ring-2 focus:ring-red-100" : "border-stone-200 focus:border-ink/35 focus:ring-2 focus:ring-stone-100"}`} />{error && <span className="mt-1.5 block text-xs text-red-600">{error}</span>}</label>; }
function Select({ label, value, onChange, options, required, error }: { label: string; value?: string; onChange: (value: string) => void; options: readonly (readonly [string,string])[]; required?: boolean; error?: string }) { return <label className="block"><Label>{label}{required && <span className="text-mahalyred"> *</span>}</Label><div className="relative mt-1.5"><select value={value ?? ""} onChange={(event) => onChange(event.target.value)} className={`h-12 w-full appearance-none rounded-lg border bg-white px-4 pr-9 text-sm outline-none ${error ? "border-red-400" : "border-stone-200"}`}><option value="">Select an option</option>{options.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-ink-soft/50" /></div>{error && <span className="mt-1.5 block text-xs text-red-600">{error}</span>}</label>; }
function TextArea({ label, value, onChange, error, required, maxLength, rows = 4 }: { label: string; value?: string; onChange: (value: string) => void; error?: string; required?: boolean; maxLength?: number; rows?: number }) { return <label className="block"><div className="flex justify-between gap-3"><Label>{label}{required && <span className="text-mahalyred"> *</span>}</Label>{maxLength && <span className="text-[11px] text-ink-soft/45">{value?.length ?? 0}/{maxLength}</span>}</div><textarea rows={rows} maxLength={maxLength} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className={`mt-1.5 w-full resize-y rounded-lg border bg-white px-4 py-3 text-sm leading-6 outline-none ${error ? "border-red-400" : "border-stone-200"}`} />{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>; }
function Pills<T extends string>({ label, options, labels, values, onChange, required, error }: { label: string; options: readonly T[]; labels?: readonly string[]; values: T[]; onChange: (value: T[]) => void; required?: boolean; error?: string }) { return <div><Label>{label}{required && <span className="text-mahalyred"> *</span>}</Label><div className="mt-2 flex flex-wrap gap-2">{options.map((option,index) => <ChoiceButton key={option} active={values.includes(option)} onClick={() => onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option])}>{labels?.[index] ?? option}</ChoiceButton>)}</div>{error && <span className="mt-1.5 block text-xs text-red-600">{error}</span>}</div>; }
function BooleanChoice({ label, value, onChange }: { label: string; value?: boolean; onChange: (value: boolean) => void }) { return <div><Label>{label}</Label><div className="mt-2 flex gap-2"><ChoiceButton active={value === true} onClick={() => onChange(true)}>Yes</ChoiceButton><ChoiceButton active={value === false} onClick={() => onChange(false)}>No</ChoiceButton></div></div>; }
function ChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition ${active ? "border-mahalyred bg-red-50 text-mahalyred" : "border-stone-200 bg-white text-ink-soft/70 hover:border-ink/25"}`}>{children}</button>; }
function Label({ children }: { children: React.ReactNode }) { return <span className="text-[12px] font-semibold text-ink-soft/70">{children}</span>; }
function SectionTitle({ title }: { title: string }) { return <div className="border-b border-stone-150 pb-3"><h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">{title}</h3></div>; }
function Agreement({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) { return <label className="flex cursor-pointer items-start gap-3 text-sm leading-5"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c72930]" /><span>{children}</span></label>; }
function SaveIndicator({ state, lastSaved }: { state: SaveState; lastSaved?: string }) { const copy = state === "saving" ? "Saving…" : state === "failed" ? "Save failed" : state === "saved" || lastSaved ? `Saved${lastSaved ? ` ${new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Not saved yet"; return <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-[11px] ${state === "failed" ? "text-red-600" : "text-ink-soft/55"}`}>{state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : state === "saved" || lastSaved ? <Check className="h-3 w-3 text-emerald-600" /> : <Save className="h-3 w-3" />}{copy}</span>; }
function HelpBlock({ icon: Icon, title, body }: { icon: typeof FileText; title: string; body: string }) { return <div className="mt-5 border-t border-stone-150 py-5"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4eee7]"><Icon className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-ink-soft/65">{body}</p></div></div></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-ink-soft/50">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
