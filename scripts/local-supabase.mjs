import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_SUPABASE_WORKDIR = resolve(".local-supabase");

const sourceSupabaseDir = resolve("supabase");
const generatedSupabaseDir = join(LOCAL_SUPABASE_WORKDIR, "supabase");
const generatedMigrationsDir = join(generatedSupabaseDir, "migrations");
const localBaselineName = "20260720000000_local_baseline.sql";
const localAdminSupportName = "99999999999999_local_dev_admin_support.sql";
const localMigrationNameOverrides = new Map([
  // This file was originally 20260802000001. It was later renamed to match
  // production's already-applied migration version, but that version sorts
  // before the 20260731 option tables it alters on a blank local database.
  [
    "20260728182617_dashboard_product_system_stabilization.sql",
    "20260802000001_dashboard_product_system_stabilization.sql",
  ],
]);
const productionHistoryAliases = new Set([
  // Production's exact applied versions were restored beside their original,
  // clean migration files. Replaying both on a blank database either runs a
  // feature too early or creates the same objects twice. The canonical files
  // stay untouched; the generated local history keeps the original versions.
  "20260728204222_opening_stock_inventory_workflow.sql",
  "20260728204300_inventory_function_hardening.sql",
  "20260813052104_stock_ledger_locations.sql",
  "20260813052111_fulfillment_mode.sql",
  "20260813052200_warehouse_documents.sql",
  "20260813052220_product_launch_state.sql",
  "20260813052231_inventory_permission_boundaries.sql",
  "20260813052240_storefront_launch_gate_view.sql",
  "20260813052243_payment_transition_coordination.sql",
  "20260813053734_security_hardening.sql",
  "20260813054007_rls_initplan_performance.sql",
  "20260813054358_cleanup_fulfillment_test_rows.sql",
  "20260815213740_product_launch_policy_and_opening_stock.sql",
  "20260815214231_product_visibility_activation_cron.sql",
  "20260816015845_remove_migration_verify_e592656d_test_fixture.sql",
]);
const localMigrationContentPatches = new Map([
  [
    "20260814000008_security_hardening.sql",
    [
      [
        "revoke all on function public.rls_auto_enable() from public, anon, authenticated;",
        `do $local_compat$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$local_compat$;`,
      ],
    ],
  ],
  [
    "20260815000000_product_launch_policy_and_opening_stock.sql",
    [
      [
        "lock table public.inventory_movements in access exclusive mode;",
        "begin;\nlock table public.inventory_movements in access exclusive mode;",
      ],
      [
        `alter table public.inventory_movements
  enable trigger inventory_movements_immutable;`,
        `alter table public.inventory_movements
  enable trigger inventory_movements_immutable;
commit;`,
      ],
    ],
  ],
]);

export async function prepareLocalSupabaseWorkdir() {
  await mkdir(generatedMigrationsDir, { recursive: true });

  for (const entry of await readdir(generatedMigrationsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".sql")) {
      await unlink(join(generatedMigrationsDir, entry.name));
    }
  }

  await copyFile(join(sourceSupabaseDir, "config.toml"), join(generatedSupabaseDir, "config.toml"));
  await copyFile(
    join(sourceSupabaseDir, "local-baseline.sql"),
    join(generatedMigrationsDir, localBaselineName)
  );

  const sourceMigrationsDir = join(sourceSupabaseDir, "migrations");
  const migrationFiles = (await readdir(sourceMigrationsDir, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".sql") &&
        !productionHistoryAliases.has(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  for (const migrationFile of migrationFiles) {
    const localMigrationFile = localMigrationNameOverrides.get(migrationFile) ?? migrationFile;
    const sourcePath = join(sourceMigrationsDir, migrationFile);
    const destinationPath = join(generatedMigrationsDir, basename(localMigrationFile));
    const contentPatches = localMigrationContentPatches.get(migrationFile);

    if (!contentPatches) {
      await copyFile(sourcePath, destinationPath);
      continue;
    }

    let localSource = (await readFile(sourcePath, "utf8")).replaceAll("\r\n", "\n");
    for (const [expected, replacement] of contentPatches) {
      if (!localSource.includes(expected)) {
        throw new Error(`Expected local compatibility statement is missing from ${migrationFile}.`);
      }
      localSource = localSource.replace(expected, replacement);
    }
    await writeFile(destinationPath, localSource, "utf8");
  }

  await copyFile(
    join(sourceSupabaseDir, "local-dev-admin-support.sql"),
    join(generatedMigrationsDir, localAdminSupportName)
  );

  return LOCAL_SUPABASE_WORKDIR;
}

export function runLocalSupabaseCli(args, options = {}) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run the local Supabase commands through an npm script.");
  }

  return spawnSync(
    process.execPath,
    [
      npmCli,
      "exec",
      "--yes",
      "--package=supabase@2.115.0",
      "--",
      "supabase",
      ...args,
      "--workdir",
      LOCAL_SUPABASE_WORKDIR,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      ...options,
    }
  );
}

export async function runLocalSupabaseCommand(command) {
  await prepareLocalSupabaseWorkdir();
  const result = runLocalSupabaseCli([command], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      command === "start"
        ? "Local Supabase could not start. Make sure Docker Desktop is installed and running, then try again."
        : `Local Supabase ${command} failed.`
    );
  }
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const command = process.argv[2];
  if (!new Set(["start", "stop"]).has(command)) {
    console.error("Usage: node scripts/local-supabase.mjs <start|stop>");
    process.exitCode = 1;
  } else {
    runLocalSupabaseCommand(command).catch((error) => {
      console.error(`\nLocal Supabase command failed: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}
