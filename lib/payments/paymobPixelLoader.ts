// Loads Paymob's official embedded-checkout widget ("Pixel", npm package
// `paymob-pixel`) on demand, client-side only.
//
// Confirmed by inspecting the actual published bundle (unpkg.com/paymob-pixel@1.2.7/main.js)
// rather than assumed from docs alone:
//   - It is a self-executing bundle whose only externally-visible effect is
//     `window.Pixel = Pixel` — it has no real ESM `export`, so it cannot be
//     `import`ed through Next.js's bundler; it must be loaded via a
//     <script> tag, exactly as Paymob's own docs show.
//   - The exported class is `Pixel`, constructed as
//     `new Pixel({ publicKey, clientSecret, paymentMethods, elementId, ... })`.
//     `this._options.publicKey` / `.clientSecret` / `.paymentMethods` /
//     `.elementId` are all read directly off the constructor argument.
//   - `paymentMethods` is an array of string slugs (e.g. "card"), not
//     Paymob integration IDs.
//   - Constructing with both `clientSecret` and `paymentMethods` set
//     selects the SDK's "directPayment" integration mode (vs. a
//     "tokenization" mode used for other flows) — the correct mode for a
//     clientSecret obtained from our own Create Intention endpoint.
//   - The constructor mounts synchronously into `document.getElementById(elementId)`
//     as part of its own internal render call — the container element must
//     already exist in the DOM before `new Pixel(...)` runs.
//   - `onError` and `onCancel` are the only payment-outcome-adjacent
//     callbacks the SDK exposes. There is no onSuccess/onComplete/onPaid
//     callback anywhere in the bundle — the widget does not tell the
//     frontend when a payment succeeds, by design of the SDK itself. This
//     is not a limitation Phase 2 works around; it is exactly why no
//     frontend code can "trust" Pixel for success even if it wanted to.
//   - `.unmount()` is the documented cleanup method
//     (`unmount(){this.element=void 0}`).

// Pinned to the exact version actually inspected (see the module comment
// above) — @latest would let Paymob silently ship a future version this
// integration was never verified against. Bump this deliberately, after
// re-verifying the new version's bundle the same way, not by drifting
// along with upstream automatically.
const PIXEL_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/paymob-pixel@1.2.7/main.js";

// Stable id for the single Pixel mount point the checkout page renders.
export const PAYMOB_PIXEL_CONTAINER_ID = "paymob-pixel-container";

export interface PaymobPixelOptions {
  publicKey: string;
  clientSecret: string;
  paymentMethods: string[];
  elementId: string;
  showPaymobLogo?: boolean;
  hideCardHolderName?: boolean;
  onError?: (error: unknown) => void;
  onCancel?: (error: unknown) => void;
}

export interface PaymobPixelInstance {
  unmount: () => void;
}

export type PaymobPixelConstructor = new (options: PaymobPixelOptions) => PaymobPixelInstance;

declare global {
  interface Window {
    Pixel?: PaymobPixelConstructor;
  }
}

let loadPromise: Promise<PaymobPixelConstructor> | null = null;

export function loadPaymobPixel(): Promise<PaymobPixelConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Paymob Pixel can only be loaded in the browser"));
  }
  if (window.Pixel) return Promise.resolve(window.Pixel);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<PaymobPixelConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PIXEL_SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = PIXEL_SCRIPT_SRC;
    script.type = "module";
    script.addEventListener(
      "load",
      () => {
        if (window.Pixel) resolve(window.Pixel);
        else reject(new Error("Paymob Pixel script loaded but did not initialize"));
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error("Failed to load the Paymob Pixel script")), {
      once: true,
    });
    if (!existing) document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Allow a later retry (e.g. after a transient network failure) to try
    // loading again instead of being stuck on a permanently-rejected promise.
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}
