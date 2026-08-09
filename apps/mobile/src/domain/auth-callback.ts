export type AuthCallbackFlow = "signup" | "recovery";

export type AuthCallback = {
  kind: "code";
  code: string;
  flow: AuthCallbackFlow;
  state: string;
};

export type PendingAuthCallback = {
  version: 1;
  flow: AuthCallbackFlow;
  state: string;
  createdAt: number;
};

export type AuthCallbackStateStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const CUSTOM_SCHEME = "mahaly:";
const CUSTOM_HOST = "auth";
const UNIVERSAL_PROTOCOL = "https:";
const UNIVERSAL_HOST = "mahalyapp.com";
const CALLBACK_PATH_PREFIX = "/mobile-callback";
const MAX_CALLBACK_URL_LENGTH = 8_192;
const MAX_AUTH_CODE_LENGTH = 2_048;
const PENDING_CALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const STATE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PENDING_KEY_PREFIX = "mahaly.auth-callback.v1";
const CALLBACK_QUERY_KEYS = new Set(["code", "state", "type"]);

function callbackPath(flow: AuthCallbackFlow) {
  return `${CALLBACK_PATH_PREFIX}/${flow}`;
}

function isAuthCallbackFlow(value: string | null): value is AuthCallbackFlow {
  return value === "signup" || value === "recovery";
}

function hasExactlyOne(params: URLSearchParams, key: string) {
  return params.getAll(key).length === 1;
}

function hasOnlyCallbackQueryKeys(params: URLSearchParams) {
  return [...params.keys()].every((key) => CALLBACK_QUERY_KEYS.has(key));
}

function isExpectedLocation(url: URL, flow: AuthCallbackFlow) {
  const customCallback =
    url.protocol === CUSTOM_SCHEME &&
    url.hostname === CUSTOM_HOST &&
    url.pathname === callbackPath(flow);
  const universalCallback =
    url.protocol === UNIVERSAL_PROTOCOL &&
    url.hostname === UNIVERSAL_HOST &&
    url.port === "" &&
    url.pathname === `/auth${callbackPath(flow)}`;

  return customCallback || universalCallback;
}

function statesMatch(received: string, expected: string) {
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < received.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function pendingAuthCallbackKey(flow: AuthCallbackFlow) {
  return `${PENDING_KEY_PREFIX}.${flow}`;
}

export function buildAuthCallbackUrl(flow: AuthCallbackFlow, state: string) {
  if (!STATE_PATTERN.test(state)) {
    throw new Error("Auth callback state must be a cryptographically random UUID.");
  }

  const url = new URL(`mahaly://auth${callbackPath(flow)}`);
  url.searchParams.set("type", flow);
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseAuthCallback(url: string): AuthCallback | null {
  if (!url || url.length > MAX_CALLBACK_URL_LENGTH) return null;

  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.hash) return null;
    if (!hasOnlyCallbackQueryKeys(parsed.searchParams)) return null;
    if (
      !hasExactlyOne(parsed.searchParams, "code") ||
      !hasExactlyOne(parsed.searchParams, "state") ||
      !hasExactlyOne(parsed.searchParams, "type")
    ) {
      return null;
    }

    const code = parsed.searchParams.get("code") ?? "";
    const state = parsed.searchParams.get("state") ?? "";
    const flow = parsed.searchParams.get("type");
    if (!isAuthCallbackFlow(flow) || !isExpectedLocation(parsed, flow)) return null;
    if (!STATE_PATTERN.test(state)) return null;
    if (!code || code.length > MAX_AUTH_CODE_LENGTH || /\s/.test(code)) return null;

    return { kind: "code", code, flow, state };
  } catch {
    return null;
  }
}

export async function savePendingAuthCallback(
  store: AuthCallbackStateStore,
  pending: PendingAuthCallback
) {
  await store.setItem(pendingAuthCallbackKey(pending.flow), JSON.stringify(pending));
}

export async function clearPendingAuthCallback(
  store: AuthCallbackStateStore,
  flow: AuthCallbackFlow
) {
  await store.removeItem(pendingAuthCallbackKey(flow));
}

function parsePendingAuthCallback(value: string | null): PendingAuthCallback | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const pending = parsed as Partial<PendingAuthCallback>;
    if (
      pending.version !== 1 ||
      !isAuthCallbackFlow(pending.flow ?? null) ||
      typeof pending.state !== "string" ||
      !STATE_PATTERN.test(pending.state) ||
      typeof pending.createdAt !== "number" ||
      !Number.isSafeInteger(pending.createdAt)
    ) {
      return null;
    }
    return pending as PendingAuthCallback;
  } catch {
    return null;
  }
}

export async function takePendingAuthCallback(
  url: string,
  store: AuthCallbackStateStore,
  now = Date.now()
): Promise<AuthCallback | null> {
  const callback = parseAuthCallback(url);
  if (!callback) return null;

  const key = pendingAuthCallbackKey(callback.flow);
  const pending = parsePendingAuthCallback(await store.getItem(key));
  if (!pending) return null;

  const age = now - pending.createdAt;
  if (age < 0 || age > PENDING_CALLBACK_MAX_AGE_MS) {
    await store.removeItem(key);
    return null;
  }
  if (pending.flow !== callback.flow || !statesMatch(callback.state, pending.state)) {
    return null;
  }

  // Consume before exchanging the PKCE code. A network failure therefore fails
  // closed and the same email link cannot be replayed.
  await store.removeItem(key);
  return callback;
}
