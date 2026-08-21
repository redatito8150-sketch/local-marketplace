import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareLocalSupabaseWorkdir,
  runLocalSupabaseCli,
} from "./local-supabase.mjs";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");

export function parseSupabaseStatusEnv(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const rawValue = match[2].trim();
    values[match[1]] =
      rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue;
  }
  return values;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

export async function startLocalDevAdmin({ startWebsite = true } = {}) {
  console.log("Starting the local database and authentication services…");
  await prepareLocalSupabaseWorkdir();
  const startResult = runLocalSupabaseCli(["start"], { stdio: "inherit" });
  if (startResult.error) throw startResult.error;
  if (startResult.status !== 0) {
    throw new Error(
      "Local Supabase could not start. Make sure Docker Desktop is installed and running, then try again."
    );
  }

  const statusResult = runLocalSupabaseCli(["status", "-o", "env"]);
  if (statusResult.error) throw statusResult.error;
  if (statusResult.status !== 0) {
    throw new Error(statusResult.stderr || "Could not read the local Supabase credentials.");
  }

  const local = parseSupabaseStatusEnv(statusResult.stdout);
  const apiUrl = local.API_URL;
  const publicKey = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
  const serviceRoleKey = local.SECRET_KEY ?? local.SERVICE_ROLE_KEY;
  if (!apiUrl || !publicKey || !serviceRoleKey) {
    throw new Error("Local Supabase did not return all required development credentials.");
  }

  const localEnvironment = {
    ...process.env,
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    CI: "",
    VERCEL: "",
  };

  console.log("Preparing the local Admin account…");
  const seedResult = run(process.execPath, [resolve("scripts/ensure-local-dev-admin.mjs")], {
    env: localEnvironment,
    stdio: "inherit",
  });
  if (seedResult.status !== 0) {
    throw new Error("The local Admin account could not be prepared.");
  }

  if (!startWebsite) return;

  console.log("Starting the website…\n");
  const next = spawn(process.execPath, [nextCli, "dev", "--webpack"], {
    cwd: process.cwd(),
    env: localEnvironment,
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => next.kill(signal));
  }

  await new Promise((resolvePromise, rejectPromise) => {
    next.once("error", rejectPromise);
    next.once("exit", (code, signal) => {
      if (signal || code === 0) resolvePromise();
      else rejectPromise(new Error(`The website stopped with exit code ${code}.`));
    });
  });
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  startLocalDevAdmin({ startWebsite: !process.argv.includes("--prepare-only") }).catch((error) => {
    console.error(`\nLocal development startup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
