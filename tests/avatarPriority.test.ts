import test from "node:test";
import assert from "node:assert/strict";
import { resolveAvatarUrl } from "../lib/account/avatar.ts";

// Scenario D/E/F priority logic — the pure decision the UI makes once the
// database already holds avatar_url / provider_avatar_url. See
// tests/avatarLinking.test.ts for how those two columns get populated.

test("resolveAvatarUrl prefers the manually uploaded avatar_url", () => {
  assert.equal(
    resolveAvatarUrl("https://storage.example/manual.jpg", "https://lh3.googleusercontent.com/google.jpg"),
    "https://storage.example/manual.jpg"
  );
});

test("resolveAvatarUrl falls back to provider_avatar_url when avatar_url is null", () => {
  assert.equal(
    resolveAvatarUrl(null, "https://lh3.googleusercontent.com/google.jpg"),
    "https://lh3.googleusercontent.com/google.jpg"
  );
});

test("resolveAvatarUrl falls back to provider_avatar_url when avatar_url is an empty string", () => {
  assert.equal(
    resolveAvatarUrl("", "https://lh3.googleusercontent.com/google.jpg"),
    "https://lh3.googleusercontent.com/google.jpg"
  );
});

test("resolveAvatarUrl falls back to the placeholder (null) when neither is set", () => {
  assert.equal(resolveAvatarUrl(null, null), null);
  assert.equal(resolveAvatarUrl(undefined, undefined), null);
});

test("resolveAvatarUrl never returns the provider photo once a manual photo exists", () => {
  // Scenario F: manual upload after previously having only a provider photo.
  const afterManualUpload = resolveAvatarUrl("https://storage.example/manual.jpg", "https://lh3.googleusercontent.com/google.jpg");
  assert.equal(afterManualUpload, "https://storage.example/manual.jpg");
});
