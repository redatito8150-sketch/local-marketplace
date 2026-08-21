import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const LOCAL_ADMIN_USERNAME = "Admin";
const LOCAL_ADMIN_EMAIL = "admin@local.test";
const DEFAULT_LOCAL_ADMIN_PASSWORD = "0112810";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

async function loadLocalEnvFile() {
  try {
    const contents = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = parseEnvValue(match[2]);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function assertLocalSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A valid local Supabase URL is required.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      "Refusing to create the weak developer account outside loopback Supabase. Start the local Supabase stack and try again."
    );
  }

  return url;
}

async function findUserByEmail(supabase, email) {
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list local Auth users: ${error.message}`);

    const user = data.users.find(
      (candidate) => candidate.email?.toLocaleLowerCase("en-US") === email.toLocaleLowerCase("en-US")
    );
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  throw new Error("Could not finish searching local Auth users.");
}

async function ensureAuthUser(supabase, password) {
  const existingUser = await findUserByEmail(supabase, LOCAL_ADMIN_EMAIL);
  const userMetadata = {
    ...(existingUser?.user_metadata ?? {}),
    full_name: LOCAL_ADMIN_USERNAME,
    display_name: LOCAL_ADMIN_USERNAME,
  };
  const appMetadata = {
    ...(existingUser?.app_metadata ?? {}),
    local_dev_admin: true,
  };

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });
    if (error || !data.user) {
      throw new Error(`Could not update the local admin Auth user: ${error?.message ?? "unknown error"}`);
    }
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: LOCAL_ADMIN_EMAIL,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });
  if (error || !data.user) {
    throw new Error(`Could not create the local admin Auth user: ${error?.message ?? "unknown error"}`);
  }
  return data.user;
}

async function ensureFullAdminAccess(supabase, user) {
  const { data, error } = await supabase.rpc("prepare_local_dev_admin", {
    p_user_id: user.id,
  });
  const verified = Array.isArray(data) ? data[0] : data;
  if (
    error ||
    !verified?.is_admin ||
    verified.profile_role !== "admin" ||
    !verified.onboarding_completed_at ||
    !verified.role_assigned
  ) {
    throw new Error(
      `The local Admin account could not receive full access: ${error?.message ?? "verification failed"}`
    );
  }
}

export async function ensureLocalDevAdmin() {
  await loadLocalEnvFile();

  if (process.env.VERCEL || process.env.CI || process.env.NODE_ENV === "production") {
    throw new Error("The local developer admin can only be prepared from a developer workstation.");
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.API_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing local Supabase URL or service-role key. Run `npm run dev:admin` for the automatic setup."
    );
  }

  const checkedUrl = assertLocalSupabaseUrl(supabaseUrl);
  const password = process.env.LOCAL_DEV_ADMIN_PASSWORD ?? DEFAULT_LOCAL_ADMIN_PASSWORD;
  const supabase = createClient(checkedUrl.toString(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await ensureAuthUser(supabase, password);
  await ensureFullAdminAccess(supabase, user);

  console.log("\nLocal developer admin is ready.");
  console.log("Open: http://localhost:3000/account?next=/admin");
  console.log(`Username: ${LOCAL_ADMIN_USERNAME}`);
  console.log(`Password: ${password}\n`);
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  ensureLocalDevAdmin().catch((error) => {
    console.error(`\nLocal developer admin setup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
