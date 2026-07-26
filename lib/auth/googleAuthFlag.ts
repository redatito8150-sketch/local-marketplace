// Exact-match, case-sensitive on purpose — "TRUE", "1", "yes", or an unset
// var must all stay disabled. This is the one thing standing between a
// misconfigured deploy and a Google button that renders but can't actually
// complete OAuth (the provider isn't necessarily enabled in Supabase just
// because this flag is set), so it defaults closed.
export function parseGoogleAuthFlag(value: string | undefined): boolean {
  return value === "true";
}

export function isGoogleAuthEnabled(): boolean {
  return parseGoogleAuthFlag(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED);
}
