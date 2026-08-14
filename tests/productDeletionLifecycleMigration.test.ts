import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260814020000_product_deletion_lifecycle.sql", "utf8");
const compact = migration.replace(/\s+/g, " ").toLowerCase();

test("the final lifecycle has no request, approval, countdown, schedule, or product-deletion cron model", () => {
  assert.doesNotMatch(migration, /product_deletion_requests|product_deletion_schedules|schedule_product_deletion|execute_due_product_deletions/i);
  assert.doesNotMatch(migration, /interval\s+'7 days'|approval queue|grace period/i);
});

test("Archived has its own timestamp and is a terminal database state", () => {
  assert.match(migration, /add column if not exists archived_at timestamptz/i);
  assert.match(migration, /old\.status = 'archived' and new\.status <> 'archived'/i);
  assert.match(migration, /PRODUCT_ARCHIVED_IS_TERMINAL/);
  assert.doesNotMatch(migration, /restore_product|restore_in_progress/i);
});

test("Draft cannot jump to Archived; only Published or Paused can Archive", () => {
  assert.match(migration, /'canArchive', v_product\.status = 'published'/);
  assert.match(migration, /PRODUCT_MUST_BE_PUBLISHED_BEFORE_ARCHIVE/);
  assert.match(migration, /if v_product\.status <> 'published' then[\s\S]*?PRODUCT_NOT_PUBLISHED/);
});

test("one canonical eligibility function separates permanent history from temporary blockers", () => {
  assert.match(migration, /private\.compute_product_deletion_eligibility\(p_product_id text\)/);
  assert.match(migration, /'immutableReasons', v_immutable/);
  assert.match(migration, /'temporaryBlockers', v_temporary/);
  assert.match(migration, /'mustRetainHistory', jsonb_array_length\(v_immutable\) > 0/);
  assert.match(migration, /'hasTemporaryBlockers', jsonb_array_length\(v_temporary\) > 0/);
  assert.match(migration, /'canDeleteArchived'[\s\S]*?jsonb_array_length\(v_immutable\) = 0[\s\S]*?jsonb_array_length\(v_temporary\) = 0/);
});

test("every blocker includes a user-facing resolution and optional destination", () => {
  assert.match(migration, /p_resolution text/);
  assert.match(migration, /'resolution', p_resolution/);
  assert.match(migration, /'href', p_href/);
  for (const code of [
    "PRODUCT_HAS_REVIEWS", "PRODUCT_HAS_ORDER_HISTORY", "PRODUCT_HAS_INVENTORY_HISTORY",
    "PRODUCT_HAS_WAREHOUSE_HISTORY", "PRODUCT_HAS_AVAILABLE_STOCK", "PRODUCT_HAS_BRAND_STOCK",
    "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT", "PRODUCT_HAS_UNRESOLVED_QUARANTINE",
    "BRAND_HAS_OPEN_FULFILLMENT_TRANSITION", "PRODUCT_HAS_ACTIVE_HOLD",
  ]) assert.ok(migration.includes(code), `${code} must be implemented`);
});

test("Draft and Archived deletion re-check eligibility while product and variants are locked", () => {
  const body = migration.match(/create or replace function private\.delete_product_permanently[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /from public\.products where id = p_product_id for update/);
  assert.match(body, /from public\.product_variants where product_id = p_product_id for update/);
  assert.match(body, /private\.compute_product_deletion_eligibility\(p_product_id\)/);
  assert.match(body, /canDeleteDraft/);
  assert.match(body, /mustRetainHistory/);
  assert.match(body, /hasTemporaryBlockers/);
});

test("hard deletion is idempotent and writes durable history in the same transaction", () => {
  assert.match(migration, /create table if not exists public\.product_deletion_history/);
  assert.match(migration, /unique \(product_id_snapshot, operation_key\)/);
  const body = migration.match(/create or replace function private\.delete_product_permanently[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.ok(body.indexOf("insert into public.product_deletion_history") < body.indexOf("delete from public.products"));
  assert.match(body, /IDEMPOTENCY_CONFLICT/);
  assert.match(body, /ALREADY_DELETED/);
  assert.match(body, /select \* into v_product from public\.products where id = p_product_id for update;[\s\S]*?if not found then[\s\S]*?select \* into v_existing from public\.product_deletion_history/);
});

test("media deletion uses an authoritative path registry, never arbitrary URL parsing", () => {
  assert.match(migration, /create table if not exists public\.product_storage_assets/);
  assert.match(migration, /unique \(bucket_id, storage_path\)/);
  assert.match(migration, /private\.queue_product_storage_cleanup/);
  assert.doesNotMatch(migration, /regexp_replace\(url|storage\/v1\/object\/public\/product-images/);
});

test("abandoned temporary uploads are queued in bounded skip-locked batches", () => {
  const body = migration.match(/create or replace function public\.queue_abandoned_product_uploads[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /product_id is null and cleanup_queued_at is null/);
  assert.match(body, /for update skip locked/);
  assert.match(body, /limit least\(greatest\(coalesce\(p_limit, 100\), 1\), 500\)/);
});

test("new server-only tables and RPCs fail closed for browser roles", () => {
  for (const table of ["product_deletion_history", "product_deletion_holds", "product_storage_assets"]) {
    assert.ok(compact.includes(`alter table public.${table} enable row level security`));
    assert.ok(compact.includes(`revoke all on public.${table} from public, anon, authenticated`));
  }
  for (const fn of ["get_product_deletion_eligibility", "archive_product", "delete_draft_product", "delete_archived_product", "claim_product_storage_assets", "queue_abandoned_product_uploads", "search_archived_products"]) {
    assert.ok(compact.includes(`grant execute on function public.${fn}`), `${fn} must be service-role callable`);
  }
});

test("large-catalog lookup paths have explicit indexes", () => {
  assert.match(migration, /order_items_product_id_idx on public\.order_items \(product_id\)/);
  assert.match(migration, /order_items_variant_id_idx on public\.order_items \(variant_id\)/);
  assert.match(migration, /product_deletion_history_brand_deleted_idx/);
  assert.match(migration, /product_storage_assets_abandoned_idx/);
});

test("Archived list and deletion history are paginated in Postgres", () => {
  assert.match(migration, /private\.search_archived_products/);
  assert.match(migration, /private\.search_product_deletion_history/);
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/);
  assert.match(migration, /limit v_limit offset v_offset/);
});
