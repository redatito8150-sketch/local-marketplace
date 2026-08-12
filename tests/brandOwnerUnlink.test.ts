import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A brand can have more than one owner (brands.owner_user_id, the "primary"
// convenience pointer, *and* any brand_staff access_level='owner' co-owner
// rows — see 20260808000008_multiple_brand_owners.sql). The "Brand Portal
// Access" widget on the admin brand edit page used to read/write only the
// primary pointer, so a co-owner was invisible there and stayed fully
// linked (their profiles.role never changed) after clicking "Unlink" —
// exactly the "Unlink doesn't change anything, and I think there are two
// owners at once" bug this guards against.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("remove_brand_owner RPC exists, is scoped to a specific user, and is locked to service_role only", () => {
  const migration = read("supabase/migrations/20260812000004_brand_owner_removal.sql");
  assert.match(migration, /create or replace function public\.remove_brand_owner\(p_brand_slug text, p_user_id uuid\)/);
  assert.match(migration, /delete from public\.brand_staff\s*\n\s*where brand_id = v_brand_id and user_id = p_user_id and access_level = 'owner';/);
  assert.match(migration, /revoke all on function public\.remove_brand_owner\(text, uuid\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.remove_brand_owner\(text, uuid\) to service_role;/);
});

test("DELETE /api/admin/brands/[slug]/owner requires a userId and calls remove_brand_owner, not set_brand_primary_owner", () => {
  const route = read("app/api/admin/brands/[slug]/owner/route.ts");
  const deleteIndex = route.indexOf("export async function DELETE");
  assert.ok(deleteIndex !== -1);
  const deleteBody = route.slice(deleteIndex);
  assert.match(deleteBody, /typeof userId !== "string" \|\| !userId/);
  assert.match(deleteBody, /"remove_brand_owner"/);
  assert.match(deleteBody, /p_user_id: userId/);
  assert.doesNotMatch(deleteBody, /set_brand_primary_owner/);
});

test("getBrandMembersForAdmin resolves every owner (owner_user_id and any brand_staff access_level='owner' rows), not just the primary pointer", () => {
  const source = read("lib/data/admin.ts");
  const fnIndex = source.indexOf("export async function getBrandMembersForAdmin");
  assert.ok(fnIndex !== -1);
  const fnBody = source.slice(fnIndex, fnIndex + 2000);
  assert.match(fnBody, /if \(brand\.owner_user_id\) ownerIds\.add\(brand\.owner_user_id\);/);
  assert.match(fnBody, /if \(row\.access_level === "owner"\) ownerIds\.add\(row\.user_id\);/);
});

test("the admin brand edit page fetches every owner and passes the full list to LinkBrandOwnerField, not a single ownerEmail", () => {
  const page = read("app/admin/brands/[slug]/edit/page.tsx");
  assert.match(page, /getBrandMembersForAdmin/);
  assert.match(page, /owners=\{members\?\.owners \?\? \[\]\}/);
  assert.doesNotMatch(page, /currentOwnerEmail=/);
});

test("LinkBrandOwnerField renders an Unlink control per owner (targeted by id) instead of a single implicit owner", () => {
  const component = read("components/admin/LinkBrandOwnerField.tsx");
  assert.match(component, /owners\.map\(\(owner\) =>/);
  assert.match(component, /body: JSON\.stringify\(\{ userId: owner\.id \}\)/);
});

test("GET /api/admin/brands/[slug]/owners now delegates to the same shared getBrandMembersForAdmin used by the edit page", () => {
  const route = read("app/api/admin/brands/[slug]/owners/route.ts");
  assert.match(route, /getBrandMembersForAdmin/);
});

test("Customers & Permissions' linked-brand lookup covers every brand_staff row (owner or assistant), so a co-owner still shows as linked", () => {
  const page = read("app/admin/users/page.tsx");
  assert.match(page, /const brandByStaffUserId = new Map\(brandStaff\.map/);
  assert.match(page, /brandByOwnerEmail\.get\(profile\.email\.toLowerCase\(\)\) : undefined\) \?\? brandByStaffUserId\.get\(profile\.id\)/);
});
