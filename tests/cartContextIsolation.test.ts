import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the React-bound wiring in context/CartContext.tsx
// and app/providers.tsx — the actual isolation/reconciliation ALGORITHMS
// (lib/cart/cartStorage.ts, lib/payments/reconcilePendingCardPayment.ts,
// lib/payments/pendingCardAttempt.ts) are exercised with real function
// calls in tests/cartStorage.test.ts, tests/reconcilePendingCardPayment.
// test.ts and tests/pendingCardAttempt.test.ts. What's checked here is
// that the React provider actually wires those pure functions in
// correctly — this project has no React/DOM test runner, so source-text
// verification is the established pattern for client-component logic
// (see tests/checkoutCardPixel.test.ts).

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const cartContext = read("context/CartContext.tsx");
const providers = read("app/providers.tsx");

test("CartContext consumes useAuth() and derives its storage key from the authenticated identity, not a fixed key", () => {
  assert.match(cartContext, /import \{ useAuth \} from "@\/context\/AuthContext"/);
  assert.match(cartContext, /const \{ user, loading: authLoading \} = useAuth\(\);/);
  assert.match(cartContext, /cartStorageKey\(user\?\.id \?\? null\)/);
  // The old cross-account leak: a single fixed key shared by every
  // identity on the browser.
  assert.doesNotMatch(cartContext, /local_cart_v1/);
});

test("hydration is deliberately deferred while auth is still resolving — never hydrates into a guest cart that then has to be swapped a moment later", () => {
  assert.match(cartContext, /const storageKey = authLoading \? null : cartStorageKey/);
});

test("switching identity re-hydrates from the new scope's own key instead of carrying over in-memory items from the previous scope", () => {
  // The hydration effect is keyed on storageKey (re-runs whenever it
  // changes) and always re-reads fresh from localStorage rather than
  // deriving from the current in-memory `items`.
  const hydrationEffectMatch = cartContext.match(
    /useEffect\(\(\) => \{\s*if \(!storageKey \|\| storageKey === hydratedForKey\)[\s\S]*?\n {2}\}, \[storageKey, hydratedForKey\]\);/
  );
  assert.ok(hydrationEffectMatch, "expected to find the hydration effect");
  const body = hydrationEffectMatch![0];
  assert.match(body, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(body, /setItems\(stored \? JSON\.parse\(stored\) : \[\]\)/);
  // Never writes the outgoing scope's items into the new key — this
  // effect only ever reads, it has no localStorage.setItem call.
  assert.doesNotMatch(body, /localStorage\.setItem/);
});

test("persistence never writes before a scope has been hydrated, and never writes a foreign scope's data — both effects gate on storageKey === hydratedForKey", () => {
  const persistEffectMatch = cartContext.match(
    /useEffect\(\(\) => \{\s*if \(!storageKey \|\| storageKey !== hydratedForKey\)[\s\S]*?\n {2}\}, \[items, storageKey, hydratedForKey\]\);/
  );
  assert.ok(persistEffectMatch, "expected to find the persistence effect");
  assert.match(persistEffectMatch![0], /window\.localStorage\.setItem\(storageKey, JSON\.stringify\(items\)\)/);
});

test("removePurchasedItems delegates to the pure, independently-tested applyPurchasedItemRemoval — no inline duplicate removal logic", () => {
  assert.match(cartContext, /import \{ applyPurchasedItemRemoval, cartStorageKey \} from "@\/lib\/cart\/cartStorage"/);
  const removePurchasedItemsMatch = cartContext.match(
    /const removePurchasedItems = useCallback\(\(purchased: PurchasedCartLine\[\]\) => \{[\s\S]*?\n {2}\}, \[\]\);/
  );
  assert.ok(removePurchasedItemsMatch, "expected to find removePurchasedItems");
  assert.match(removePurchasedItemsMatch![0], /applyPurchasedItemRemoval\(prev, purchased\)/);
});

test("the app-wide pending-card-payment reconciler is mounted inside CartProvider (needs useCart/useAuth) and runs once per app load", () => {
  assert.match(providers, /import \{ usePendingCardPaymentReconciliation \} from "@\/lib\/hooks\/usePendingCardPaymentReconciliation"/);
  assert.match(providers, /function PendingCardPaymentReconciler\(\)/);
  assert.match(providers, /usePendingCardPaymentReconciliation\(\);/);
  // Must be nested inside CartProvider (and therefore AuthProvider) to
  // have working useCart()/useAuth() — checked by source order: the
  // reconciler component's JSX usage must appear between the CartProvider
  // open tag and its close tag.
  const cartProviderOpen = providers.indexOf("<CartProvider>");
  const cartProviderClose = providers.indexOf("</CartProvider>");
  const reconcilerUsage = providers.indexOf("<PendingCardPaymentReconciler");
  assert.ok(cartProviderOpen !== -1 && cartProviderClose !== -1 && reconcilerUsage !== -1);
  assert.ok(reconcilerUsage > cartProviderOpen && reconcilerUsage < cartProviderClose);
});

test("CartContext exposes isHydrated, computed only from hydratedForKey/storageKey — true exactly once items reflects the real stored cart", () => {
  assert.match(cartContext, /isHydrated: hydratedForKey !== null && hydratedForKey === storageKey,/);
});

// The actual bug this guards against: PendingCardPaymentReconciler is a
// CHILD of CartProvider (asserted above), and React fires child effects
// before parent effects on the same commit. The first time useAuth()'s
// user resolves, CartProvider's own hydration effect and the reconciler's
// effect both become eligible to run in the same pass — without waiting
// for isHydrated, the reconciler used to run FIRST, call
// removePurchasedItems() against the still-empty placeholder `items: []`
// (a silent no-op), then CartProvider's hydration effect would overwrite
// state with the real stored cart a moment later — discarding the
// removal entirely while the pending-attempt marker was already cleared,
// so it could never retry. This was the root cause of a card order's item
// staying in the cart after every payment involving a redirect/refresh
// (e.g. a 3D Secure bounce), regardless of any Paymob-side configuration.
const reconciliationHook = read("lib/hooks/usePendingCardPaymentReconciliation.ts");

test("the pending-card-payment reconciler waits for isHydrated before touching the cart, and re-runs once it becomes true", () => {
  assert.match(reconciliationHook, /const \{ removePurchasedItems, isHydrated \} = useCart\(\);/);
  const effectMatch = reconciliationHook.match(
    /useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[user, isHydrated, removePurchasedItems\]\);/
  );
  assert.ok(effectMatch, "expected to find the reconciliation effect with isHydrated in its dependency array");
  assert.match(effectMatch![0], /if \(!user \|\| !isHydrated\) return;/);
  // The guard must run before any cart read/mutation — readPendingCardAttempt
  // and removePurchasedItems must not appear ahead of it.
  const guardIndex = effectMatch![0].indexOf("if (!user || !isHydrated) return;");
  const readPendingIndex = effectMatch![0].indexOf("readPendingCardAttempt(");
  assert.ok(guardIndex !== -1 && readPendingIndex !== -1 && guardIndex < readPendingIndex);
});
