import Link from "next/link";
import { getAllApplicationsForAdmin } from "@/lib/data/admin";
import { APPLICATION_STATUS_LABELS, applicationStatusBadgeClass } from "@/lib/admin/statuses";

export default async function AdminApplicationsPage() {
  const applications = await getAllApplicationsForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Brand Applications ({applications.length})
      </h1>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Brand</th>
              <th className="px-5 py-3 font-medium">Founder</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Submitted</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {applications.map((app) => (
              <tr key={app.id}>
                <td className="px-5 py-3 font-medium text-ink">{app.brandName}</td>
                <td className="px-5 py-3 text-ink-soft/70">
                  <p>{app.founderName}</p>
                  <p className="text-[12px] text-ink-soft/50">{app.email}</p>
                </td>
                <td className="px-5 py-3 text-ink-soft/70">{app.productCategory}</td>
                <td className="px-5 py-3 text-ink-soft/70">
                  {new Date(app.createdAt).toLocaleDateString("en-US")}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${applicationStatusBadgeClass(
                      app.status
                    )}`}
                  >
                    {APPLICATION_STATUS_LABELS[app.status]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/applications/${app.id}`}
                    className="text-[12.5px] font-medium text-ink hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {applications.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            No applications yet.
          </p>
        )}
      </div>
    </div>
  );
}
