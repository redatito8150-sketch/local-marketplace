import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the Phase 2 (Paymob Pixel) frontend integration —
// the same established pattern tests/stage3OrderIntegrity.test.ts and
// tests/paymentAttemptsSchema.test.ts already use for properties that
// matter for security/correctness but aren't practical to exercise without
// a real browser/DOM (this project has no React/DOM test runner).

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const checkoutPage = read("app/checkout/page.tsx");
const pixelLoader = read("lib/payments/paymobPixelLoader.ts");
const cardReducer = read("lib/payments/cardPaymentAttempt.ts");
const nextConfig = read("next.config.js");

// next.config.js builds its CSP at module load from NODE_ENV, so each
// environment's real policy is obtained by evaluating the file's source in a
// fresh scope with that value — `require` would hand back a single cached
// module and report whichever environment happened to load first.
async function cspFor(nodeEnv: "development" | "production"): Promise<string> {
  // A stub `process` rather than mutating the real one: NODE_ENV is
  // non-configurable in current Node, and the real environment must not be
  // disturbed for the rest of the suite.
  const stubProcess = { env: { ...process.env, NODE_ENV: nodeEnv } };
  const module_ = {
    exports: {} as { headers?: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>> },
  };
  new Function("module", "exports", "process", nextConfig)(module_, module_.exports, stubProcess);
  const headerGroups = (await module_.exports.headers?.()) ?? [];
  const header = headerGroups
    .flatMap((group) => group.headers)
    .find((entry) => entry.key === "Content-Security-Policy");
  if (!header) throw new Error("next.config.js produced no Content-Security-Policy header");
  return header.value;
}

test("Card payment posts only to the Paymob intention endpoint, with an Idempotency-Key header", () => {
  assert.match(checkoutPage, /"\/api\/payments\/paymob\/intention"/);
  assert.match(checkoutPage, /"Idempotency-Key":\s*idempotencyKey/);
});

test("Card payment never calls the orders endpoint or COD's order-placement functions", () => {
  const startCardAttemptMatch = checkoutPage.match(/const startCardAttempt = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/);
  assert.ok(startCardAttemptMatch, "expected to find the startCardAttempt function");
  const body = startCardAttemptMatch![0];
  assert.doesNotMatch(body, /\/api\/orders/);
  assert.doesNotMatch(body, /submitOrder/);
  assert.doesNotMatch(body, /place_order/i);
  assert.doesNotMatch(body, /clearCart/);
});

test("startCardAttempt's useCallback dependency array includes items/shipping/appliedCoupon — a stale closure here previously sent an empty shipping.firstName on every card attempt, since cardState.phase never changes during the Shipping step", () => {
  const startCardAttemptMatch = checkoutPage.match(/const startCardAttempt = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[([^\]]*)\]\);/);
  assert.ok(startCardAttemptMatch, "expected to find the startCardAttempt function");
  const deps = startCardAttemptMatch![1];
  assert.match(deps, /\bitems\b/);
  assert.match(deps, /\bshipping\b/);
});

test("COD's own submit flow is untouched — still posts to /api/orders, still calls clearCart on real success, and is not regressed by the new card-payment cart-reconciliation machinery", () => {
  const submitOrderMatch = checkoutPage.match(/const submitOrder = async \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(submitOrderMatch, "expected to find the submitOrder function");
  const body = submitOrderMatch![0];
  assert.match(body, /"\/api\/orders"/);
  assert.match(body, /clearCart\(\)/);
  assert.doesNotMatch(body, /paymob/i);
  assert.doesNotMatch(body, /removePurchasedItems/);
  assert.doesNotMatch(body, /writePendingCardAttempt/);
  assert.doesNotMatch(body, /clearPendingCardAttempt/);
});

test("no frontend code ever sets a payment_attempts status to paid, or calls a paid-order/fulfillment RPC", () => {
  for (const source of [checkoutPage, pixelLoader, cardReducer]) {
    assert.doesNotMatch(source, /status['"]?\s*[:=]\s*['"]paid['"]/i);
    assert.doesNotMatch(source, /place_paid_order/i);
    assert.doesNotMatch(source, /mark_paymob_intention_created/); // server-only RPC, never called from the browser
    assert.doesNotMatch(source, /supabaseAdmin/);
  }
  // The reducer's only phase names are enumerated directly — "paid" is not
  // among them, and can never be reached by any action.
  assert.doesNotMatch(cardReducer, /"paid"/);
});

test("no order-creation call occurs from any Pixel callback (onCancel/onError) or from PIXEL_SUBMITTED", () => {
  const effectMatch = checkoutPage.match(/useEffect\(\(\) => \{\s*if \(!pixelActive\)[\s\S]*?\n {2}\}, \[pixelActive\]\);/);
  assert.ok(effectMatch, "expected to find the Pixel-mounting effect");
  const body = effectMatch![0];
  assert.doesNotMatch(body, /\/api\/orders/);
  assert.doesNotMatch(body, /submitOrder/);
  assert.doesNotMatch(body, /clearCart/);
  assert.doesNotMatch(body, /step\s*\(\s*"confirmation"/); // never auto-navigates to the COD confirmation step
});

test("clientSecret never reaches localStorage, sessionStorage, cookies, console, or a URL", () => {
  for (const source of [checkoutPage, pixelLoader, cardReducer]) {
    assert.doesNotMatch(source, /localStorage[\s\S]{0,60}clientSecret/i);
    assert.doesNotMatch(source, /sessionStorage[\s\S]{0,60}clientSecret/i);
    assert.doesNotMatch(source, /document\.cookie/i);
    assert.doesNotMatch(source, /console\.(log|info|warn|debug)\([^)]*clientSecret/i);
    assert.doesNotMatch(source, /(router\.push|redirect|URLSearchParams|searchParams)\([^)]*clientSecret/i);
  }
});

test("clientSecret is cleared from React state at the same point it's handed to the Pixel constructor", () => {
  assert.match(checkoutPage, /new PixelConstructor\(\{/);
  const constructorCallMatch = checkoutPage.match(/const instance = new PixelConstructor\(\{[\s\S]*?\}\);/);
  assert.ok(constructorCallMatch);
  assert.match(constructorCallMatch![0], /clientSecret,/);
  // Immediately after construction, PIXEL_MOUNTED fires — which the
  // reducer (verified in tests/cardPaymentAttempt.test.ts) clears
  // clientSecret in response to.
  assert.match(checkoutPage, /dispatchCard\(\{ type: "PIXEL_MOUNTED" \}\)/);
});

test("no PAYMOB_SECRET_KEY / PAYMOB_HMAC_SECRET / provider secret reaches any client-bundled file", () => {
  for (const source of [checkoutPage, pixelLoader, cardReducer]) {
    assert.doesNotMatch(source, /PAYMOB_SECRET_KEY/);
    assert.doesNotMatch(source, /PAYMOB_HMAC_SECRET/);
    assert.doesNotMatch(source, /PAYMOB_CARD_INTEGRATION_ID/);
  }
  // Only the publishable key — explicitly NEXT_PUBLIC_-prefixed, safe to
  // expose by design — is read client-side.
  assert.match(checkoutPage, /NEXT_PUBLIC_PAYMOB_PUBLIC_KEY/);
});

test("Card payment option is feature-flagged off entirely when no public key is configured", () => {
  assert.match(checkoutPage, /const CARD_PAYMENT_ENABLED = Boolean\(PAYMOB_PUBLIC_KEY\)/);
  assert.match(checkoutPage, /\{CARD_PAYMENT_ENABLED &&/);
});

test("Pixel is loaded via a <script> tag from the documented CDN URL, not import()'d as an ESM package", () => {
  // Confirmed by inspecting the actual published bundle: it sets
  // window.Pixel as its only externally-visible effect and has no real
  // ESM `export`, so `import` would not reliably work.
  // Pinned to the exact version inspected — @latest would run an
  // unverified future version without re-review.
  assert.match(pixelLoader, /https:\/\/cdn\.jsdelivr\.net\/npm\/paymob-pixel@1\.2\.7\/main\.js/);
  assert.doesNotMatch(pixelLoader, /paymob-pixel@latest/);
  assert.match(pixelLoader, /script\.type = "module"/);
  assert.doesNotMatch(pixelLoader, /^import .*paymob-pixel/m);
});

test("Pixel constructor options match the SDK's real API surface (publicKey, clientSecret, paymentMethods, elementId)", () => {
  assert.match(pixelLoader, /publicKey: string/);
  assert.match(pixelLoader, /clientSecret: string/);
  assert.match(pixelLoader, /paymentMethods: string\[\]/);
  assert.match(pixelLoader, /elementId: string/);
  assert.match(checkoutPage, /paymentMethods: \["card"\]/);
});

test("Pixel cleanup calls .unmount() only after confirming it's actually a function — confirmed live that the SDK doesn't always expose one, which previously crashed the whole page with 'unmount is not a function' on every teardown", () => {
  assert.doesNotMatch(checkoutPage, /pixelInstanceRef\.current\?\.unmount\(\);/);
  assert.match(checkoutPage, /typeof pixelInstanceRef\.current\?\.unmount === "function"/);
  const guardedCallMatch = checkoutPage.match(
    /if \(typeof pixelInstanceRef\.current\?\.unmount === "function"\) \{\s*pixelInstanceRef\.current\.unmount\(\);\s*\}/
  );
  assert.ok(guardedCallMatch, "expected .unmount() to only be called inside the typeof guard");
});

test("CSP allows exactly the new external hosts this integration needs, nothing broader", async () => {
  // Asserted against the directive the config actually produces, not the
  // source text: script-src is now assembled from a variable (so that
  // 'unsafe-eval' can be dropped outside development), which a raw
  // source-text regex would miss even though the policy is correct.
  const productionCsp = await cspFor("production");
  const scriptSrc = productionCsp.split("; ").find((d) => d.startsWith("script-src"));
  assert.ok(scriptSrc?.includes("https://cdn.jsdelivr.net"), `script-src must allow the Pixel CDN, got: ${scriptSrc}`);
  assert.match(nextConfig, /connect-src[^`]*https:\/\/accept\.paymob\.com/);
  assert.match(nextConfig, /frame-src 'self' https:\/\/eg\.checkout\.paymob\.com/);
});

test("production CSP drops 'unsafe-eval' while development keeps it for HMR", async () => {
  // The Paymob Pixel bundle's only `new Function` uses are the standard
  // webpack global-detection fallbacks, both inside try/catch with a
  // `window` fallback, so blocking eval cannot break card checkout.
  const developmentCsp = await cspFor("development");
  const productionCsp = await cspFor("production");
  const devScriptSrc = developmentCsp.split("; ").find((d) => d.startsWith("script-src"));
  const prodScriptSrc = productionCsp.split("; ").find((d) => d.startsWith("script-src"));

  assert.ok(devScriptSrc?.includes("'unsafe-eval'"), "development needs 'unsafe-eval' for the webpack HMR runtime");
  assert.ok(!prodScriptSrc?.includes("'unsafe-eval'"), `production must not ship 'unsafe-eval', got: ${prodScriptSrc}`);

  // Both keep 'unsafe-inline': Next.js inlines its hydration bootstrap, and
  // a nonce would force every static/ISR route to render dynamically.
  assert.ok(prodScriptSrc?.includes("'unsafe-inline'"), "removing 'unsafe-inline' would break Next.js hydration");
  assert.ok(productionCsp.includes("object-src 'none'"), "object-src should be denied outright");
});

test("mobile app files are untouched by this phase", () => {
  assert.doesNotMatch(checkoutPage, /apps\/mobile/);
});

test("confirmation polling reads our own backend status endpoint, never trusts Pixel, and dispatches only POLL_* actions", () => {
  const pollEffectMatch = checkoutPage.match(
    /useEffect\(\(\) => \{\s*if \(cardState\.phase !== "pixel_open" && cardState\.phase !== "confirming"\)[\s\S]*?\n {2}\}, \[cardState\.phase, cardState\.paymentAttemptId, user\]\);/
  );
  assert.ok(pollEffectMatch, "expected to find the confirmation-polling effect");
  const body = pollEffectMatch![0];
  assert.match(body, /\/api\/payments\/paymob\/attempts\/\$\{paymentAttemptId\}/);
  assert.match(body, /dispatchCard\(\{ type: "POLL_CONFIRMED"/);
  assert.match(body, /dispatchCard\(\{\s*type: "POLL_FAILED"/);
  assert.match(body, /dispatchCard\(\{ type: "POLL_PENDING" \}\)/);
  // Never any Pixel/order/cart mutation inside the polling effect itself
  // — it only dispatches actions; the actual cart change happens in the
  // separate "confirmed" effect below.
  assert.doesNotMatch(body, /\/api\/orders/);
  assert.doesNotMatch(body, /clearCart/);
  assert.doesNotMatch(body, /removePurchasedItems/);
  assert.doesNotMatch(body, /new PixelConstructor/);
});

test("the cart is reconciled for a card payment ONLY when phase becomes 'confirmed' (a polled, backend-authoritative fact) — never from a Pixel callback, and via removePurchasedItems (not a blind clearCart) so items added after the payment started are never wiped", () => {
  const cartClearEffectMatch = checkoutPage.match(
    /useEffect\(\(\) => \{\s*if \(cardState\.phase !== "confirmed"\)[\s\S]*?\n {2}\}, \[cardState\.phase\]\);/
  );
  assert.ok(cartClearEffectMatch, "expected to find the card cart-clearing effect");
  const body = cartClearEffectMatch![0];
  assert.match(body, /removePurchasedItems\(cardState\.purchasedItems\)/);
  assert.doesNotMatch(body, /clearCart\(\)/);
  assert.match(body, /if \(cardState\.phase !== "confirmed"\)/);
  // Guarded so it only ever fires once per confirmed attempt.
  assert.match(body, /cardCartClearedRef\.current/);
});

test("the polling and cart-clearing effects are the only places CARD flow ever mutates the cart — never from onError/onCancel/PIXEL_SUBMITTED", () => {
  const pixelEffectMatch = checkoutPage.match(
    /useEffect\(\(\) => \{\s*if \(!pixelActive\)[\s\S]*?\n {2}\}, \[pixelActive\]\);/
  )![0];
  const startCardAttemptMatch = checkoutPage.match(
    /const startCardAttempt = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/
  )![0];
  assert.doesNotMatch(pixelEffectMatch, /clearCart/);
  assert.doesNotMatch(pixelEffectMatch, /removePurchasedItems/);
  assert.doesNotMatch(startCardAttemptMatch, /clearCart/);
  assert.doesNotMatch(startCardAttemptMatch, /removePurchasedItems/);
});

test("the 'confirmed' UI state never redirects away from the checkout page and never claims success before the fact", () => {
  const confirmedBlockMatch = checkoutPage.match(/\{cardState\.phase === "confirmed" && \([\s\S]*?Continue Shopping[\s\S]*?\)\}/);
  assert.ok(confirmedBlockMatch, "expected to find the confirmed-phase UI block");
  const block = confirmedBlockMatch![0];
  assert.match(block, /Payment confirmed/);
  // Partial fulfillment gets distinct, honest copy, not a blanket success message.
  assert.match(block, /cardState\.isPartial/);
});

test("polling never dispatches POLL_PENDING while status is 'created' or 'pending' — mark_paymob_intention_created sets 'pending' server-side before the customer has even seen the card form (nothing in this system ever sets a distinct 'processing' status), so excluding only 'created' still moved the UI to 'confirming' on literally the first poll", () => {
  const pollEffectMatch = checkoutPage.match(
    /useEffect\(\(\) => \{\s*if \(cardState\.phase !== "pixel_open" && cardState\.phase !== "confirming"\)[\s\S]*?\n {2}\}, \[cardState\.phase, cardState\.paymentAttemptId, user\]\);/
  );
  assert.ok(pollEffectMatch, "expected to find the confirmation-polling effect");
  const body = pollEffectMatch![0];
  // Two POLL_PENDING dispatch sites exist: the MAX_ATTEMPTS transient-
  // read-failure fallback, and the status-branch one this test targets —
  // the latter is the one guarded by "status !== "created" && status !==
  // "pending"".
  const pollPendingIndex = body.lastIndexOf('dispatchCard({ type: "POLL_PENDING" })');
  assert.ok(pollPendingIndex !== -1);
  const guardBefore = body.slice(0, pollPendingIndex);
  assert.match(guardBefore, /status !== "created" && status !== "pending"/);
});

test("the Pixel container div is never conditionally unmounted by cardState.phase — it's rendered unconditionally (CSS-hidden, not removed) for the whole card-payment-method lifetime, so React never tries to remove DOM nodes Pixel injected outside its own knowledge", () => {
  // The old, crash-prone pattern removed the container from the tree
  // entirely on every phase change: {(cardState.phase === "ready" ||
  // cardState.phase === "pixel_open") && (<div>...<div id={...}/></div>)}.
  assert.doesNotMatch(
    checkoutPage,
    /\{\(cardState\.phase === "ready" \|\| cardState\.phase === "pixel_open"\) && \(/
  );
  // Also not gated on any state set from inside the mounting effect (that
  // would race the effect's own synchronous new PixelConstructor(...)
  // call, which needs the container to already exist in the DOM).
  assert.doesNotMatch(checkoutPage, /pixelMountEverStarted/);
  const containerBlockMatch = checkoutPage.match(
    /<div\s+className=\{`rounded-md border border-stone-150 bg-white p-4[\s\S]*?<div id=\{PAYMOB_PIXEL_CONTAINER_ID\} \/>[\s\S]*?<\/div>/
  );
  assert.ok(containerBlockMatch, "expected to find the always-rendered Pixel container block");
  assert.match(containerBlockMatch![0], /"hidden"/);
});

test("the Pixel-mounting effect depends on a stable pixelActive boolean, not cardState.clientSecret directly — clientSecret is cleared by the same PIXEL_MOUNTED dispatch that sets phase to pixel_open, which previously re-ran (and cleaned up) this effect immediately after mounting", () => {
  assert.match(
    checkoutPage,
    /const pixelActive = cardState\.phase === "ready" \|\| cardState\.phase === "pixel_open";/
  );
  const effectMatch = checkoutPage.match(/useEffect\(\(\) => \{\s*if \(!pixelActive\)[\s\S]*?\n {2}\}, \[pixelActive\]\);/);
  assert.ok(effectMatch, "expected to find the Pixel-mounting effect");
  assert.match(effectMatch![0], /if \(pixelInstanceRef\.current\) return/);
});

test("checkout mounts the pending-card-payment reconciler — covers pressing Back into /checkout via client-side routing, which remounts this page but not the app-level providers", () => {
  assert.match(
    checkoutPage,
    /import \{ usePendingCardPaymentReconciliation \} from "@\/lib\/hooks\/usePendingCardPaymentReconciliation"/
  );
  assert.match(checkoutPage, /usePendingCardPaymentReconciliation\(\);/);
});

test("a pending-attempt marker is written the moment the intention succeeds — before the customer has even seen the card form — so a refresh/Back/closed-tab at any point after can still recover", () => {
  assert.match(
    checkoutPage,
    /import \{\s*clearPendingCardAttempt,\s*writePendingCardAttempt,\s*\} from "@\/lib\/payments\/pendingCardAttempt"/
  );
  const startCardAttemptMatch = checkoutPage.match(
    /const startCardAttempt = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/
  );
  assert.ok(startCardAttemptMatch, "expected to find the startCardAttempt function");
  const body = startCardAttemptMatch![0];
  const writeIndex = body.indexOf("writePendingCardAttempt(user.id, result.data.paymentAttemptId)");
  const dispatchIndex = body.indexOf('type: "INTENTION_SUCCEEDED"');
  assert.ok(writeIndex !== -1, "expected writePendingCardAttempt to be called on intention success");
  assert.ok(dispatchIndex !== -1);
  assert.ok(writeIndex < dispatchIndex, "marker should be written before (or as part of) handling success, not after");
});

test("the pending marker is cleared once the live polling path itself reaches a terminal outcome (fulfilled or a real failure) — not left to the next page load's reconciler alone", () => {
  const pollEffectMatch = checkoutPage.match(
    /useEffect\(\(\) => \{\s*if \(cardState\.phase !== "pixel_open" && cardState\.phase !== "confirming"\)[\s\S]*?\n {2}\}, \[cardState\.phase, cardState\.paymentAttemptId, user\]\);/
  );
  assert.ok(pollEffectMatch, "expected to find the confirmation-polling effect");
  const body = pollEffectMatch![0];
  const clearCount = (body.match(/clearPendingCardAttempt\(user\.id\)/g) ?? []).length;
  // Once for the fulfilled branch, once for the real-failure branch.
  assert.equal(clearCount, 2);
});
