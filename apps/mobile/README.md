# Mahaly mobile

Expo Router application that consumes the same Supabase project and business
rules as the Mahaly website.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Use the public Supabase URL and publishable (or legacy anon) key only.
3. Run `npm install`, then `npm run start`.

Never add a service-role key to an Expo environment variable. All
`EXPO_PUBLIC_*` values are bundled into the client application.

## Release verification

Before shipping, run `npm run verify`. The release candidate should also be
checked on one current iPhone and one current Android device:

- Complete sign in, password recovery, sign out, and session restoration.
- Browse, search, paginate, select a variant, and add it to wishlist and cart.
- Complete checkout and confirm the order appears in order history.
- Create, edit, report, and mark a review helpful using eligible accounts.
- Switch light, dark, and system appearance and restart the app.
- Check large text, VoiceOver/TalkBack focus order, reduced motion, and 44px touch targets.
- Test a slow connection, reconnect after offline use, and retry failed requests.
- Open `mahaly://products/<id>` and `mahaly://brands/<slug>` deep links.

## Authentication callbacks

Email confirmation and password recovery use PKCE callbacks scoped to these
two paths. The callback also carries a random, single-use state generated on
the requesting device:

- `mahaly://auth/mobile-callback/signup`
- `mahaly://auth/mobile-callback/recovery`

Add both callback paths to the Supabase Auth redirect allowlist before testing
email flows. Links requested before this PKCE/state change are intentionally
rejected; request a new email from the updated app.

The native project is prepared for verified HTTPS links under
`https://mahalyapp.com/auth/mobile-callback/`. Do not switch Supabase redirects
to HTTPS until both association files are deployed and verified:

- Apple `apple-app-site-association` needs the Apple Team ID plus the existing
  `com.mahaly.mobile` bundle ID.
- Android `.well-known/assetlinks.json` needs the SHA-256 fingerprints of every
  release signing certificate plus the existing `com.mahaly.mobile` package.

Those signing identifiers are release credentials and are deliberately not
guessed or committed here.
