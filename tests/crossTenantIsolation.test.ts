import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupOrFail, resolveLiveSupabaseTestConfig } from "./helpers/liveSupabaseTestConfig.ts";

// Live cross-tenant isolation checks against the configured Supabase project.
//
// tests/security.rls.test.ts already proves privileged RPCs reject the anon
// key and that the catalog tables don't leak hidden products. This file
// covers the question that one can't answer: whether one *authenticated*
// user can reach another authenticated user's rows. That distinction matters
// because every policy here is `auth.uid()`-based — an anon-key test passes
// trivially against them (there is no uid at all), so it would keep passing
// even if the owner predicate were dropped entirely.
//
// Method: create two throwaway accounts, seed real private rows for B via the
// service role, then assert A reads zero of them AND that B reads its own.
// The second half is what makes this meaningful — a blanket "deny everyone"
// policy (or an empty table) would otherwise look identical to correct
// isolation. Accounts are deleted in a finally block; the cascade removes the
// seeded rows with them, so a failed run leaves nothing behind.
//
// Skipped (not failed) without credentials, same convention as
// tests/security.rls.test.ts.
//
// Requires RUN_LIVE_RLS=1 AND RUN_LIVE_RLS_ALLOWED_PROJECT_REF (see
// tests/helpers/liveSupabaseTestConfig.ts, corrective pass 2 Section 6 —
// docs/audits/2026-08-20-production-security-correctness-reliability-audit-en.md,
// TEST-01 follow-up) — this suite creates and deletes real auth users and
// tenant rows against whichever project .env.local points at, and must
// never run just because an ordinary `npm test` found credentials on disk.
// Cleanup failures now fail the suite instead of being swallowed.

const liveConfig = resolveLiveSupabaseTestConfig();
const hasCredentials = Boolean(liveConfig?.serviceRoleKey);
const supabaseUrl = liveConfig?.supabaseUrl;
const anonKey = liveConfig?.anonKey;
const serviceRoleKey = liveConfig?.serviceRoleKey ?? undefined;

interface TestAccount {
  id: string;
  email: string;
  client: SupabaseClient;
}

// Domain is reserved by RFC 2606 and can never receive mail, so these can
// never collide with or notify a real person.
function throwawayEmail(tag: string): string {
  return `zz-isolation-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
}

async function createSignedInAccount(
  admin: SupabaseClient,
  tag: string
): Promise<TestAccount> {
  const email = throwawayEmail(tag);
  const password = `Iso!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${tag}): ${error?.message}`);

  const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn(${tag}): ${signIn.error.message}`);

  return { id: data.user.id, email, client };
}

test(
  "an authenticated user cannot read another user's private rows",
  { skip: !hasCredentials },
  async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const createdUserIds: string[] = [];
    try {
      const userA = await createSignedInAccount(admin, "a");
      createdUserIds.push(userA.id);
      const userB = await createSignedInAccount(admin, "b");
      createdUserIds.push(userB.id);

      // Seed genuinely private rows for B.
      const seededAddress = await admin
        .from("addresses")
        .insert({
          user_id: userB.id,
          label: "Home",
          first_name: "Isolation",
          last_name: "Fixture",
          phone: "01000000000",
          address_line: "B private address line",
          city: "Cairo",
          governorate: "Cairo",
          is_default: true,
        })
        .select()
        .maybeSingle();
      assert.equal(seededAddress.error, null, "failed to seed B's address fixture");

      // Guard the guard: if the seed silently produced nothing, the
      // isolation assertions below would pass vacuously.
      const { count: bAddressCount } = await admin
        .from("addresses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userB.id);
      assert.ok(
        (bAddressCount ?? 0) > 0,
        "fixture precondition failed — B has no rows, so the isolation assertion would be vacuous"
      );

      // A must see none of B's rows, on every user-scoped table.
      for (const [table, ownerColumn] of [
        ["addresses", "user_id"],
        ["profiles", "id"],
        ["user_notifications", "user_id"],
        ["user_sessions", "user_id"],
        ["phone_verifications", "user_id"],
        ["master_orders", "user_id"],
      ] as const) {
        const { data, error } = await userA.client.from(table).select("*").eq(ownerColumn, userB.id);
        // A hard privilege denial is an equally acceptable outcome — the
        // table is simply unreachable from a user-role client at all.
        if (error) continue;
        assert.equal(
          data?.length ?? 0,
          0,
          `user A read ${data?.length} row(s) of user B's ${table} — cross-tenant leak`
        );
      }

      // The other half: B *can* read its own address. Without this, a
      // policy regressed to "deny all" would pass the block above.
      const { data: ownRows, error: ownError } = await userB.client
        .from("addresses")
        .select("*")
        .eq("user_id", userB.id);
      assert.equal(ownError, null, "user B could not read its own addresses");
      assert.ok(
        (ownRows?.length ?? 0) > 0,
        "user B cannot see its own address — the owner policy is broken, not just restrictive"
      );
    } finally {
      await cleanupOrFail(
        "crossTenantIsolation",
        createdUserIds.map((id) => () => admin.auth.admin.deleteUser(id))
      );
    }
  }
);

test(
  "an authenticated user cannot write to another user's rows or self-elevate to admin",
  { skip: !hasCredentials },
  async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const createdUserIds: string[] = [];
    try {
      const userA = await createSignedInAccount(admin, "wa");
      createdUserIds.push(userA.id);
      const userB = await createSignedInAccount(admin, "wb");
      createdUserIds.push(userB.id);

      // Writing to another user's profile must affect nothing.
      const hijack = await userA.client
        .from("profiles")
        .update({ full_name: "hijacked-by-isolation-test" })
        .eq("id", userB.id)
        .select();
      if (!hijack.error) {
        assert.equal(hijack.data?.length ?? 0, 0, "user A updated user B's profile row");
      }
      const { data: bProfile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userB.id)
        .maybeSingle();
      assert.notEqual(
        bProfile?.full_name,
        "hijacked-by-isolation-test",
        "user B's profile was actually modified by user A"
      );

      // Self-elevation to admin must be impossible from a user-role client.
      const elevate = await userA.client
        .from("profiles")
        .update({ is_admin: true, role: "admin" })
        .eq("id", userA.id)
        .select();
      if (!elevate.error) {
        assert.equal(elevate.data?.length ?? 0, 0, "user A self-elevated via a direct profiles update");
      }
      const { data: aProfile } = await admin
        .from("profiles")
        .select("is_admin, role")
        .eq("id", userA.id)
        .maybeSingle();
      assert.equal(aProfile?.is_admin, false, "user A ended up with is_admin = true");
      assert.notEqual(aProfile?.role, "admin", "user A ended up with the admin role");
    } finally {
      await cleanupOrFail(
        "crossTenantIsolation",
        createdUserIds.map((id) => () => admin.auth.admin.deleteUser(id))
      );
    }
  }
);

test(
  "the anon key cannot read any personally identifying table",
  { skip: !hasCredentials },
  async () => {
    const anon = createClient(supabaseUrl!, anonKey!);

    for (const table of [
      "profiles",
      "addresses",
      "orders",
      "order_items",
      "master_orders",
      "user_notifications",
      "user_sessions",
      "phone_verifications",
      "payment_attempts",
      "brand_applications",
      "brand_application_documents",
      "audit_logs",
    ] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      if (error) continue; // a hard permission denial is the strongest pass
      assert.equal(
        data?.length ?? 0,
        0,
        `anon key read a ${table} row — PII exposed without authentication`
      );
    }
  }
);
