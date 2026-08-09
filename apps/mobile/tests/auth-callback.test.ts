import assert from "node:assert/strict";
import test from "node:test";
import type { AuthCallbackStateStore } from "../src/domain/auth-callback.ts";
import {
  buildAuthCallbackUrl,
  parseAuthCallback,
  savePendingAuthCallback,
  takePendingAuthCallback
} from "../src/domain/auth-callback.ts";

const SIGNUP_STATE = "123e4567-e89b-42d3-a456-426614174000";
const RECOVERY_STATE = "123e4567-e89b-42d3-b456-426614174001";
const OTHER_STATE = "123e4567-e89b-42d3-8456-426614174002";
const NOW = 2_000_000_000_000;

class MemoryStore implements AuthCallbackStateStore {
  readonly values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

function callbackUrl(flow: "signup" | "recovery", state: string, code = "pkce-code") {
  const url = new URL(buildAuthCallbackUrl(flow, state));
  url.searchParams.set("code", code);
  return url.toString();
}

test("auth callbacks accept only exact custom-scheme and verified HTTPS routes", () => {
  assert.deepEqual(parseAuthCallback(callbackUrl("signup", SIGNUP_STATE)), {
    kind: "code",
    code: "pkce-code",
    flow: "signup",
    state: SIGNUP_STATE
  });
  assert.deepEqual(
    parseAuthCallback(
      `https://mahalyapp.com/auth/mobile-callback/recovery?type=recovery&state=${RECOVERY_STATE}&code=recovery-code`
    ),
    {
      kind: "code",
      code: "recovery-code",
      flow: "recovery",
      state: RECOVERY_STATE
    }
  );
});

test("auth callbacks reject arbitrary origins, paths, flow types, and parameters", () => {
  const rejected = [
    "not a valid url",
    `https://evil.example/auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x`,
    `https://www.mahalyapp.com/auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x`,
    `http://mahalyapp.com/auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x`,
    `https://mahalyapp.com:444/auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x`,
    `mahaly://products/item?type=signup&state=${SIGNUP_STATE}&code=x`,
    `mahaly://evil/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x`,
    `mahaly://auth/mobile-callback/recovery?type=signup&state=${SIGNUP_STATE}&code=x`,
    `mahaly://auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}`,
    `mahaly://auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x&code=y`,
    `mahaly://auth/mobile-callback/signup?type=signup&type=recovery&state=${SIGNUP_STATE}&code=x`,
    `mahaly://auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&state=${OTHER_STATE}&code=x`,
    `mahaly://auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x&next=%2Fcheckout`,
    `mahaly://user@auth/mobile-callback/signup?type=signup&state=${SIGNUP_STATE}&code=x`,
    `mahaly://auth/mobile-callback/signup?type=signup&state=guessable&code=x`
  ];

  for (const url of rejected) assert.equal(parseAuthCallback(url), null, url);
});

test("implicit raw-token callbacks are rejected even on an allowed route", () => {
  assert.equal(
    parseAuthCallback(
      `mahaly://auth/mobile-callback/recovery?type=recovery&state=${RECOVERY_STATE}#access_token=access&refresh_token=refresh&type=recovery`
    ),
    null
  );
  assert.equal(
    parseAuthCallback(
      `mahaly://auth/mobile-callback/recovery?type=recovery&state=${RECOVERY_STATE}&access_token=access&refresh_token=refresh`
    ),
    null
  );
});

test("pending callback state is matched, consumed once, and rejects replay", async () => {
  const store = new MemoryStore();
  await savePendingAuthCallback(store, {
    version: 1,
    flow: "recovery",
    state: RECOVERY_STATE,
    createdAt: NOW
  });
  const url = callbackUrl("recovery", RECOVERY_STATE);

  assert.equal((await takePendingAuthCallback(url, store, NOW))?.flow, "recovery");
  assert.equal(await takePendingAuthCallback(url, store, NOW), null);
});

test("wrong state does not consume the legitimate pending callback", async () => {
  const store = new MemoryStore();
  await savePendingAuthCallback(store, {
    version: 1,
    flow: "signup",
    state: SIGNUP_STATE,
    createdAt: NOW
  });

  assert.equal(await takePendingAuthCallback(callbackUrl("signup", OTHER_STATE), store, NOW), null);
  assert.equal(
    (await takePendingAuthCallback(callbackUrl("signup", SIGNUP_STATE), store, NOW))?.state,
    SIGNUP_STATE
  );
});

test("expired and future-dated callback state fails closed", async () => {
  for (const createdAt of [NOW - 86_400_001, NOW + 1]) {
    const store = new MemoryStore();
    await savePendingAuthCallback(store, {
      version: 1,
      flow: "signup",
      state: SIGNUP_STATE,
      createdAt
    });
    assert.equal(
      await takePendingAuthCallback(callbackUrl("signup", SIGNUP_STATE), store, NOW),
      null
    );
  }
});
