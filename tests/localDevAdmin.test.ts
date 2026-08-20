import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalDevAdminEnabled,
  isLoopbackSupabaseUrl,
  resolveSignInEmail,
} from "../lib/auth/localDevAdmin.ts";
import { assertLocalSupabaseUrl } from "../scripts/ensure-local-dev-admin.mjs";
import { parseSupabaseStatusEnv } from "../scripts/start-local-dev-admin.mjs";
import { prepareLocalSupabaseWorkdir } from "../scripts/local-supabase.mjs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

test("local developer admin is enabled only for a development build using loopback Supabase", () => {
  assert.equal(isLocalDevAdminEnabled("http://127.0.0.1:54321", "development"), true);
  assert.equal(isLocalDevAdminEnabled("http://localhost:54321", "development"), true);
  assert.equal(isLocalDevAdminEnabled("http://[::1]:54321", "development"), true);
  assert.equal(isLocalDevAdminEnabled("https://project.supabase.co", "development"), false);
  assert.equal(isLocalDevAdminEnabled("http://127.0.0.1:54321", "production"), false);
});

test("loopback detection rejects invalid and lookalike hosts", () => {
  assert.equal(isLoopbackSupabaseUrl("not a url"), false);
  assert.equal(isLoopbackSupabaseUrl("file:///tmp/supabase"), false);
  assert.equal(isLoopbackSupabaseUrl("https://127.0.0.1.evil.example"), false);
  assert.equal(isLoopbackSupabaseUrl("https://localhost.evil.example"), false);
});

test("Admin is a case-insensitive local alias while real emails stay canonical", () => {
  const localOptions = {
    supabaseUrl: "http://127.0.0.1:54321",
    nodeEnv: "development",
  };

  assert.equal(resolveSignInEmail("Admin", localOptions), "admin@local.test");
  assert.equal(resolveSignInEmail("  ADMIN  ", localOptions), "admin@local.test");
  assert.equal(resolveSignInEmail("person@example.com", localOptions), "person@example.com");
});

test("Admin never becomes an alias for production or a remote Supabase project", () => {
  assert.equal(
    resolveSignInEmail("Admin", {
      supabaseUrl: "https://project.supabase.co",
      nodeEnv: "development",
    }),
    "Admin"
  );
  assert.equal(
    resolveSignInEmail("Admin", {
      supabaseUrl: "http://127.0.0.1:54321",
      nodeEnv: "production",
    }),
    "Admin"
  );
});

test("the account preparation script independently refuses every non-loopback database", () => {
  assert.equal(assertLocalSupabaseUrl("http://127.0.0.1:54321").hostname, "127.0.0.1");
  assert.throws(() => assertLocalSupabaseUrl("https://project.supabase.co"), /Refusing/);
  assert.throws(() => assertLocalSupabaseUrl("https://localhost.evil.example"), /Refusing/);
  assert.throws(() => assertLocalSupabaseUrl("not a url"), /valid local Supabase URL/);
});

test("local Supabase status output is parsed without exposing it to the terminal", () => {
  assert.deepEqual(
    parseSupabaseStatusEnv(
      'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="public-key"\nSECRET_KEY="secret-key"\n'
    ),
    {
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "public-key",
      SECRET_KEY: "secret-key",
    }
  );
});

test("the generated local migration history starts with the historical baseline", async () => {
  const workdir = await prepareLocalSupabaseWorkdir();
  const migrationDirectory = join(workdir, "supabase", "migrations");
  const migrationFiles = (await readdir(migrationDirectory)).sort((left, right) =>
    left.localeCompare(right, "en")
  );

  assert.equal(migrationFiles[0], "20260720000000_local_baseline.sql");
  assert.ok(migrationFiles.includes("20260802000001_dashboard_product_system_stabilization.sql"));
  assert.ok(!migrationFiles.includes("20260728182617_dashboard_product_system_stabilization.sql"));
  assert.ok(migrationFiles.includes("20260803000001_opening_stock_inventory_workflow.sql"));
  assert.ok(!migrationFiles.includes("20260728204222_opening_stock_inventory_workflow.sql"));
  assert.ok(migrationFiles.includes("20260814000002_fulfillment_mode.sql"));
  assert.ok(!migrationFiles.includes("20260813052111_fulfillment_mode.sql"));
  assert.ok(migrationFiles.includes("20260821090000_brand_stock_transition_only_invariant.sql"));
  assert.equal(migrationFiles.at(-1), "99999999999999_local_dev_admin_support.sql");
  assert.equal(migrationFiles.length, 123);

  const baseline = await readFile(join(migrationDirectory, migrationFiles[0]), "utf8");
  assert.match(baseline, /LOCAL DEVELOPMENT BASELINE ONLY/);
  assert.match(baseline, /create table if not exists brands/);
  assert.match(baseline, /create table if not exists profiles/);
  assert.match(baseline, /create table if not exists public\.wishlists/);
  assert.match(baseline, /create table if not exists public\.cart_items/);
  assert.match(baseline, /create table if not exists public\.recently_viewed/);
  assert.match(baseline, /create table if not exists public\.brand_follows/);

  const localSecurityHardening = await readFile(
    join(migrationDirectory, "20260814000008_security_hardening.sql"),
    "utf8"
  );
  assert.match(localSecurityHardening, /to_regprocedure\('public\.rls_auto_enable\(\)'\)/);

  const localLaunchPolicy = await readFile(
    join(migrationDirectory, "20260815000000_product_launch_policy_and_opening_stock.sql"),
    "utf8"
  );
  assert.match(
    localLaunchPolicy,
    /begin;\r?\nlock table public\.inventory_movements in access exclusive mode;/
  );
  assert.match(
    localLaunchPolicy,
    /enable trigger inventory_movements_immutable;\r?\ncommit;/
  );

  const localAdminSupport = await readFile(
    join(migrationDirectory, "99999999999999_local_dev_admin_support.sql"),
    "utf8"
  );
  assert.match(localAdminSupport, /security definer/i);
  assert.match(localAdminSupport, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(localAdminSupport, /grant execute[\s\S]*to (anon|authenticated)/i);
});
