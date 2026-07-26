import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthCallback } from "../src/domain/auth-callback.ts";

test("auth callbacks accept implicit tokens and PKCE codes", () => {
  assert.deepEqual(parseAuthCallback("mahaly://reset-password#access_token=access&refresh_token=refresh&type=recovery"), {
    kind: "tokens",
    accessToken: "access",
    refreshToken: "refresh",
  });
  assert.deepEqual(parseAuthCallback("mahaly://?code=pkce-code"), { kind: "code", code: "pkce-code" });
  assert.equal(parseAuthCallback("mahaly://products/item"), null);
  assert.equal(parseAuthCallback("not a valid url"), null);
});
