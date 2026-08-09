import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20260810000008_remaining_integrity_boundaries.sql");

test("product list rendering does not delete or archive drafts", () => {
  const adminPage = read("app/admin/products/page.tsx");
  const portalPage = read("app/brand-portal/products/page.tsx");
  const helper = read("lib/admin/expireDrafts.ts");
  assert.doesNotMatch(adminPage, /deleteExpiredDrafts|archiveExpiredProductDrafts/);
  assert.doesNotMatch(portalPage, /deleteExpiredDrafts|archiveExpiredProductDrafts/);
  assert.doesNotMatch(helper, /\.delete\(|supabaseAdmin/);
  assert.match(migration, /set status = 'archived'/i);
  assert.doesNotMatch(migration, /delete from public\.products/i);
});

test("phone OTP verification is atomic, peppered and fail-closed", () => {
  const verifyRoute = read("app/api/account/phone/verify-otp/route.ts");
  const hashing = read("lib/account/phoneVerification.ts");
  const sms = read("lib/sms.ts");
  assert.match(migration, /for update/i);
  assert.match(migration, /set attempts = attempts \+ 1/i);
  assert.match(migration, /set phone = v_verification\.phone, phone_verified_at = v_now/i);
  assert.match(verifyRoute, /\.rpc\("verify_phone_otp"/);
  assert.match(hashing, /createHmac\("sha256", pepper\)/);
  assert.doesNotMatch(sms, /console\.(log|warn)|would send/i);
  assert.match(sms, /startsWith\("https:\/\/"\)/);
});

test("invalid default-address targets cannot clear the old default", () => {
  assert.match(migration, /ADDRESS_NOT_FOUND_OR_FORBIDDEN/);
  assert.match(migration, /addresses_one_default_per_user_idx/);
  const validationPosition = migration.indexOf("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  const swapPosition = migration.indexOf("set is_default = (id = p_address_id)");
  assert.ok(validationPosition > -1 && validationPosition < swapPosition);
});

test("variant and color values must be selected for the same product", () => {
  assert.match(migration, /enforce_variant_value_belongs_to_product/);
  assert.match(migration, /po\.product_id = v_product_id and pov\.option_value_id = new\.option_value_id/i);
  assert.match(migration, /po\.product_id = new\.product_id[\s\S]*ot\.key = 'color'/i);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*maximum of 3 variant options/i);
});

test("inactive brands are blocked from portal APIs while admins retain recovery access", () => {
  const auth = read("lib/supabase/brandAuth.ts");
  assert.match(auth, /requireActiveBrandOwner/);
  assert.match(auth, /!context\.isActive && !context\.isAdmin/);
  const routes = [
    "app/api/brand-portal/products/route.ts",
    "app/api/brand-portal/inventory/adjustments/route.ts",
    "app/api/brand-portal/orders/[id]/status/route.ts",
    "app/api/brand-portal/warehouse/transfers/route.ts",
  ];
  for (const route of routes) assert.match(read(route), /requireActiveBrandOwner/);
});

test("Discord content is escaped and high-risk operational PII is redacted", () => {
  const discord = read("lib/discord.ts");
  const audit = read("lib/auditLog.ts");
  const order = read("app/api/orders/route.ts");
  const application = read("app/api/join/application/submit/route.ts");
  assert.match(discord, /sanitizeDiscordText/);
  assert.match(discord, /\[link removed\]/);
  assert.match(audit, /SENSITIVE_AUDIT_KEY/);
  assert.doesNotMatch(order, /actorLabel: `\$\{shipping\.firstName\}/);
  assert.doesNotMatch(application, /application\.brandStory,[\s\S]*notify/);
});
