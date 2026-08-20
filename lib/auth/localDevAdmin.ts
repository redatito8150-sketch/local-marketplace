export const LOCAL_DEV_ADMIN_USERNAME = "Admin";
export const LOCAL_DEV_ADMIN_EMAIL = "admin@local.test";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isLocalDevAdminEnabled(
  supabaseUrl: string | undefined,
  nodeEnv: string | undefined
): boolean {
  return nodeEnv === "development" && isLoopbackSupabaseUrl(supabaseUrl);
}

export function resolveSignInEmail(
  identifier: string,
  options: { supabaseUrl: string | undefined; nodeEnv: string | undefined }
): string {
  const normalizedIdentifier = identifier.trim();
  const isLocalAdminAlias =
    normalizedIdentifier.toLocaleLowerCase("en-US") ===
    LOCAL_DEV_ADMIN_USERNAME.toLocaleLowerCase("en-US");

  if (
    isLocalAdminAlias &&
    isLocalDevAdminEnabled(options.supabaseUrl, options.nodeEnv)
  ) {
    return LOCAL_DEV_ADMIN_EMAIL;
  }

  return normalizedIdentifier;
}
