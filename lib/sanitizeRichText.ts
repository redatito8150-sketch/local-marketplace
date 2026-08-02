import DOMPurify from "isomorphic-dompurify";

// Deliberately tiny allowlist for the one rich-text field on the brand
// About page (the combined story — see app/brands/[slug]/about/page.tsx
// and components/brand/RichTextEditor.tsx). Never trust the client: the
// editor's own toolbar only ever produces this exact shape, but a request
// forged straight at the API wouldn't be bound by that, so this is the
// real security boundary, not a UX nicety.
//
// `class` is only kept so the 2 size variants the toolbar offers
// (see RICH_TEXT_SIZE_CLASSES) can round-trip — arbitrary class values
// are stripped by the hook below, so this can never become a vector for
// injecting attacker-controlled CSS classes/selectors.
export const RICH_TEXT_SIZE_CLASSES = ["rt-size-sm", "rt-size-lg"] as const;

let hookInstalled = false;
function ensureHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "class") {
      const kept = data.attrValue
        .split(/\s+/)
        .filter((cls) => (RICH_TEXT_SIZE_CLASSES as readonly string[]).includes(cls));
      data.attrValue = kept.join(" ");
      if (!data.attrValue) data.keepAttr = false;
    }
  });
  hookInstalled = true;
}

export function sanitizeRichText(html: string): string {
  ensureHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b", "strong", "i", "em", "span", "p", "br"],
    ALLOWED_ATTR: ["class"],
  }).trim();
}

// Metadata (<title>/<meta description>) and any other plain-text context
// must never carry markup through — strips every tag rather than relying
// on the caller to remember to.
export function stripRichText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}
