import Link from "next/link";
import { notFound } from "next/navigation";
import { getApplicationForAdmin } from "@/lib/data/admin";
import { getApplicationDocuments, getApplicationStatusHistory } from "@/lib/join/applicationService";
import { APPLICATION_STATUS_LABELS, applicationStatusBadgeClass } from "@/lib/admin/statuses";
import { LEGAL_STATUS_OPTIONS } from "@/lib/join/constants";
import ApplicationTransitionPanel from "@/components/admin/ApplicationTransitionPanel";
import ApplicationAdminNotes from "@/components/admin/ApplicationAdminNotes";
import ApplicationDocumentsList from "@/components/admin/ApplicationDocumentsList";

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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">
            {application.brandName}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft/60">
            Submitted {new Date(application.createdAt).toLocaleString("en-US")}
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
              <Link
                href={`/admin/brands/new?applicationId=${application.id}`}
                className="rounded-md bg-mahalyred px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-mahalyred/90"
              >
                Create brand
              </Link>
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

          <Section title="Applicant">
            <Field label="Full name" value={application.founderName} />
            <Field label="Email" value={application.email} />
            <Field label="Phone" value={application.phone} />
            <Field label="Role" value={application.applicantRole ?? "—"} />
          </Section>

          <Section title="Brand">
            <Field label="Brand name" value={application.brandName} />
            <Field label="Arabic name" value={application.brandNameAr || "—"} />
            <Field label="English name" value={application.brandNameEn || "—"} />
            <Field label="Category" value={application.productCategory} />
            <Field
              label="Additional categories"
              value={application.additionalCategories.join(", ") || "—"}
            />
            <Field label="Website" value={application.websiteUrl || "—"} />
            <Field label="Instagram / other" value={application.instagramOrWebsite || "—"} />
            <Field
              label="Other social"
              value={application.otherSocialUrls.join(", ") || "—"}
            />
            <Field label="Brand story" value={application.brandStory} />
            <Field label="Founding year" value={application.foundingYear?.toString() ?? "—"} />
            <Field
              label="Location"
              value={[application.city, application.country].filter(Boolean).join(", ") || "—"}
            />
            <Field
              label="Sales channels"
              value={application.salesChannelsList.join(", ") || application.salesChannels || "—"}
            />
            <Field label="Approx. products" value={application.approxProductCount?.toString() ?? "—"} />
            <Field label="Approx. monthly orders" value={application.approxMonthlyOrders || "—"} />
          </Section>

          <Section title="Legal & documents">
            <Field label="Legal status" value={legalStatusLabel ?? application.legalStatus ?? "—"} />
            <Field
              label="Commercial registration #"
              value={application.commercialRegistrationNumber || "—"}
            />
            <Field label="Tax registration #" value={application.taxRegistrationNumber || "—"} />
            <Field label="Legal business name" value={application.legalBusinessName || "—"} />
            <div className="mt-3">
              <ApplicationDocumentsList applicationId={application.id} documents={documents} />
            </div>
          </Section>

          <Section title="Products & operations">
            <Field label="Price range" value={application.productPriceRange || "—"} />
            <Field
              label="Manufactured by brand"
              value={boolLabel(application.productsManufacturedByBrand)}
            />
            <Field label="Made to order" value={boolLabel(application.madeToOrder)} />
            <Field label="Avg. preparation time" value={application.avgPreparationTime || "—"} />
            <Field label="Shipping coverage" value={application.shippingCoverage || "—"} />
            <Field
              label="Returns / exchanges"
              value={boolLabel(application.returnExchangeAvailable)}
            />
            <Field label="Inventory status" value={application.inventoryStatus || "—"} />
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
                      {new Date(entry.createdAt).toLocaleString("en-US")}
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
        </div>
      </div>
    </div>
  );
}

function boolLabel(value: boolean | undefined): string {
  if (value === undefined) return "—";
  return value ? "Yes" : "No";
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
