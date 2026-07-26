import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/navigation/routes.ts", import.meta.url), "utf8");

test("route registry includes every primary tab and auth destination", () => {
  for (const route of ["home", "categories", "wishlist", "cart", "profile", "signIn", "signUp"]) {
    assert.match(source, new RegExp(`\\b${route}:`));
  }
});

test("entity routes encode untrusted path segments", () => {
  assert.match(source, /encodeURIComponent\(id\)/);
  assert.match(source, /encodeURIComponent\(slug\)/);
});
