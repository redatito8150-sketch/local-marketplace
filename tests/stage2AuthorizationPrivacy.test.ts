import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import {
  DENY_UNMAPPED_ADMIN_PATH,
  getAdminPathRequirement,
} from "../lib/admin/permissionPolicy.ts";

const root = process.cwd();

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function routePath(file: string, base: string, prefix: string): string {
  const directory = relative(base, file).split(sep).slice(0, -1);
  return `${prefix}/${directory.join("/")}`.replace(/\/$/, "");
}

test("every current admin API route is mapped to an explicit permission", () => {
  const base = join(root, "app", "api", "admin");
  const routes = walk(base).filter((file) => file.endsWith(`${sep}route.ts`));
  assert.ok(routes.length > 0);
  for (const file of routes) {
    const pathname = routePath(file, base, "/api/admin");
    assert.notEqual(getAdminPathRequirement(pathname), null, pathname);
    assert.notEqual(
      getAdminPathRequirement(pathname),
      DENY_UNMAPPED_ADMIN_PATH,
      pathname
    );
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /require(?:AdminUser|StaffRole|Permission|WarehouseReceiver)\(/,
      `${pathname} must invoke a server authorization guard`
    );
  }
});

test("public catalog queries do not use wildcard selects", () => {
  for (const file of [
    "lib/data/products.ts",
    "lib/data/brands.ts",
    "lib/data/collections.ts",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /\.from\("(?:products|brands)"\)[\s\S]{0,2000}?\.select\("\*"\)/);
  }
});

test("privacy migration revokes broad grants and excludes sensitive catalog fields", () => {
  const source = readFileSync(
    join(root, "supabase/migrations/20260810000004_rls_and_column_privacy_boundaries.sql"),
    "utf8"
  );
  assert.match(source, /revoke select on public\.brands from anon, authenticated/i);
  assert.match(source, /revoke select on public\.products from anon, authenticated/i);
  assert.match(source, /revoke select on public\.orders from anon, authenticated/i);
  assert.match(source, /revoke update on public\.reviews from authenticated/i);
  assert.match(source, /public\.brand_staff membership/i);
  assert.match(source, /publish_date is null or publish_date <= now\(\)/i);

  const brandGrant = source.match(/from unnest\(array\[([\s\S]*?)\]::text\[\]\)[\s\S]*?'public\.brands'::regclass/i)?.[1] ?? "";
  const productGrant = source.match(/revoke select on public\.products[\s\S]*?from unnest\(array\[([\s\S]*?)\]::text\[\]\)[\s\S]*?'public\.products'::regclass/i)?.[1] ?? "";
  const orderGrant = source.match(/revoke select on public\.orders[\s\S]*?from unnest\(array\[([\s\S]*?)\]::text\[\]\)[\s\S]*?'public\.orders'::regclass/i)?.[1] ?? "";

  for (const field of ["owner_user_id", "source_application_id", "onboarding_defaults", "deleted_image_backups"]) {
    assert.doesNotMatch(brandGrant, new RegExp(`\\b${field}\\b`, "i"));
  }
  for (const field of ["pending_changes", "review_notes", "submitted_by", "reviewed_by", "deletion_requested_at"]) {
    assert.doesNotMatch(productGrant, new RegExp(`\\b${field}\\b`, "i"));
  }
  for (const field of ["shipping_email", "shipping_phone", "shipping_address", "internal_notes", "payment_status", "coupon_code"]) {
    assert.doesNotMatch(orderGrant, new RegExp(`\\b${field}\\b`, "i"));
  }
});

test("legacy user-access mutation requires manage_roles and rank hierarchy", () => {
  const source = readFileSync(join(root, "app/api/admin/users/[id]/route.ts"), "utf8");
  assert.match(source, /requirePermission\("manage_roles"\)/);
  assert.match(source, /canActorManage\(actorRank, targetRank\)/);
});

test("new permission catalog migration uses the tracked roles schema", () => {
  const source = readFileSync(
    join(root, "supabase/migrations/20260810000003_admin_permission_boundaries.sql"),
    "utf8"
  );
  assert.match(source, /permissions \(key, label, description, category, sort_order\)/i);
  assert.match(source, /r\.is_protected = true/i);
  assert.doesNotMatch(source, /\bdisplay_order\b|\bis_system\b/i);
});
