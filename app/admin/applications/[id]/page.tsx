import { notFound } from "next/navigation";
import { getApplicationForAdmin } from "@/lib/data/admin";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/lib/admin/statuses";
import StatusSelect from "@/components/admin/StatusSelect";

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const application = await getApplicationForAdmin(params.id);
  if (!application) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">
            {application.brandName}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft/60">
            Submitted {new Date(application.createdAt).toLocaleString()}
          </p>
        </div>
        <StatusSelect
          apiPath={`/api/admin/applications/${application.id}`}
          value={application.status}
          options={APPLICATION_STATUSES.map((s) => ({
            value: s,
            label: APPLICATION_STATUS_LABELS[s],
          }))}
        />
      </div>

      <div className="mt-8 max-w-2xl space-y-6 rounded-xl3 border border-stone-150 bg-white p-6">
        <Field label="Founder name" value={application.founderName} />
        <Field label="Email" value={application.email} />
        <Field label="Phone" value={application.phone} />
        <Field label="Instagram / Website" value={application.instagramOrWebsite} />
        <Field label="Product category" value={application.productCategory} />
        <Field label="Brand story" value={application.brandStory} />
        <Field label="Current sales channels" value={application.salesChannels} />
      </div>
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
