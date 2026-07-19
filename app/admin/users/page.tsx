import { getAllProfilesForAdmin } from "@/lib/data/admin";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import StatusSelect from "@/components/admin/StatusSelect";

export default async function AdminUsersPage() {
  const [profiles, currentAdmin] = await Promise.all([
    getAllProfilesForAdmin(),
    requireAdminUser(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Users ({profiles.length})
      </h1>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {profiles.map((profile) => {
              const isSelf = profile.id === currentAdmin?.id;
              return (
                <tr key={profile.id}>
                  <td className="px-5 py-3 font-medium text-ink">
                    {profile.fullName || "—"}
                    {isSelf && (
                      <span className="ml-2 text-[11px] font-medium text-ink-soft/50">
                        (You)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-soft/70">{profile.email}</td>
                  <td className="px-5 py-3 text-ink-soft/70">
                    {new Date(profile.createdAt).toLocaleDateString("en-US")}
                  </td>
                  <td className="px-5 py-3">
                    {isSelf ? (
                      <span className="rounded-full bg-beige-100 px-2.5 py-1 text-[11px] font-semibold text-ink">
                        Admin
                      </span>
                    ) : (
                      <StatusSelect
                        apiPath={`/api/admin/users/${profile.id}`}
                        value={String(profile.isAdmin)}
                        bodyKey="isAdmin"
                        valueType="boolean"
                        options={[
                          { value: "false", label: "Customer" },
                          { value: "true", label: "Admin" },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {profiles.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No users yet.</p>
        )}
      </div>
    </div>
  );
}
