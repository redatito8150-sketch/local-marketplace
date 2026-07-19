import { supabase } from "@/lib/supabase/client";

// Deliberately does NOT follow the rest of lib/data/**'s "throw on real
// Supabase errors" convention: this table is a purely additive overlay over
// static content/*.ts exports. A missing row, a bad shape, or a transient
// error must never break a public page — it should just show the original
// static copy, same as if the CMS didn't exist yet.
export async function getSiteContentWithFallback<T>(
  key: string,
  fallback: T
): Promise<T> {
  try {
    const { data, error } = await supabase
      .from("site_content")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.value as T;
  } catch {
    return fallback;
  }
}
