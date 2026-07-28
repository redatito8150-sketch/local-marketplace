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
  "convert_application_to_brand rejects the public anon key",
  { skip: !hasCredentials },
  async (t) => {
    const anon = createClient(supabaseUrl!, anonKey!);
    const { error } = await anon.rpc("convert_application_to_brand", {
      p_application_id: FAKE_UUID,
      p_admin_user_id: FAKE_UUID,
      p_brand: {},
    });

    if (error && /could not find the function/i.test(error.message)) {
      // The 2026-07-25 brand_application_workflow migration hasn't been
      // applied to this project yet — skip rather than fail, same as the
      // "no credentials" skip above; this isn't a lockdown regression.
      t.skip("convert_application_to_brand does not exist yet (migration not applied)");
      return;
    }

    assert.ok(error, "expected an error calling convert_application_to_brand with the anon key");
    assert.match(error!.message, /permission denied/i);
  }
);

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

// ============================================================================
// Basic-info-rebuild correction (2026-07-30): brand_id architecture —
// next_product_sku concurrency/uniqueness, sku_prefix locking, and the
// cross-brand collection guard. Every test here creates its own disposable
// brand (never touches a real one, e.g. 'mahaly') and deletes it in a
// `finally` block, same "never mutates real data" principle as the rest of
// this file.
// ============================================================================

// Untyped (no generated Database type) Supabase client, same as every
// other client in this file; typing this helper's param any more strictly
// than `any` just fights the client's own overly-strict inferred generics
// for no benefit in a test file.
async function createDisposableBrand(admin: any, overrides: Record<string, unknown> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin
    .from("brands")
    .insert({
      slug: `test-brand-${suffix}`,
      name: `Test Brand ${suffix}`,
      tagline: "x",
      category: "Clothing",
      sku_prefix: `T${suffix.slice(0, 4).toUpperCase()}`,
      city: "Cairo",
      hero_image: "/x.jpg",
      about_description: "x",
      about_image: "/x.jpg",
      story_image: "/x.jpg",
      story_body: "x",
      ...overrides,
    })
    .select("id, slug, sku_prefix")
    .single();
  if (error) throw new Error(`createDisposableBrand failed: ${error.message}`);
  return data as { id: string; slug: string; sku_prefix: string };
}

test(
  "next_product_sku is concurrency-safe and produces unique, sequential, correctly-prefixed values",
  { skip: !hasCredentials || !serviceRoleKey },
  async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!);
    const brand = await createDisposableBrand(admin);
    try {
      const [a, b, c] = await Promise.all([
        admin.rpc("next_product_sku", { p_brand_id: brand.id }),
        admin.rpc("next_product_sku", { p_brand_id: brand.id }),
        admin.rpc("next_product_sku", { p_brand_id: brand.id }),
      ]);
      for (const result of [a, b, c]) assert.ifError(result.error);
      const skus = [a.data, b.data, c.data] as string[];

      // Unique — no two concurrent calls ever produced the same SKU.
      assert.equal(new Set(skus).size, 3, `expected 3 unique SKUs, got ${JSON.stringify(skus)}`);
      // Correctly prefixed.
      for (const sku of skus) assert.match(sku, new RegExp(`^${brand.sku_prefix}-\\d{6}$`));
      // Sequential — the 3 sequence numbers are exactly {1,2,3} in some order,
      // proving the counter used real row-locked increments (INSERT ... ON
      // CONFLICT ... RETURNING), not a racy count(*)+1.
      const sequences = skus.map((sku) => Number(sku.split("-")[1])).sort((x, y) => x - y);
      assert.deepEqual(sequences, [1, 2, 3]);
    } finally {
      await admin.from("brands").delete().eq("id", brand.id);
    }
  }
);

test(
  "sku_prefix cannot be changed once the brand has a product",
  { skip: !hasCredentials || !serviceRoleKey },
  async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!);
    const brand = await createDisposableBrand(admin);
    try {
      const { data: leaf } = await admin
        .from("taxonomy_nodes")
        .select("id")
        .eq("level", 3)
        .eq("is_active", true)
        .limit(1)
        .single();
      assert.ok(leaf, "expected at least one Level 3 taxonomy node to exist");

      const { data: sku } = await admin.rpc("next_product_sku", { p_brand_id: brand.id });
      const { error: productError } = await admin.from("products").insert({
        id: `test-product-${Math.random().toString(36).slice(2, 8)}`,
        name: "Test product",
        brand_id: brand.id,
        audience: "unisex",
        product_type_id: leaf!.id,
        price: 100,
        currency: "EGP",
        image: "/x.jpg",
        description: "x",
        shipping_returns: "x",
        sku,
        status: "draft",
      });
      assert.ifError(productError);

      const { error: renameError } = await admin
        .from("brands")
        .update({ sku_prefix: "OTHER1" })
        .eq("id", brand.id);
      assert.ok(renameError, "expected the sku_prefix lock trigger to reject the change");
      assert.match(renameError!.message, /SKU prefix cannot be changed/i);
    } finally {
      await admin.from("products").delete().eq("brand_id", brand.id);
      await admin.from("brands").delete().eq("id", brand.id);
    }
  }
);

test(
  "a product cannot be assigned a collection belonging to a different brand",
  { skip: !hasCredentials || !serviceRoleKey },
  async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!);
    const brandA = await createDisposableBrand(admin);
    const brandB = await createDisposableBrand(admin);
    try {
      const { data: leaf } = await admin
        .from("taxonomy_nodes")
        .select("id")
        .eq("level", 3)
        .eq("is_active", true)
        .limit(1)
        .single();
      assert.ok(leaf, "expected at least one Level 3 taxonomy node to exist");

      const { data: collection, error: collectionError } = await admin
        .from("collections")
        .insert({ brand_id: brandA.id, name: "A's collection", slug: "as-collection" })
        .select("id")
        .single();
      assert.ifError(collectionError);

      const { data: sku } = await admin.rpc("next_product_sku", { p_brand_id: brandB.id });
      const { error: productError } = await admin.from("products").insert({
        id: `test-product-${Math.random().toString(36).slice(2, 8)}`,
        name: "Test product",
        brand_id: brandB.id,
        audience: "unisex",
        product_type_id: leaf!.id,
        collection_id: collection!.id,
        price: 100,
        currency: "EGP",
        image: "/x.jpg",
        description: "x",
        shipping_returns: "x",
        sku,
        status: "draft",
      });
      assert.ok(productError, "expected the cross-brand collection guard trigger to reject the insert");
      assert.match(productError!.message, /different brand/i);
    } finally {
      await admin.from("products").delete().eq("brand_id", brandB.id);
      await admin.from("collections").delete().eq("brand_id", brandA.id);
      await admin.from("brands").delete().in("id", [brandA.id, brandB.id]);
    }
  }
);
