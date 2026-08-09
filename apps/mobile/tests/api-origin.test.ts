import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrustedApiBaseUrl } from "../src/domain/api-origin.ts";

test("mobile bearer tokens are sent only to the exact configured HTTPS host", () => {
  assert.equal(resolveTrustedApiBaseUrl("https://shop.example.com/", "shop.example.com"), "https://shop.example.com");
  assert.throws(() => resolveTrustedApiBaseUrl("http://shop.example.com", "shop.example.com"), /not trusted/);
  assert.throws(() => resolveTrustedApiBaseUrl("https://evil.example", "shop.example.com"), /not trusted/);
  assert.throws(() => resolveTrustedApiBaseUrl("https://shop.example.com@evil.example", "shop.example.com"), /not trusted/);
  assert.throws(() => resolveTrustedApiBaseUrl("https://shop.example.com?redirect=evil", "shop.example.com"), /invalid/);
});

test("local HTTP is accepted only through the explicit development switch", () => {
  assert.equal(resolveTrustedApiBaseUrl("http://localhost:3000", "localhost", true), "http://localhost:3000");
  assert.throws(() => resolveTrustedApiBaseUrl("http://localhost:3000", "localhost", false), /not trusted/);
});
