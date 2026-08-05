import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses row-level security entirely. Import this
// ONLY from server-only code (Route Handlers, or server-only lib/data
// functions), never from a client component or hook.
//
// Lazily initialized — the env-var check and actual client creation only
// happen on first real property access (`.from(...)`, `.storage`, etc.),
// not at module-evaluation time. This matters because a "use client" module
// can transitively import a file that merely *defines* (without calling) a
// supabaseAdmin-dependent function — e.g. lib/hooks/useShippingPreview.ts
// (client) imports lib/data/brands.ts, whose module top-level statically
// imports lib/data/follows.ts's getFollowerCountForBrand, which references
// supabaseAdmin — even though no client code path ever actually calls that
// function. With eager init, that import alone threw in the browser
// (SUPABASE_SERVICE_ROLE_KEY is correctly absent there) and crashed the
// whole page. With lazy init, merely importing this module is inert; it
// only throws if something actually tries to use the client, which no
// legitimate browser code path does.
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add the service role key to .env.local (see .env.local.example) — never expose it to the browser."
    );
  }

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
  return client;
}

// Methods are bound to the real client (not left to standard proxy.method()
// call-site `this` binding, which would bind `this` to the Proxy itself and
// break the supabase-js client's internal state access).
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
