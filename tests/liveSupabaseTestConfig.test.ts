import test from "node:test";
import assert from "node:assert/strict";
import { resolveLiveSupabaseTestConfig, cleanupOrFail } from "./helpers/liveSupabaseTestConfig.ts";

// Genuine behavioral coverage (no live database needed) for the shared
// live-test config loader itself — corrective pass 2, Section 6/9
// (docs/audits/2026-08-20-production-security-correctness-reliability-
// audit-en.md): "regex/source-presence tests are not sufficient evidence
// for behavioral fixes." This actually calls resolveLiveSupabaseTestConfig()
// and cleanupOrFail() under different environments and asserts their real
// return/throw behavior, rather than just asserting the source text exists.
//
// Mutates process.env for the duration of each test and restores it
// afterward — safe to run as part of the ordinary `npm test` run, since it
// never touches a real Supabase project itself (the whole point of the
// loader it's testing).

const ENV_KEYS = [
  "RUN_LIVE_RLS",
  "RUN_LIVE_RLS_ALLOWED_PROJECT_REF",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => void) {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("resolveLiveSupabaseTestConfig returns null (skip) with no env vars set at all — ordinary `npm test` never reaches a live database", () => {
  withEnv({}, () => {
    assert.equal(resolveLiveSupabaseTestConfig(), null);
  });
});

test("resolveLiveSupabaseTestConfig returns null (skip) when RUN_LIVE_RLS is unset even if URL/keys happen to be present", () => {
  withEnv(
    {
      SUPABASE_URL: "https://disposableref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      RUN_LIVE_RLS_ALLOWED_PROJECT_REF: "disposableref",
    },
    () => {
      assert.equal(resolveLiveSupabaseTestConfig(), null);
    }
  );
});

test("resolveLiveSupabaseTestConfig throws (does not skip) when RUN_LIVE_RLS=1 but RUN_LIVE_RLS_ALLOWED_PROJECT_REF is missing", () => {
  withEnv(
    {
      RUN_LIVE_RLS: "1",
      SUPABASE_URL: "https://disposableref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    },
    () => {
      assert.throws(() => resolveLiveSupabaseTestConfig(), /RUN_LIVE_RLS_ALLOWED_PROJECT_REF/);
    }
  );
});

test("resolveLiveSupabaseTestConfig throws when the allowlisted ref does not match SUPABASE_URL's actual ref", () => {
  withEnv(
    {
      RUN_LIVE_RLS: "1",
      SUPABASE_URL: "https://disposableref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      RUN_LIVE_RLS_ALLOWED_PROJECT_REF: "someotherref",
    },
    () => {
      assert.throws(() => resolveLiveSupabaseTestConfig(), /does not match the project ref/);
    }
  );
});

test("the production project is rejected even when somebody explicitly allowlists it", () => {
  withEnv(
    {
      RUN_LIVE_RLS: "1",
      SUPABASE_URL: "https://kdrrzrboibwyxzrfwsgu.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      RUN_LIVE_RLS_ALLOWED_PROJECT_REF: "kdrrzrboibwyxzrfwsgu",
    },
    () => {
      assert.throws(() => resolveLiveSupabaseTestConfig(), /hard denylist/);
    }
  );
});

test("resolveLiveSupabaseTestConfig throws on an unrecognizable SUPABASE_URL host instead of silently skipping", () => {
  withEnv(
    {
      RUN_LIVE_RLS: "1",
      SUPABASE_URL: "https://not-a-supabase-host.example.com",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      RUN_LIVE_RLS_ALLOWED_PROJECT_REF: "whatever",
    },
    () => {
      assert.throws(() => resolveLiveSupabaseTestConfig(), /not a recognizable/);
    }
  );
});

test("resolveLiveSupabaseTestConfig succeeds and is case-insensitive on the project ref when everything matches", () => {
  withEnv(
    {
      RUN_LIVE_RLS: "1",
      SUPABASE_URL: "https://DisposableRef123.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      RUN_LIVE_RLS_ALLOWED_PROJECT_REF: "disposableref123",
    },
    () => {
      const config = resolveLiveSupabaseTestConfig();
      assert.ok(config);
      assert.equal(config?.projectRef, "disposableref123");
      assert.equal(config?.supabaseUrl, "https://DisposableRef123.supabase.co");
      assert.equal(config?.serviceRoleKey, "service-key");
    }
  );
});

test("cleanupOrFail resolves quietly when every action succeeds", async () => {
  await assert.doesNotReject(
    cleanupOrFail("unit-test", [
      async () => ({ error: null }),
      async () => {
        /* void return is also accepted */
      },
    ])
  );
});

test("cleanupOrFail throws (fails the suite) when an action returns an error, instead of swallowing it", async () => {
  await assert.rejects(
    cleanupOrFail("unit-test", [async () => ({ error: { message: "delete failed: still referenced" } })]),
    /delete failed: still referenced/
  );
});

test("cleanupOrFail throws when an action itself rejects, and still runs every other action first", async () => {
  let secondActionRan = false;
  await assert.rejects(
    cleanupOrFail("unit-test", [
      async () => {
        throw new Error("network error");
      },
      async () => {
        secondActionRan = true;
        return { error: null };
      },
    ]),
    /network error/
  );
  assert.equal(secondActionRan, true, "cleanupOrFail must attempt every action, not stop at the first failure");
});
