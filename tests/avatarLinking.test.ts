import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveAvatarUrl } from "../lib/account/avatar.ts";

// Integration checks against the live/configured Supabase project (same
// convention as tests/security.rls.test.ts) for the account-linking /
// avatar-priority fix: profiles.avatar_url (manual upload) must never be
// overwritten by Google OAuth sign-in, identity linking, or metadata
// re-sync; profiles.provider_avatar_url (kept current by the
// on_auth_user_metadata_updated trigger) is only ever a fallback. A real
// Google OAuth handshake can't be driven from a Node test, so each
// "Google sign-in" here is simulated the same way GoTrue itself updates a
// user — admin.updateUserById({ user_metadata }) — which is exactly the
// operation that fires on_auth_user_metadata_updated. Every user this
// suite creates is deleted in a `finally` block (cascades to its profile
// row via `profiles.id references auth.users on delete cascade`), so
// nothing is left behind in the project.
//
// Requires an explicit RUN_LIVE_RLS=1 opt-in (audit finding TEST-01,
// docs/audits/2026-08-20-production-security-correctness-reliability-audit-en.md)
// — this suite creates and deletes real auth.users rows against whichever
// project .env.local points at, and must never run just because an
// ordinary `npm test` found credentials on disk.

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
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = env.RUN_LIVE_RLS === "1" && Boolean(supabaseUrl && serviceRoleKey);

function admin(): SupabaseClient {
  return createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false } });
}

async function createTestUser(
  db: SupabaseClient,
  tag: string,
  userMetadata?: Record<string, unknown>
) {
  const email = `test-avatar-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: "Test-1234-avatar",
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return data.user.id;
}

async function getProfile(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("id, avatar_url, provider_avatar_url")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function simulateOAuthMetadataSync(db: SupabaseClient, userId: string, avatarUrl: string) {
  // The same shape GoTrue writes on a Google sign-in / identity link.
  const { error } = await db.auth.admin.updateUserById(userId, {
    user_metadata: { avatar_url: avatarUrl, picture: avatarUrl, full_name: "Test User" },
  });
  if (error) throw error;
}

test(
  "Scenario A: new Email/Password signup creates exactly one auth user and one profile",
  { skip: !canRun },
  async () => {
    const db = admin();
    const userId = await createTestUser(db, "a");
    try {
      const profile = await getProfile(db, userId);
      assert.equal(profile.id, userId);
      assert.equal(profile.avatar_url, null, "a fresh signup must never have a manual avatar");
      assert.equal(profile.provider_avatar_url, null, "no OAuth provider was involved");
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "Scenario B: new Google-style signup stores the provider photo as a fallback only",
  { skip: !canRun },
  async () => {
    const db = admin();
    const googlePic = "https://lh3.googleusercontent.com/fixture-b";
    const userId = await createTestUser(db, "b", { avatar_url: googlePic, picture: googlePic, full_name: "Test B" });
    try {
      const profile = await getProfile(db, userId);
      assert.equal(profile.avatar_url, null, "no manual photo exists yet, even for a Google-only signup");
      assert.equal(profile.provider_avatar_url, googlePic);
      assert.equal(
        resolveAvatarUrl(profile.avatar_url, profile.provider_avatar_url),
        googlePic,
        "the Google photo is what the UI should display since it's the only one available"
      );
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "Scenario E: a user with no manual avatar gets provider_avatar_url as a fallback on Google sign-in",
  { skip: !canRun },
  async () => {
    const db = admin();
    const userId = await createTestUser(db, "e");
    try {
      const before = await getProfile(db, userId);
      assert.equal(before.avatar_url, null);
      assert.equal(before.provider_avatar_url, null);

      const googlePic = "https://lh3.googleusercontent.com/fixture-e";
      await simulateOAuthMetadataSync(db, userId, googlePic);

      const after = await getProfile(db, userId);
      assert.equal(after.avatar_url, null, "still no manual photo");
      assert.equal(after.provider_avatar_url, googlePic);
      assert.equal(resolveAvatarUrl(after.avatar_url, after.provider_avatar_url), googlePic);
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "Scenario D/H/I: a manual avatar survives repeated Google sign-ins and metadata refreshes",
  { skip: !canRun },
  async () => {
    const db = admin();
    const userId = await createTestUser(db, "d");
    try {
      const manualUrl = "https://storage.example/manual-fixture-d.jpg";
      // Simulates what app/api/account/avatar POST does: write profiles.avatar_url only.
      const { error: manualUploadError } = await db.from("profiles").update({ avatar_url: manualUrl }).eq("id", userId);
      assert.ifError(manualUploadError);

      // Repeated Google sign-ins (H) — each one hands over a slightly
      // different picture URL (Google does rotate these), simulating a
      // session refresh / re-login (I) each time too.
      for (let i = 0; i < 3; i += 1) {
        await simulateOAuthMetadataSync(db, userId, `https://lh3.googleusercontent.com/fixture-d-${i}`);
        const profile = await getProfile(db, userId);
        assert.equal(profile.avatar_url, manualUrl, `manual avatar must survive Google sign-in #${i + 1}`);
        assert.equal(profile.provider_avatar_url, `https://lh3.googleusercontent.com/fixture-d-${i}`);
        assert.equal(
          resolveAvatarUrl(profile.avatar_url, profile.provider_avatar_url),
          manualUrl,
          "manual avatar must still win the display priority"
        );
      }
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "Scenario F: uploading a manual avatar after previously relying on the Google photo takes over permanently",
  { skip: !canRun },
  async () => {
    const db = admin();
    const googlePic = "https://lh3.googleusercontent.com/fixture-f";
    const userId = await createTestUser(db, "f", { avatar_url: googlePic, picture: googlePic });
    try {
      const initial = await getProfile(db, userId);
      assert.equal(resolveAvatarUrl(initial.avatar_url, initial.provider_avatar_url), googlePic);

      const manualUrl = "https://storage.example/manual-fixture-f.jpg";
      const { error } = await db.from("profiles").update({ avatar_url: manualUrl }).eq("id", userId);
      assert.ifError(error);

      // A later Google sign-in must not undo the manual upload.
      await simulateOAuthMetadataSync(db, userId, "https://lh3.googleusercontent.com/fixture-f-refreshed");

      const after = await getProfile(db, userId);
      assert.equal(after.avatar_url, manualUrl);
      assert.equal(resolveAvatarUrl(after.avatar_url, after.provider_avatar_url), manualUrl);
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "Removing a manual avatar falls back to the provider photo without touching provider_avatar_url",
  { skip: !canRun },
  async () => {
    const db = admin();
    const googlePic = "https://lh3.googleusercontent.com/fixture-remove";
    const userId = await createTestUser(db, "remove", { avatar_url: googlePic, picture: googlePic });
    try {
      const manualUrl = "https://storage.example/manual-fixture-remove.jpg";
      await db.from("profiles").update({ avatar_url: manualUrl }).eq("id", userId);

      // Simulates app/api/account/avatar DELETE: clear avatar_url only.
      const { error } = await db.from("profiles").update({ avatar_url: null }).eq("id", userId);
      assert.ifError(error);

      const after = await getProfile(db, userId);
      assert.equal(after.avatar_url, null);
      assert.equal(after.provider_avatar_url, googlePic, "provider_avatar_url must be left untouched by removal");
      assert.equal(resolveAvatarUrl(after.avatar_url, after.provider_avatar_url), googlePic);
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "No duplicate profile is ever created for one auth.users id",
  { skip: !canRun },
  async () => {
    const db = admin();
    const userId = await createTestUser(db, "dup");
    try {
      const { data, error } = await db.from("profiles").select("id").eq("id", userId);
      assert.ifError(error);
      assert.equal(data?.length, 1, "exactly one profile row must exist for this auth user");
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  }
);

test(
  "Scenario C (structural): every auth user with more than one linked identity still has exactly one profile",
  { skip: !canRun },
  async () => {
    // General regression guard, not tied to any specific account — scans
    // whichever live users already have a linked Email + Google identity
    // (the real-world case this whole fix was written for) and asserts
    // Supabase's account linking still resolves to a single profile per
    // auth user, with no duplicate customer data possible.
    const db = admin();
    const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    assert.ifError(error);
    const multiIdentityUsers = (data?.users ?? []).filter((u) => (u.identities?.length ?? 0) > 1);
    for (const u of multiIdentityUsers) {
      const { data: profiles, error: profErr } = await db.from("profiles").select("id").eq("id", u.id);
      assert.ifError(profErr);
      assert.equal(
        profiles?.length,
        1,
        `auth user ${u.id} has ${u.identities?.length} linked identities but ${profiles?.length ?? 0} profile rows`
      );
    }
  }
);
