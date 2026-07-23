import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Integration checks against the live/configured Supabase project — these
// codify the manual verification performed during the production-readiness
// audit (docs/security-audit.md SEC-001/SEC-003/SEC-006): privileged
// SECURITY DEFINER functions must reject the public anon key, and the
// products RLS policy must not leak non-published/paused rows. Skipped
// entirely (not failed) when Supabase credentials aren't available, e.g. a
// CI environment without .env.local — this suite only ever reads, or
// attempts writes designed to fail before any row is touched (a
// nonexistent-but-validly-typed foreign key), so it never mutates real
// data even if a lockdown regresses.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(rootDir, ".env.local");

function loadEnv(): Record<string, string> {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      })
  );
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const hasCredentials = Boolean(supabaseUrl && anonKey);
const FAKE_UUID = "00000000-0000-0000-0000-000000000099";

test("privileged RPCs reject the public anon key", { skip: !hasCredentials }, async (t) => {
  const anon = createClient(supabaseUrl!, anonKey!);

  await t.test("place_order", async () => {
    const { error } = await anon.rpc("place_order", {
      p_shipping_name: "x",
      p_shipping_email: "x@x.com",
      p_shipping_phone: "x",
      p_shipping_address: "x",
      p_shipping_city: "x",
      p_shipping_governorate: "x",
      p_user_id: FAKE_UUID,
      p_items: [],
      p_coupon_code: null,
      p_address_id: null,
    });
    assert.ok(error, "expected an error calling place_order with the anon key");
    assert.match(error!.message, /permission denied/i);
  });

  await t.test("cancel_order", async () => {
    const { error } = await anon.rpc("cancel_order", { p_order_id: FAKE_UUID });
    assert.ok(error, "expected an error calling cancel_order with the anon key");
    assert.match(error!.message, /permission denied/i);
  });

  await t.test("set_default_address", async () => {
    const { error } = await anon.rpc("set_default_address", {
      p_user_id: FAKE_UUID,
      p_address_id: FAKE_UUID,
    });
    assert.ok(error, "expected an error calling set_default_address with the anon key");
    assert.match(error!.message, /permission denied/i);
  });

  await t.test("set_user_access", async () => {
    const { error } = await anon.rpc("set_user_access", {
      p_user_id: FAKE_UUID,
      p_access: "customer",
      p_brand_slug: null,
    });
    assert.ok(error, "expected an error calling set_user_access with the anon key");
    assert.match(error!.message, /permission denied/i);
  });

  await t.test("replace_product_with_variants", async () => {
    const { error } = await anon.rpc("replace_product_with_variants", {
      p_product_id: "nonexistent-id-xyz",
      p_product: {},
      p_variants: [],
    });
    assert.ok(error, "expected an error calling replace_product_with_variants with the anon key");
    assert.match(error!.message, /permission denied/i);
  });
});

test(
  "products RLS does not leak non-published/paused rows to the anon key",
  { skip: !hasCredentials || !serviceRoleKey },
  async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!);
    const anon = createClient(supabaseUrl!, anonKey!);

    const { data: adminView, error: adminError } = await admin
      .from("products")
      .select("id, status, paused_by_brand")
      .or("status.neq.published,paused_by_brand.eq.true");
    assert.ifError(adminError);

    const { data: anonView, error: anonError } = await anon
      .from("products")
      .select("id, status, paused_by_brand")
      .or("status.neq.published,paused_by_brand.eq.true");
    assert.ifError(anonError);

    assert.equal(
      anonView?.length ?? 0,
      0,
      `anon key must never see non-published/paused products (admin sees ${adminView?.length ?? 0} such rows)`
    );
  }
);
