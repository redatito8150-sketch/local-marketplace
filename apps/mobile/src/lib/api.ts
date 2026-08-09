import { resolveTrustedApiBaseUrl } from "@/domain/api-origin";
import { supabase } from "@/lib/supabase/client";

function apiBaseUrl() {
  return resolveTrustedApiBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL,
    process.env.EXPO_PUBLIC_API_ALLOWED_HOST,
    __DEV__,
  );
}

async function fetchWithSupabaseAuth(path: string, init: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const send = (accessToken?: string) =>
    fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });

  let response = await send(data.session?.access_token);
  if (response.status === 401 && data.session?.access_token) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) response = await send(refreshed.session.access_token);
  }
  return response;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithSupabaseAuth(path, init);
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

export async function apiFormRequest<T>(path: string, body: FormData): Promise<T> {
  const response = await fetchWithSupabaseAuth(path, { method: "POST", body });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}
