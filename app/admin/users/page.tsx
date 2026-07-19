import { getAllProfilesForAdmin, getAllBrandsForAdmin } from "@/lib/data/admin";
import { requireAdminUser, requireStaffRole } from "@/lib/supabase/adminAuth";
import TestEmailButton from "@/components/admin/TestEmailButton";
import UserAccessControl from "@/components/admin/UserAccessControl";

const ACCESS_LABELS: Record<string, string> = {
  customer: "Customer",
  brand_owner: "Brand Owner",
  staff: "Staff",
  manager: "Manager",
  admin: "Admin",
};

export default async function AdminUsersPage() {
  const [profiles, currentAdmin, staff, brands] = await Promise.all([
    getAllProfilesForAdmin(),
    requireAdminUser(),
    requireStaffRole("admin"),
    getAllBrandsForAdmin(),
  ]);
  const canManageRoles = Boolean(staff);

  // Keyed by lowercased email — brands.owner_user_id resolves to an
  // account, and this table only has that account's email to match on.
  const brandByOwnerEmail = new Map(
    brands
      .filter((b) => b.ownerEmail)
      .map((b) => [b.ownerEmail!.toLowerCase(), { slug: b.slug, name: b.name }])
  );
  const brandOptions = brands.map((b) => ({ slug: b.slug, name: b.name }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Users ({profiles.length})
        </h1>
        {canManageRoles && <TestEmailButton />}
      </div>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Every account&apos;s access level — customer, brand owner, or staff
        tier — is managed right here.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {profiles.map((profile) => {
              const isSelf = profile.id === currentAdmin?.id;
              const linkedBrand = profile.email
                ? brandByOwnerEmail.get(profile.email.toLowerCase())
                : undefined;

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
                        {ACCESS_LABELS[profile.role] ?? "Admin"}
                      </span>
                    ) : canManageRoles && profile.email ? (
                      <UserAccessControl
                        userId={profile.id}
                        currentAccess={profile.role as
                          | "customer"
                          | "brand_owner"
                          | "staff"
                          | "manager"
                          | "admin"}
                        currentBrand={linkedBrand}
                        brands={brandOptions}
                      />
                    ) : (
                      <span className="text-ink-soft/60">
                        {ACCESS_LABELS[profile.role] ?? profile.role}
                        {linkedBrand ? ` — ${linkedBrand.name}` : ""}
                      </span>
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
