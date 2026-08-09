import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const source = readFileSync(new URL("../src/navigation/routes.ts", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const { extractExpoPathFromURL } = require("../node_modules/expo-router/build/fork/extractPathFromURL.js");

test("route registry includes every primary tab and auth destination", () => {
  for (const route of ["home", "categories", "wishlist", "cart", "profile", "signIn", "signUp", "mfa"]) {
    assert.match(source, new RegExp(`\\b${route}:`));
  }
});

test("entity routes encode untrusted path segments", () => {
  assert.match(source, /encodeURIComponent\(id\)/);
  assert.match(source, /encodeURIComponent\(slug\)/);
});

test("mobile auth callback URLs resolve to the Expo Router callback screen", () => {
  const prefixes = ["mahaly://", "https://mahalyapp.com"];
  assert.equal(
    extractExpoPathFromURL(prefixes, "mahaly://auth/mobile-callback/signup?type=signup"),
    "auth/mobile-callback/signup?type=signup"
  );
  assert.equal(
    extractExpoPathFromURL(prefixes, "https://mahalyapp.com/auth/mobile-callback/recovery?type=recovery"),
    "auth/mobile-callback/recovery?type=recovery"
  );
});
