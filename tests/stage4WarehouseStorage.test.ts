import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationPath = "supabase/migrations/20260810000006_warehouse_and_storage_integrity.sql";
const migration = read(migrationPath);

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function compact(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "");
}

test("return requests reserve sellable stock and rejection releases it atomically", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("addcolumnifnotexistsstock_reserved_attimestamptz"));
  assert.ok(sql.includes("setquantity=quantity-v_requested"));
  assert.ok(sql.includes("'warehouse_return_reserved'"));
  assert.ok(sql.includes("createorreplacefunctionpublic.reject_warehouse_transfer"));
  assert.ok(sql.includes("setquantity=quantity+v_item.requested_qty"));
  assert.ok(sql.includes("'warehouse_return_released'"));
});

test("receivers require one exact canonical submission and never clamp inventory", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("count(distinctinput.value->>'item_id')"));
  assert.ok(sql.includes("ifv_input_count<>v_expected_count"));
  assert.ok(sql.includes("ifv_matched_count<>v_expected_count"));
  assert.ok(sql.includes("frompublic.warehouse_transfer_itemswti"));
  assert.ok(sql.includes("orderbywti.id"));
  assert.ok(sql.includes("insufficient_sellable_stock_at_return"));
  assert.ok(sql.includes("insufficient_brand_stock_at_receipt"));
  assert.doesNotMatch(
    migration.match(/create or replace function private\.receive_warehouse_transfer_canonical[\s\S]*?\$\$;/i)?.[0] ?? "",
    /greatest\s*\(/i
  );
});

test("warehouse request and stock mutations are idempotent, duplicate-safe, and service-only", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("addcolumnifnotexistsrequest_payloadjsonb"));
  assert.ok(sql.includes("raiseexception'idempotency_conflict'"));
  assert.ok(sql.includes("count(distinctinput.value->>'variant_id')"));
  assert.ok(sql.includes("createorreplacefunctionpublic.set_warehouse_brand_stock"));
  assert.ok(sql.includes("brand_stock_below_pending_transfers"));

  for (const signature of [
    "public.request_warehouse_return(uuid,uuid,jsonb,text,text)",
    "public.request_warehouse_transfer(uuid,uuid,jsonb,text,text)",
    "public.receive_warehouse_return(uuid,uuid,jsonb,text)",
    "public.receive_warehouse_transfer(uuid,uuid,jsonb,text)",
    "public.reject_warehouse_transfer(uuid,uuid,text)",
    "public.set_warehouse_brand_stock(uuid,uuid,jsonb)",
  ]) {
    assert.ok(sql.includes(`revokeallonfunction${signature}frompublic,anon,authenticated;`));
    assert.ok(sql.includes(`grantexecuteonfunction${signature}toservice_role;`));
  }
});

test("warehouse APIs enforce exact lines and persistent operation keys", () => {
  const receive = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  const reject = read("app/api/admin/warehouse/transfers/[id]/reject/route.ts");
  const transfer = read("app/api/brand-portal/warehouse/transfers/route.ts");
  const warehouseReturn = read("app/api/brand-portal/warehouse/returns/route.ts");
  const warehouseClient = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const inventoryClient = read("components/brand-portal/InventoryManager.tsx");

  assert.match(receive, /expectedIds\.size !== submittedIds\.length/);
  assert.match(receive, /Each transfer item must appear exactly once/);
  assert.match(reject, /\.rpc\("reject_warehouse_transfer"/);
  assert.match(transfer, /parseOrderIdempotencyKey/);
  assert.match(warehouseReturn, /parseOrderIdempotencyKey/);
  assert.match(warehouseClient, /"Idempotency-Key": returnOperationKey\.current/);
  assert.match(inventoryClient, /"Idempotency-Key": restockOperationKey\.current/);
});

test("the brand-portal warehouse stock route no longer calls set_warehouse_brand_stock (claude/partner-restock-request-backend: disabled, see tests/launchStateAndPermissions.test.ts) — the RPC itself stays defined and service_role-only, asserted above", () => {
  const stock = read("app/api/brand-portal/warehouse/stock/route.ts");
  assert.doesNotMatch(stock, /\.rpc\("set_warehouse_brand_stock"/);
});

test("review uploads are server-only and bucket privacy is reconciled deterministically", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("revokeinsert,update,deleteonpublic.reviewsfromauthenticated"));
  assert.ok(sql.includes("revokeinsert,update,deleteonpublic.review_imagesfromauthenticated"));
  assert.ok(sql.includes('droppolicyifexists"reviewauthorsuploadreviewimages"onstorage.objects'));
  assert.ok(sql.includes('droppolicyifexists"applicantscanuploadtheirownapplicationdocuments"onstorage.objects'));

  assert.match(migration, /'brand-application-documents'[\s\S]*?false,\s*10485760/i);
  assert.match(migration, /'review-images'[\s\S]*?true,\s*5242880/i);
  assert.match(migration, /'product-images'[\s\S]*?true,\s*5242880/i);
  assert.equal((migration.match(/on conflict \(id\) do update set/gi) ?? []).length, 3);
  assert.equal((migration.match(/public = excluded\.public/gi) ?? []).length, 3);
});

test("the internal SKU counter is RLS-enabled and inaccessible to clients", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("altertablepublic.brand_sku_countersenablerowlevelsecurity"));
  assert.ok(sql.includes("revokeallonpublic.brand_sku_countersfrompublic,anon,authenticated"));
  assert.ok(sql.includes("grantselect,insert,updateonpublic.brand_sku_counterstoservice_role"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.next_product_sku(uuid)toservice_role"));
});
