import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  getMfaUserState,
  resolvePendingMfaChallenge,
} from "../lib/supabase/mfaAuth.ts";

type AuthClient = Pick<SupabaseClient, "auth">;

const TEST_USER = { id: "00000000-0000-4000-8000-000000000001" } as User;

function fakeAuthClient(options: {
  user?: User | null;
  userError?: unknown;
  currentLevel?: "aal1" | "aal2";
  nextLevel?: "aal1" | "aal2";
  assuranceError?: unknown;
  factors?: Array<{ id: string; status: "verified" | "unverified" }>;
  observedTokens?: Array<string | undefined>;
}): AuthClient {
  const auth = {
    getUser: async (token?: string) => {
      options.observedTokens?.push(token);
      return {
        data: { user: options.user === undefined ? TEST_USER : options.user },
        error: options.userError ?? null,
      };
    },
    mfa: {
      getAuthenticatorAssuranceLevel: async (token?: string) => {
        options.observedTokens?.push(token);
        return {
          data: options.assuranceError
            ? null
            : {
                currentLevel: options.currentLevel ?? "aal1",
                nextLevel: options.nextLevel ?? "aal1",
                currentAuthenticationMethods: [],
              },
          error: options.assuranceError ?? null,
        };
      },
      listFactors: async () => ({
        data: {
          all: options.factors ?? [],
          totp: options.factors ?? [],
          phone: [],
          webauthn: [],
        },
        error: null,
      }),
    },
  };

  return { auth: auth as unknown as AuthClient["auth"] };
}

test("getMfaUserState validates the user and AAL with the same Bearer token", async () => {
  const observedTokens: Array<string | undefined> = [];
  const state = await getMfaUserState(
    fakeAuthClient({
      currentLevel: "aal1",
      nextLevel: "aal2",
      observedTokens,
    }),
    "verified-access-token"
  );

  assert.equal(state.status, "mfa_required");
  assert.deepEqual(observedTokens, ["verified-access-token", "verified-access-token"]);
});

test("getMfaUserState preserves accounts that have not enrolled a factor", async () => {
  const state = await getMfaUserState(
    fakeAuthClient({ currentLevel: "aal1", nextLevel: "aal1" })
  );

  assert.equal(state.status, "authenticated");
  assert.equal(state.user?.id, TEST_USER.id);
});

test("getMfaUserState never trusts AAL when user verification fails", async () => {
  const observedTokens: Array<string | undefined> = [];
  const state = await getMfaUserState(
    fakeAuthClient({ user: null, userError: new Error("invalid token"), observedTokens }),
    "invalid-token"
  );

  assert.equal(state.status, "unauthenticated");
  assert.deepEqual(observedTokens, ["invalid-token"]);
});

test("resolvePendingMfaChallenge restores a verified TOTP challenge after reload", async () => {
  const result = await resolvePendingMfaChallenge(
    fakeAuthClient({
      currentLevel: "aal1",
      nextLevel: "aal2",
      factors: [
        { id: "unverified-factor", status: "unverified" },
        { id: "verified-factor", status: "verified" },
      ],
    })
  );

  assert.deepEqual(result, {
    status: "required",
    challenge: { factorId: "verified-factor" },
  });
});

test("resolvePendingMfaChallenge fails closed when AAL or factors are unavailable", async () => {
  assert.deepEqual(
    await resolvePendingMfaChallenge(
      fakeAuthClient({ assuranceError: new Error("network unavailable") })
    ),
    { status: "unavailable", challenge: null }
  );
  assert.deepEqual(
    await resolvePendingMfaChallenge(
      fakeAuthClient({ currentLevel: "aal1", nextLevel: "aal2", factors: [] })
    ),
    { status: "unavailable", challenge: null }
  );
});
