const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Deliberately permissive on script/style-src (`unsafe-inline`/`unsafe-eval`)
// — Next.js's own hydration payload and dev/HMR need them, and a stricter
// nonce-based policy is a separate, riskier change to get exactly right.
// The real value here is locking down which *external* origins can load at
// all (no more "any domain can inject a script/frame"), not a perfect CSP.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // https://lh3.googleusercontent.com is where Google serves the OAuth
  // `picture`/`avatar_url` claim (components/account/AccountAvatar.tsx
  // renders it as a plain <img>) — without this the browser CSP-blocks it
  // outright and shows a broken image, regardless of any app-side fix.
  `img-src 'self' data: blob: https://images.unsplash.com https://i.imgur.com https://lh3.googleusercontent.com${
    supabaseUrl ? ` ${supabaseUrl}` : ""
  }`,
  `connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i.imgur.com",
      },
      {
        protocol: "https",
        hostname: "kdrrzrboibwyxzrfwsgu.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
