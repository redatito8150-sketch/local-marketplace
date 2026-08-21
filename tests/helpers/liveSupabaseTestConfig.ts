import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Corrective pass 2, Section 6 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md, TEST-01 follow-up): every live-DB
// test suite (security.rls.test.ts, avatarLinking.test.ts,
// crossTenantIsolation.test.ts, and any future one) must resolve its
// "should I run, and against what" decision through this ONE loader,
// instead of each file re-implementing its own .env.local parsing and
// opt-in check. Two independent gates, both required:
//
//   1. RUN_LIVE_RLS=1 — the plain opt-in flag this repo already used.
//   2. RUN_LIVE_RLS_ALLOWED_PROJECT_REF — the developer must additionally
//      name the EXACT disposable Supabase project ref (the <ref> in
//      https://<ref>.supabase.co) they intend these tests to create and
//      delete real rows against. A flag alone is not enough to mutate
//      data; the target must be explicitly named too.
//
// Deny-by-default: with no env vars set (an ordinary `npm test`, or CI
// without a live-tests job), resolveLiveSupabaseTestConfig() returns null
// and every live suite skips — it can never reach a live database. Once
// RUN_LIVE_RLS=1 IS set, a missing/mismatched project ref, or a project
// ref on the hard denylist below, THROWS rather than silently skipping —
// a developer who deliberately opted in and got the target wrong should
// see a loud configuration error, not a quietly-skipped suite that looks
// like a pass.
//
// Supabase project refs are public host identifiers, not credentials. Keep
// production hard-denied in committed code so it remains blocked even if a
// developer accidentally copies it into RUN_LIVE_RLS_ALLOWED_PROJECT_REF.
const HARD_DENY_PROJECT_REFS: readonly string[] = ["kdrrzrboibwyxzrfwsgu"];

export interface LiveSupabaseTestConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string | null;
  projectRef: string;
}

function loadDotEnvLocal(): Record<string, string> {
  const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const envPath = path.join(rootDir, ".env.local");
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

function extractProjectRef(supabaseUrl: string): string | null {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(supabaseUrl.trim());
  return match ? match[1].toLowerCase() : null;
}

// Returns null (meaning: every dependent test suite must skip) whenever
// RUN_LIVE_RLS is not exactly "1" — this is the only non-throwing exit.
// Every other failure mode past that point is a deliberate opt-in gone
// wrong and throws instead, so a misconfigured live-test run fails loudly
// rather than silently reporting "0 tests ran" as if nothing were wrong.
export function resolveLiveSupabaseTestConfig(): LiveSupabaseTestConfig | null {
  const env = { ...loadDotEnvLocal(), ...(process.env as Record<string, string | undefined>) };
  if (env.RUN_LIVE_RLS !== "1") return null;

  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "RUN_LIVE_RLS=1 but SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — refusing to run live tests without knowing what project they would target."
    );
  }

  const projectRef = extractProjectRef(supabaseUrl);
  if (!projectRef) {
    throw new Error(
      `RUN_LIVE_RLS=1 but SUPABASE_URL ("${supabaseUrl}") is not a recognizable https://<ref>.supabase.co host — refusing to run live tests against an unrecognized host.`
    );
  }

  if (HARD_DENY_PROJECT_REFS.includes(projectRef)) {
    throw new Error(
      `RUN_LIVE_RLS=1 is pointed at project ref "${projectRef}", which is on this repo's hard denylist (HARD_DENY_PROJECT_REFS in tests/helpers/liveSupabaseTestConfig.ts) — live tests must never run against it. Refusing to proceed.`
    );
  }

  const allowedRef = env.RUN_LIVE_RLS_ALLOWED_PROJECT_REF;
  if (!allowedRef) {
    throw new Error(
      "RUN_LIVE_RLS=1 also requires RUN_LIVE_RLS_ALLOWED_PROJECT_REF, set to the exact disposable Supabase project ref you intend these tests to mutate (the <ref> in https://<ref>.supabase.co). Refusing to guess which project is safe to run against."
    );
  }
  if (allowedRef.trim().toLowerCase() !== projectRef) {
    throw new Error(
      `RUN_LIVE_RLS_ALLOWED_PROJECT_REF ("${allowedRef}") does not match the project ref resolved from SUPABASE_URL ("${projectRef}") — refusing to run live tests against a project that was not explicitly allowlisted for this run.`
    );
  }

  return { supabaseUrl, anonKey, serviceRoleKey, projectRef };
}

// Runs every cleanup action and collects failures instead of swallowing
// them. Corrective pass 2, Section 6: a live suite's teardown (deleting
// throwaway auth users/rows it created) used to end every call in
// `.catch(() => undefined)` — a cleanup failure left real fixture data
// behind in the live project with nothing ever reporting it. Call this
// from a `finally` block; it throws (failing the suite) if anything in
// `actions` failed, after every action has still been attempted.
export async function cleanupOrFail(
  label: string,
  // PromiseLike, not Promise: Supabase's query builders (e.g.
  // admin.from(...).delete()...) are thenables, not real Promise
  // instances, and are passed here directly without an intermediate await.
  actions: ReadonlyArray<() => PromiseLike<{ error: { message: string } | null } | void>>
): Promise<void> {
  const failures: string[] = [];
  for (const action of actions) {
    try {
      const result = await action();
      if (result && "error" in result && result.error) {
        failures.push(result.error.message);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    throw new Error(`${label}: ${failures.length} cleanup action(s) failed — ${failures.join("; ")}`);
  }
}
