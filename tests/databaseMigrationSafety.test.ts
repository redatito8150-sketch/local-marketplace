import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(rootDir, "supabase", "migrations");
const placeOrderHotfix = "20260810000002_lock_down_place_order_overloads.sql";

function readMigration(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8");
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

function compactSql(sql: string): string {
  return stripSqlComments(sql).toLowerCase().replace(/\s+/g, "");
}

test("versioned reset migrations cannot contain executable data or schema operations", () => {
  const resetMigrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => /reset|wipe|purge|clean[_-]?test/i.test(name));

  assert.ok(
    resetMigrations.includes("20260730000001_reset_test_catalog_data.sql"),
    "expected the historical catalog reset migration to remain guarded"
  );
  assert.ok(
    resetMigrations.includes("20260806000004_full_reset_to_clean_test_state.sql"),
    "expected the historical full reset migration to remain guarded"
  );

  // Reset-shaped migrations are documentation-only. Use a deliberately broad
  // statement deny-list so the guard also catches indirect/dynamic reset
  // attempts (CALL, EXECUTE, PERFORM, or SELECT of a mutating function).
  const dataOrSchemaOperation = /\b(?:insert|update|delete|merge|truncate|copy|create|alter|drop|grant|revoke|call|execute|perform|select)\b/i;

  for (const name of resetMigrations) {
    const executableSql = stripSqlComments(readMigration(name));
    assert.doesNotMatch(
      executableSql,
      dataOrSchemaOperation,
      `${name} must stay documentation-only; use an explicitly disposable development database for resets`
    );
  }
});

test("place_order hotfix drops every known legacy overload", () => {
  const sql = compactSql(readMigration(placeOrderHotfix));
  const legacySignatures = [
    "public.place_order(text,text,text,text,text,text,uuid,jsonb)",
    "public.place_order(text,text,text,text,text,text,uuid,jsonb,text)",
    "public.place_order(text,text,text,text,text,text,uuid,jsonb,text,uuid)",
  ];

  for (const signature of legacySignatures) {
    assert.ok(
      sql.includes(`dropfunctionifexists${signature};`),
      `hotfix must drop legacy overload ${signature}`
    );
  }

  assert.ok(
    sql.includes("andp.oid<>v_canonical::oid"),
    "runtime guard must reject any unexpected overload not known to the repository"
  );
});

test("only service_role can execute the canonical place_order function", () => {
  const sql = compactSql(readMigration(placeOrderHotfix));
  const canonical = "public.place_order(text,text,text,text,text,text,uuid,jsonb,text,uuid,numeric,numeric)";

  assert.ok(
    sql.includes(`revokeallonfunction${canonical}frompublic,anon,authenticated;`),
    "hotfix must revoke direct and inherited client execution"
  );
  assert.ok(
    sql.includes(`grantexecuteonfunction${canonical}toservice_role;`),
    "hotfix must explicitly preserve the trusted server execution path"
  );
  assert.ok(
    sql.includes("alterdefaultprivilegesinschemapublicrevokeexecuteonfunctionsfrompublic;"),
    "future functions created by the migration role must not default to PUBLIC EXECUTE"
  );
  assert.ok(
    sql.includes("alterdefaultprivilegesinschemapublicrevokeexecuteonfunctionsfromanon,authenticated;"),
    "future functions must not receive direct client-role defaults"
  );
  assert.ok(
    sql.includes("has_function_privilege('anon',v_canonical,'execute')") &&
      sql.includes("has_function_privilege('authenticated',v_canonical,'execute')") &&
      sql.includes("has_function_privilege('service_role',v_canonical,'execute')"),
    "migration must verify the effective ACL, not just issue GRANT/REVOKE statements"
  );
});

test("no migration at or after the place_order hotfix reopens client execution", () => {
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const hotfixIndex = migrations.indexOf(placeOrderHotfix);
  assert.notEqual(hotfixIndex, -1, "place_order hotfix migration must exist");

  const publicPlaceOrderGrant = /\bgrant\s+execute\s+on\s+function\s+public\.place_order\s*\([^;]*?\)\s+to\s+(?:public|anon|authenticated)\b/i;

  for (const name of migrations.slice(hotfixIndex)) {
    assert.doesNotMatch(
      stripSqlComments(readMigration(name)),
      publicPlaceOrderGrant,
      `${name} must not grant place_order to a client role`
    );
  }
});
