import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("customer-owned routes are guarded before rendering private data", () => {
  for (const path of [
    "../app/addresses/index.tsx",
    "../app/addresses/new.tsx",
    "../app/addresses/[id].tsx",
    "../app/orders/index.tsx",
    "../app/orders/[id].tsx",
    "../app/reviews/write.tsx",
    "../app/settings/profile.tsx",
    "../app/settings/notifications.tsx",
  ]) {
    assert.match(read(path), /AuthGuard/);
  }
});

test("authentication restores sessions and clears them through Supabase", () => {
  const provider = read("../src/providers/AuthProvider.tsx");
  assert.match(provider, /auth\.getSession\(\)/);
  assert.match(provider, /auth\.onAuthStateChange/);
  assert.match(provider, /auth\.signOut\(\)/);
});
