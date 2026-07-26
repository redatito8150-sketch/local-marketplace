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
