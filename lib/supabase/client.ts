import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local (see .env.local.example)."
  );
}

// Browser client backed by cookies (via @supabase/ssr) so the auth session
// persists across reloads and is readable by the server client/middleware.
// Only ever carries the public anon key — row-level security policies on
// each table decide what it's actually allowed to read or write.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
