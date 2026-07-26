# Mahaly mobile

Expo Router application that consumes the same Supabase project and business
rules as the Mahaly website.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Use the public Supabase URL and publishable (or legacy anon) key only.
3. Run `npm install`, then `npm run start`.

Never add a service-role key to an Expo environment variable. All
`EXPO_PUBLIC_*` values are bundled into the client application.
