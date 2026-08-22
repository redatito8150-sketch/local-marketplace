import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260822182430_admin_order_operations.sql");
const adminRoute = read("app/api/admin/orders/[id]/route.ts");
const adminData = read("lib/data/admin.ts");

test("shipment operations add constrained tracking data and a canonical updated timestamp", () => {
  assert.match(migration, /add column if not exists carrier_name text/);
  assert.match(migration, /add column if not exists tracking_number text/);
  assert.match(migration, /add column if not exists expected_delivery_at timestamptz/);
  assert.match(migration, /add column if not exists updated_at timestamptz not null default now\(\)/);
  assert.match(migration, /orders_carrier_name_length_check/);
  assert.match(migration, /orders_tracking_number_length_check/);
  assert.match(migration, /create trigger orders_touch_updated_at/);
});

test("admin purchase pagination RPCs are service-role only and use an empty search path", () => {
  for (const routine of ["list_admin_order_purchase_page", "get_admin_order_purchase_queue_counts", "list_admin_order_filter_brands"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${routine}`));
    assert.match(migration, new RegExp(`function public\\.${routine}[\\s\\S]*?security invoker[\\s\\S]*?set search_path = ''`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${routine}[\\s\\S]*?from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${routine}[\\s\\S]*?to service_role`));
  }
  assert.match(adminData, /supabaseAdmin\.rpc\("list_admin_order_purchase_page"/);
  assert.match(adminData, /supabaseAdmin\.rpc\("get_admin_order_purchase_queue_counts"/);
  assert.match(adminData, /supabaseAdmin\.rpc\("list_admin_order_filter_brands"/);
  assert.match(migration, /char_length\(regexp_replace\(translate[\s\S]*?\)\) >= 3/);
  assert.equal((migration.match(/in \('confirmed', 'preparing', 'ready_for_pickup', 'shipped'\)/g) ?? []).length >= 2, true);
});

test("tracking writes are admin-gated, idempotent, concurrency-safe and audited before customer notification", () => {
  assert.match(adminRoute, /requireAdminUser\(\)/);
  assert.match(adminRoute, /trackingUnchanged/);
  assert.match(adminRoute, /\.eq\("updated_at", existingTracking\.updated_at\)/);
  assert.match(adminRoute, /status: 409/);
  assert.match(adminRoute, /action: "shipment_tracking_update"/);
  assert.match(adminRoute, /notifyUser\(existingTracking\.user_id, "order_tracking_updated"/);
});

test("customer orders receive the same delivery truth without gaining an admin action", () => {
  const customerData = read("lib/data/orders.ts");
  const orderCard = read("components/account/OrderCard.tsx");
  assert.match(customerData, /carrierName: row\.carrier_name/);
  assert.match(customerData, /trackingNumber: row\.tracking_number/);
  assert.match(customerData, /expectedDeliveryAt: row\.expected_delivery_at/);
  assert.match(orderCard, /Delivery details/);
  assert.match(orderCard, /Tracking \{order\.trackingNumber\}/);
  assert.doesNotMatch(orderCard, /ShipmentTrackingForm/);
});

test("admin activity translates audit events and deduplicates mirrored status history", () => {
  const activity = read("lib/orders/adminOrderActivity.ts");
  assert.match(activity, /sameStatusEvent/);
  assert.match(activity, /shipment_tracking_update/);
  assert.match(activity, /actorRole/);
  assert.match(activity, /Math\.abs\(Date\.parse\(log\.createdAt\) - Date\.parse\(createdAt\)\) <= 10_000/);
});
