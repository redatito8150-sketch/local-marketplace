import Link from "next/link";
import { getAllProfilesForAdmin, getAllBrandsForAdmin, getAllBrandStaffForAdmin } from "@/lib/data/admin";
import { getAllRoles, getAllPermissions, getAllUserRoleAssignments } from "@/lib/data/roles";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { getUserPermissions, getUserMaxRank, LEGACY_TIER_RANK } from "@/lib/supabase/permissions";
import TestEmailButton from "@/components/admin/TestEmailButton";
import TestDiscordButton from "@/components/admin/TestDiscordButton";
import UserAccessControl from "@/components/admin/UserAccessControl";
import RolesManager from "@/components/admin/RolesManager";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

const ACCESS_LABELS: Record<string, string> = { customer: "Customer", brand_owner: "Brand Owner", brand_assistant: "Brand Assistant", staff: "Staff", manager: "Manager", admin: "Admin" };
type UserSearchParams = { q?: string; role?: string; brandAccess?: string; from?: string; sort?: string; tab?: string };

export default async function AdminUsersPage(props: { searchParams: Promise<UserSearchParams> }) {
  const params = await props.searchParams;
  const tab = params.tab === "roles" ? "roles" : "people";

  const [allProfiles, currentAdmin, brands, brandStaff, allRoles, allPermissions, assignments] = await Promise.all([
    getAllProfilesForAdmin(),
    requireAdminUser(),
    getAllBrandsForAdmin(),
    getAllBrandStaffForAdmin(),
    getAllRoles(),
    getAllPermissions(),
    getAllUserRoleAssignments(),
  ]);

  const permissions = currentAdmin ? await getUserPermissions(currentAdmin.id) : new Set<string>();
  const canManageRoles = permissions.has("manage_roles");
  const actorMaxRank = currentAdmin ? await getUserMaxRank(currentAdmin.id) : 0;

  const brandByOwnerEmail = new Map(brands.filter((brand) => brand.ownerEmail).map((brand) => [brand.ownerEmail!.toLowerCase(), { slug: brand.slug, name: brand.name }]));
  const brandByAssistantUserId = new Map(brandStaff.map((row) => [row.userId, { slug: row.brandSlug, name: row.brandName }]));
  const brandOptions = brands.map((brand) => ({ slug: brand.slug, name: brand.name }));

  const rolesByIdMap = new Map(allRoles.map((role) => [role.id, role]));
  const roleIdsByUser = new Map<string, string[]>();
  for (const row of assignments) {
    const list = roleIdsByUser.get(row.userId) ?? [];
    list.push(row.roleId);
    roleIdsByUser.set(row.userId, list);
  }
  const assignableRoles = allRoles.filter((role) => role.rank < actorMaxRank);

  function targetMaxRank(profileId: string, legacyRole: string): number {
    const heldRanks = (roleIdsByUser.get(profileId) ?? []).map((id) => rolesByIdMap.get(id)?.rank ?? 0);
    const legacyFloor = LEGACY_TIER_RANK[legacyRole] ?? 0;
    return Math.max(0, legacyFloor, ...heldRanks);
  }

  const query = params.q?.trim().toLowerCase();
  const profiles = allProfiles.filter((profile) => {
    const linkedBrand = (profile.email ? brandByOwnerEmail.get(profile.email.toLowerCase()) : undefined) ?? brandByAssistantUserId.get(profile.id);
    if (query && !`${profile.fullName ?? ""} ${profile.email ?? ""} ${linkedBrand?.name ?? ""}`.toLowerCase().includes(query)) return false;
    if (params.role && profile.role !== params.role) return false;
    if (params.brandAccess === "linked" && !linkedBrand) return false;
    if (params.brandAccess === "unlinked" && linkedBrand) return false;
    if (params.from && new Date(profile.createdAt) < new Date(`${params.from}T00:00:00`)) return false;
    return true;
  });
  profiles.sort((a, b) => params.sort === "name" ? (a.fullName ?? "").localeCompare(b.fullName ?? "") : params.sort === "oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activeCount = [params.q, params.role, params.brandAccess, params.from, params.sort].filter(Boolean).length;

  const tabLinkClass = (active: boolean) =>
    `rounded-t-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${active ? "border-b-2 border-mahalyred text-mahalyred" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div>
      <DashboardPageHeader
        eyebrow="People & access"
        title="Customers & Permissions"
        description="One place for every account on the platform: what they can access, and — for internal team members — which role grants it."
        actions={canManageRoles && tab === "people" ? <div className="flex flex-wrap items-center gap-2"><TestEmailButton /><TestDiscordButton /></div> : undefined}
      />

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        <Link href="/admin/users?tab=people" className={tabLinkClass(tab === "people")}>
          People ({profiles.length})
        </Link>
        {canManageRoles && (
          <Link href="/admin/users?tab=roles" className={tabLinkClass(tab === "roles")}>
            Roles & Permissions
          </Link>
        )}
      </div>

      {tab === "roles" && canManageRoles ? (
        <div className="mt-6">
          <RolesManager initialRoles={allRoles} allPermissions={allPermissions} actorMaxRank={actorMaxRank} />
        </div>
      ) : (
        <>
          <DashboardFilters action="/admin/users" clearHref="/admin/users" activeCount={activeCount}>
            <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Name, email or brand" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
            <DashboardFilterField label="Role"><select name="role" defaultValue={params.role ?? ""} className={dashboardFilterControl}><option value="">All roles</option>{Object.entries(ACCESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></DashboardFilterField>
            <DashboardFilterField label="Brand link"><select name="brandAccess" defaultValue={params.brandAccess ?? ""} className={dashboardFilterControl}><option value="">Any link</option><option value="linked">Linked to brand</option><option value="unlinked">Not linked</option></select></DashboardFilterField>
            <DashboardFilterField label="Joined after"><input type="date" name="from" defaultValue={params.from ?? ""} className={dashboardFilterControl} /></DashboardFilterField>
            <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Newest</option><option value="oldest">Oldest</option><option value="name">Name A–Z</option></select></DashboardFilterField>
          </DashboardFilters>
          <DashboardPanel className="mt-6">
            {profiles.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-[13px]"><thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">User</th><th className="px-5 py-3 font-semibold">Joined</th><th className="px-5 py-3 font-semibold">Brand</th><th className="px-5 py-3 font-semibold">Access</th></tr></thead><tbody className="divide-y divide-slate-100">{profiles.map((profile) => {
              const isSelf = profile.id === currentAdmin?.id;
              const linkedBrand = (profile.email ? brandByOwnerEmail.get(profile.email.toLowerCase()) : undefined) ?? brandByAssistantUserId.get(profile.id);
              const heldRoleIds = roleIdsByUser.get(profile.id) ?? [];
              const heldRoleNames = heldRoleIds.map((id) => rolesByIdMap.get(id)?.name).filter(Boolean) as string[];
              const outranksActor = !isSelf && targetMaxRank(profile.id, profile.role) >= actorMaxRank;
              const canEditThisRow = canManageRoles && !isSelf && !outranksActor;
              return <tr key={profile.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-bold text-slate-900">{profile.fullName || "Unnamed user"}{isSelf && <span className="ml-2 text-[10.5px] font-semibold text-slate-400">You</span>}</p><p className="mt-0.5 text-[11px] text-slate-500">{profile.email}</p></td><td className="px-5 py-4 text-slate-500">{new Date(profile.createdAt).toLocaleDateString("en-US")}</td><td className="px-5 py-4">{linkedBrand ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10.5px] font-bold text-sky-700">{linkedBrand.name}</span> : <span className="text-[11.5px] text-slate-400">Not linked</span>}</td><td className="px-5 py-4">{isSelf ? <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10.5px] font-bold text-white">{heldRoleNames[0] ?? ACCESS_LABELS[profile.role] ?? "Admin"}</span> : canEditThisRow && profile.email ? <UserAccessControl userId={profile.id} currentAccess={profile.role as "customer" | "brand_owner" | "brand_assistant" | "staff" | "manager" | "admin"} currentBrand={linkedBrand} brands={brandOptions} roles={assignableRoles.map((r) => ({ id: r.id, name: r.name }))} currentRoleId={heldRoleIds[0] ?? null} /> : <span className="text-slate-600">{heldRoleNames.length ? heldRoleNames.join(", ") : ACCESS_LABELS[profile.role] ?? profile.role}{outranksActor && <span className="ml-1.5 text-[10.5px] text-slate-400">(outranks you)</span>}</span>}</td></tr>;
            })}</tbody></table></div> : <DashboardEmptyState title="No matching users" description={activeCount ? "Clear or adjust the filters to see more accounts." : "User accounts will appear here after registration."} />}
          </DashboardPanel>
        </>
      )}
    </div>
  );
}
