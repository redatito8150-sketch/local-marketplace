import sanitizeHtml from "sanitize-html";

// Deliberately tiny allowlist for the one rich-text field on the brand
// About page (the combined story — see app/brands/[slug]/about/page.tsx
// and components/brand/RichTextEditor.tsx). Never trust the client: the
// editor's own toolbar only ever produces this exact shape, but a request
// forged straight at the API wouldn't be bound by that, so this is the
// real security boundary, not a UX nicety.
//
// Uses sanitize-html (htmlparser2-based) rather than isomorphic-dompurify —
// that pulls in jsdom, which doesn't bundle reliably into Next.js's
// serverless functions (it broke this exact page in production while
// working fine in local dev/build). sanitize-html has no DOM/native
// dependency, so it doesn't have that failure mode.
//
// `class` is only kept on <span> so the 2 size variants the toolbar offers
// can round-trip — `allowedClasses` restricts it to exactly those values,
// so this can never become a vector for injecting arbitrary CSS classes.
export const RICH_TEXT_SIZE_CLASSES = ["rt-size-sm", "rt-size-lg"] as const;

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "span", "p", "br"],
    allowedAttributes: { span: ["class"] },
    allowedClasses: { span: [...RICH_TEXT_SIZE_CLASSES] },
  }).trim();
}

// Metadata (<title>/<meta description>) and any other plain-text context
// must never carry markup through — strips every tag rather than relying
// on the caller to remember to.
export function stripRichText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim();
}
