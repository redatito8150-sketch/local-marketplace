# Google Social Login — Setup Guide

This is the exact, project-specific checklist to turn on "Continue with
Google" for Mahaly. The code ships disabled — the button renders nowhere
until `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` is set *and* Google is actually
enabled in Supabase. Do both before flipping the flag anywhere real users
will see it.

No secret values are written in this file. Copy real values only into the
Supabase Dashboard and your own `.env.local`/Vercel project settings.

---

## A. Supabase

1. **Find your project's OAuth callback URL** (Supabase → your project →
   Authentication → Providers → Google → this is shown right there, but the
   format is always):

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   You'll paste this into Google Cloud in step B. It's fixed and doesn't
   change — you only need to look it up once.

2. **Enable the Google provider**: Supabase Dashboard → **Authentication**
   → **Providers** → **Google** → toggle **Enable**.

3. **Paste your Google OAuth credentials** (created in section B below)
   into the same panel:
   - **Client ID** — from Google Cloud.
   - **Client Secret** — from Google Cloud. This stays in Supabase only —
     it is never added to this repo, `.env.local`, or Vercel.

4. **Site URL** — Supabase Dashboard → Authentication → **URL
   Configuration** → **Site URL**. Set this to your production URL:

   ```
   https://mahaly.eg
   ```

   This is the default fallback Supabase uses if a request doesn't specify
   a matching `redirectTo` — keep it pointed at production, not localhost.

5. **Redirect URL allow list** — same **URL Configuration** page, **Redirect
   URLs** field. Supabase only allows an OAuth redirect to a URL that
   matches something in this list, so every environment you test in needs
   its own exact entry:

   | Environment | Exact URL to add |
   |---|---|
   | Local dev | `http://localhost:3000/auth/callback` |
   | Vercel Preview | `https://*.vercel.app/auth/callback` (wildcard — Vercel Preview URLs are unique per deployment) |
   | Production | `https://mahaly.eg/auth/callback` |
   | Production (www, optional) | `https://www.mahaly.eg/auth/callback` |

   Supabase's allow list supports a single `*` wildcard segment, which is
   why the Preview row above works for every preview deployment without
   adding one entry per branch. If your Vercel project uses a fixed preview
   domain (e.g. `mahaly-preview.vercel.app` protection alias) prefer the
   exact URL instead of the wildcard.

   **These must be exact** — no trailing slash, correct scheme
   (`http` only for `localhost`, `https` everywhere else), and the literal
   path `/auth/callback` (that's this project's callback Route Handler,
   `app/auth/callback/route.ts`).

---

## B. Google Cloud

1. **Create or select a project** at
   [console.cloud.google.com](https://console.cloud.google.com/) — any
   existing Google Cloud project works, or create a new one dedicated to
   Mahaly.

2. **Configure the OAuth consent screen** (APIs & Services → OAuth consent
   screen):
   - User type: **External** (Mahaly customers aren't Google Workspace
     users of your org).
   - App name: `Mahaly`
   - User support email: your support inbox.
   - App logo: optional, but recommended before going to Production mode.
   - **Authorized domains**: `mahaly.eg` (add `vercel.app` too if you want
     Preview deployments to show a clean consent screen instead of an
     "unverified domain" warning — optional, Preview testing still works
     without it).
   - Developer contact email: your own email.
   - **Privacy Policy URL**: `https://mahaly.eg/privacy` (this route
     already exists in the app).
   - **Terms of Service URL**: `https://mahaly.eg/terms` (also already
     exists).

3. **Scopes**: keep the minimum — Google's default `openid`, `email`, and
   `profile` scopes are all Supabase needs to populate `full_name`,
   `avatar_url`, and a verified email. Do not add Gmail, Drive, Calendar,
   or any other scope — this project never needs them and each additional
   scope adds another consent-screen prompt and review requirement.
   Supabase still writes this `avatar_url` into
   `auth.users.user_metadata` on every sign-in exactly as described here —
   see section G below for what the app does with it (short answer: it's
   never shown directly).

4. **Testing mode vs. Production mode**: while the consent screen is in
   **Testing**, only accounts you explicitly add under **Test users** can
   complete Google sign-in — everyone else sees an "access blocked" error.
   Add your own Google account (and anyone else testing locally/on
   Preview) as a test user first. Move the consent screen to **Production**
   only once you're ready for real customers — Google may require
   verification for some scope/branding combinations before that switch,
   but the basic `openid`/`email`/`profile` scope set used here typically
   does not require full verification.

5. **Create the OAuth Client ID** (APIs & Services → Credentials → Create
   Credentials → OAuth client ID):
   - Application type: **Web application**
   - Name: anything recognizable, e.g. `Mahaly Web`
   - **Authorized JavaScript origins** — add all three:
     ```
     http://localhost:3000
     https://mahaly.eg
     https://<your-vercel-project>.vercel.app
     ```
   - **Authorized redirect URIs** — add exactly one, the Supabase callback
     URL from step A.1:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
     This is **not** this app's own `/auth/callback` route — Google only
     ever redirects back to Supabase directly; Supabase is what redirects
     onward to this app's callback route afterward, and that hop is
     controlled entirely by the Redirect URL allow list in step A.5, not
     by anything configured in Google Cloud.

6. Click **Create**. Copy the **Client ID** and **Client Secret** — paste
   both into Supabase (step A.3) and nowhere else.

---

## C. Vercel

No Google secret belongs in Vercel. The Google Client Secret is only ever
used by Supabase's own server to exchange an authorization code — this
app's Next.js server (on Vercel) never sees or needs it.

The only Vercel-side change is the public feature flag, once you're ready
to show the button in that environment:

```
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true
```

Set it per-environment in Vercel → Project → Settings → Environment
Variables (you can enable it for Preview before enabling it for
Production, to test safely first).

Do **not** add `GOOGLE_CLIENT_SECRET` or any Google credential to Vercel —
Supabase Dashboard is the only place that value goes.

---

## D. Local development (`http://localhost:3000`)

1. In `.env.local`, set:
   ```
   NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true
   ```
2. Confirm `http://localhost:3000/auth/callback` is in Supabase's Redirect
   URL allow list (step A.5) and `http://localhost:3000` is in Google's
   Authorized JavaScript origins (step B.5).
3. Run `npm run dev`, open `/account`, click **Continue with Google**, and
   sign in with a Google account added as a **Test user** (step B.4) if the
   consent screen is still in Testing mode.

## E. Vercel Preview deployment

1. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` for the **Preview**
   environment in Vercel (step C).
2. Make sure `https://*.vercel.app/auth/callback` (or your exact preview
   domain) is in Supabase's Redirect URL allow list, and the matching
   origin is in Google's Authorized JavaScript origins.
3. Open the branch's Preview URL, test the same flow as local dev. If the
   consent screen is still in Testing mode, only Test users can complete
   sign-in on Preview too.

## F. Production

Final production URLs to have configured everywhere above before flipping
the flag on for Production:

```
https://mahaly.eg
https://www.mahaly.eg   (optional, only if you actually serve this host)
```

Checklist before enabling in Production:
- [ ] Google provider enabled in Supabase with real Client ID/Secret
- [ ] `https://mahaly.eg/auth/callback` (and `www` variant if used) in
      Supabase's Redirect URL allow list
- [ ] `https://mahaly.eg` (and `www` variant if used) in Google's
      Authorized JavaScript origins
- [ ] Supabase Site URL set to `https://mahaly.eg`
- [ ] OAuth consent screen in Production mode (or all real users added as
      Test users, which doesn't scale — Production mode is the real answer)
- [ ] `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` set for the Production
      environment in Vercel

## G. Avatar / profile photo handling

Supabase writes Google's `avatar_url`/`picture` claim into
`auth.users.user_metadata` on every sign-in (section B.3 above) — this is
Supabase's own behavior and can't be turned off from this app. Nothing in
this codebase reads that field for display, on purpose: earlier, a
manually uploaded photo and Google's photo shared that one key, so every
Google sign-in silently overwrote a manually uploaded photo.

The app now keeps the two fully separate, in `profiles`
(`supabase/migrations/20260727000001_profile_avatar_priority.sql`):

- **`profiles.avatar_url`** — the photo a user explicitly uploaded via
  `/account/settings`. Written only by `app/api/account/avatar`'s
  POST (set) and DELETE (cleared to `null`). Nothing else — no trigger,
  no OAuth sync, no session refresh — is allowed to touch it.
- **`profiles.provider_avatar_url`** — Google's photo, mirrored
  automatically by the `on_auth_user_metadata_updated` trigger every time
  `auth.users.raw_user_meta_data` changes (identity linking, and every
  subsequent Google sign-in). Used only as a fallback.

The UI (`lib/account/avatar.ts`'s `resolveAvatarUrl()`, used by every
avatar-rendering page/component) always resolves in this order:

```
profiles.avatar_url  →  profiles.provider_avatar_url  →  initials placeholder
```

A manually uploaded photo is therefore permanent until the user removes
it themselves — no number of future Google (or email/password) sign-ins
will ever replace it.
