import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { getApplicationForAdmin } from "@/lib/data/admin";
import { getApplicationDocuments, getApplicationStatusHistory } from "@/lib/join/applicationService";
import { APPLICATION_STATUS_LABELS, applicationStatusBadgeClass } from "@/lib/admin/statuses";
import {
  BUSINESS_SIZE_OPTIONS,
  FULFILLMENT_RESPONSIBILITY_OPTIONS,
  LEGAL_STATUS_OPTIONS,
  PREPARATION_TIME_OPTIONS,
  RETURNS_POLICY_OPTIONS,
} from "@/lib/join/constants";
import ApplicationTransitionPanel from "@/components/admin/ApplicationTransitionPanel";
import ApplicationDeletePanel from "@/components/admin/ApplicationDeletePanel";
import ApplicationAdminNotes from "@/components/admin/ApplicationAdminNotes";
import ApplicationDocumentsList from "@/components/admin/ApplicationDocumentsList";
import ApproveAndCreateBrandButton from "@/components/admin/ApproveAndCreateBrandButton";
import { formatDateTime } from "@/lib/format";

export default async function AdminApplicationDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const application = await getApplicationForAdmin(params.id);
  if (!application) notFound();

  const [documents, history] = await Promise.all([
    getApplicationDocuments(application.id),
    getApplicationStatusHistory(application.id),
  ]);

  const snapshot = application.applicantAccountSnapshot;
  const legalStatusLabel = LEGAL_STATUS_OPTIONS.find((o) => o.value === application.legalStatus)?.label;

  // Mirrors the applicant-facing form's own required/optional rules
  // (lib/join/validation.ts) so this review reads as a match for what the
  // applicant actually saw, not a stale snapshot of fields the form no
  // longer collects.
  const roleMissing =
    !application.applicantRole || (application.applicantRole === "other" && !application.applicantRoleOther);
  const legalStatusMissing =
    !application.legalStatus || (application.legalStatus === "other" && !application.legalStatusOther);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">
            {application.brandName}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft/60">
            Submitted {formatDateTime(application.submittedAt ?? application.createdAt)}
            {!application.applicantUserId && " · Legacy submission (pre-auth)"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${applicationStatusBadgeClass(application.status)}`}
          >
            {APPLICATION_STATUS_LABELS[application.status]}
          </span>
          {(application.status === "approved" || application.status === "approved_pending_creation") &&
            !application.approvedBrandId && (
              <div className="flex flex-col items-end gap-1.5">
                <ApproveAndCreateBrandButton applicationId={application.id} />
                <Link
                  href={`/admin/brands/new?applicationId=${application.id}`}
                  className="text-[11.5px] font-semibold text-ink-soft/50 hover:text-ink-soft/80 hover:underline"
                >
                  Or create manually
                </Link>
              </div>
            )}
          {application.approvedBrandId && (
            <Link
              href={`/brands/${application.approvedBrandId}`}
              className="text-[12.5px] font-semibold text-mahalyred hover:underline"
            >
              View brand →
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section title="Application record">
            <Field label="Reference" value={application.referenceNumber ?? application.id} />
            <Field label="Schema version" value={String(application.schemaVersion ?? 1)} />
            <Field
              label="Requested fields"
              value={application.requestedFields?.join(", ") || "—"}
            />
          </Section>
          {snapshot && (
            <Section title="Account vs. application info">
              <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
                What the signed-in account looked like when this was submitted, next to what the
                applicant typed in the form. A mismatch isn&apos;t necessarily a problem — people
                apply on behalf of a brand under a different name or contact.
              </p>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <DiffRow label="Name" account={snapshot.fullName} applied={application.founderName} />
                <DiffRow label="Email" account={snapshot.email} applied={application.email} />
                <DiffRow label="Phone" account={snapshot.phone} applied={application.phone} />
              </div>
            </Section>
          )}

          {/* The four sections below mirror the applicant-facing form's own
              steps (components/join/ApplyBrandForm.tsx) exactly — same
              fields, same order, same required/optional split — so this
              page never drifts from what the applicant actually saw.
              ReviewField color-codes each required field: green check when
              filled, red "Missing" when not. Optional fields never get that
              treatment — an empty optional field is just "—", not a problem. */}
          <Section title="About you">
            <ReviewField label="Full name" value={application.founderName} required />
            <ReviewField label="Business email" value={application.email} required />
            <ReviewField label="Phone number" value={application.phone} required />
            <ReviewField
              label="Role"
              value={
                application.applicantRole === "other"
                  ? application.applicantRoleOther
                    ? `Other — ${application.applicantRoleOther}`
                    : ""
                  : application.applicantRole ?? ""
              }
              required
              missing={roleMissing}
            />
          </Section>

          <Section title="Your brand">
            <ReviewField label="Brand name (English)" value={application.brandNameEn ?? ""} required />
            <ReviewField label="Brand name (Arabic)" value={application.brandNameAr ?? ""} required />
            <ReviewField
              label="Category"
              value={[application.productCategory, ...application.additionalCategories].filter(Boolean).join(", ")}
              required
              missing={!application.productCategory}
            />
            <ReviewField label="Country" value={application.country ?? "Egypt"} />
            <ReviewField label="City" value={application.city ?? ""} required />
            <ReviewField label="Founded" value={application.foundingYear?.toString() ?? ""} required />
            <ReviewField label="Brand story" value={application.brandStory} />
            <ReviewField
              label="Sales channels"
              value={application.salesChannelsList.join(", ")}
              required
              missing={application.salesChannelsList.length === 0}
            />
            {Object.entries(application.salesChannelLinks ?? {})
              .filter(([, link]) => link)
              .map(([channel, link]) => (
                <ReviewField key={channel} label={`${channel} link`} value={link} />
              ))}
            <ReviewField
              label="Approx. product count"
              value={labelForOrFallback(BUSINESS_SIZE_OPTIONS, application.approxProductCountRange) ?? ""}
              required
            />
            <ReviewField
              label="Approx. monthly orders"
              value={labelForOrFallback(BUSINESS_SIZE_OPTIONS, application.approxMonthlyOrdersRange) ?? ""}
              required
            />
          </Section>

          <Section title="Products & operations">
            <ReviewField
              label="Fulfillment"
              value={
                FULFILLMENT_RESPONSIBILITY_OPTIONS.find(
                  (o) => o.value === application.fulfillmentResponsibility
                )?.title ?? ""
              }
              required
            />
            <ReviewField
              label="Price range"
              value={
                application.priceMin !== undefined || application.priceMax !== undefined
                  ? `EGP ${application.priceMin ?? "0"} – ${application.priceMax ?? "—"}`
                  : ""
              }
            />
            <ReviewField
              label="Average preparation time"
              value={labelForOrFallback(PREPARATION_TIME_OPTIONS, application.avgPreparationTimeRange) ?? ""}
              required
            />
            <ReviewField
              label="Returns and exchanges"
              value={labelForOrFallback(RETURNS_POLICY_OPTIONS, application.returnsPolicy) ?? ""}
              required
            />
            <ReviewField
              label="Returns & exchanges details"
              value={application.returnsPolicyDetails ?? ""}
              required
            />
          </Section>

          <Section title="Legal & documents">
            <ReviewField
              label="Business registration status"
              value={
                application.legalStatus === "other"
                  ? application.legalStatusOther
                    ? `Other — ${application.legalStatusOther}`
                    : ""
                  : legalStatusLabel ?? application.legalStatus ?? ""
              }
              required
              missing={legalStatusMissing}
            />
            <ReviewField label="Commercial registration #" value={application.commercialRegistrationNumber ?? ""} />
            <ReviewField label="Tax registration #" value={application.taxRegistrationNumber ?? ""} />
            <ReviewField label="Legal business name" value={application.legalBusinessName ?? ""} />
            <div className="mt-3">
              <ApplicationDocumentsList applicationId={application.id} documents={documents} />
            </div>
          </Section>

          {(application.rejectionReason || application.changesRequestedMessage) && (
            <Section title="Applicant-facing messages on file">
              {application.rejectionReason && (
                <Field label="Rejection reason" value={application.rejectionReason} />
              )}
              {application.changesRequestedMessage && (
                <Field label="Changes requested" value={application.changesRequestedMessage} />
              )}
            </Section>
          )}

          {history.length > 0 && (
            <Section title="Status history">
              <ul className="space-y-2 text-[13px]">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-700">
                      {entry.fromStatus ? `${entry.fromStatus} → ` : ""}
                      {entry.toStatus}
                      {entry.reason && <span className="text-slate-400"> — {entry.reason}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Change status">
            <ApplicationTransitionPanel applicationId={application.id} currentStatus={application.status} />
          </Section>
          <Section title="Admin notes">
            <ApplicationAdminNotes
              applicationId={application.id}
              currentStatus={application.status}
              initialNotes={application.adminNotes ?? ""}
            />
          </Section>
          <Section title="Danger zone">
            <ApplicationDeletePanel applicationId={application.id} />
          </Section>
        </div>
      </div>
    </div>
  );
}

// Applications submitted before the fixed-choice rework have no value in
// these new columns — returns null (not "—") so callers can fall back to
// the legacy free-text/boolean field instead of shadowing it.
function labelForOrFallback(
  options: { value: string; label: string }[],
  value: string | undefined
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl3 border border-stone-150 bg-white p-5">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-ink-soft/50">
        {label}
      </p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink">{value}</p>
    </div>
  );
}

// Like Field, but aware of whether the applicant's own form required this
// value — a required field with no value renders in red with a "Missing"
// call-out and an alert icon; filled-in required fields get a small green
// check. Optional fields never get either treatment (missing ?? defaults to
// !value only when required is set, so an empty optional field just reads
// "—" like it always has).
function ReviewField({
  label,
  value,
  required,
  missing,
}: {
  label: string;
  value: string;
  required?: boolean;
  missing?: boolean;
}) {
  const isMissing = required && (missing ?? !value);
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-soft/50">
        {label}
        {required &&
          (isMissing ? (
            <AlertCircle className="h-3 w-3 shrink-0 text-red-500" strokeWidth={2.5} />
          ) : (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" strokeWidth={2.5} />
          ))}
      </p>
      <p className={`mt-1 text-[14px] leading-relaxed ${isMissing ? "font-semibold text-red-600" : "text-ink"}`}>
        {isMissing ? "Missing" : value || "—"}
      </p>
    </div>
  );
}

function DiffRow({
  label,
  account,
  applied,
}: {
  label: string;
  account: string | null;
  applied: string;
}) {
  const mismatch = account !== null && account.trim().toLowerCase() !== applied.trim().toLowerCase();
  return (
    <>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label} (account)</p>
        <p className="mt-0.5 text-slate-700">{account || "—"}</p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label} (applied)</p>
        <p className={`mt-0.5 ${mismatch ? "font-semibold text-amber-700" : "text-slate-700"}`}>
          {applied || "—"}
        </p>
      </div>
    </>
  );
}
