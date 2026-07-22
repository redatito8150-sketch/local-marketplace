"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// Cloudflare Turnstile (not reCAPTCHA) — the site key is the only piece
// this app's frontend ever needs. The matching *secret* key is never used
// here: Supabase Auth verifies the token server-side against that secret
// itself (configured in Supabase Dashboard -> Authentication -> Attack
// Protection), so this project's Next.js server never sees or checks it.
// See .env.local.example for the required env vars and where each one goes.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export interface CaptchaWidgetHandle {
  /** Clears the current (now-consumed or expired) token so the user can retry. */
  reset: () => void;
}

// Renders nothing at all when NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set, so
// local dev and any deployment that hasn't turned on captcha protection is
// completely unaffected — signUp() just omits captchaToken in that case
// (Supabase ignores it entirely when the project has no captcha provider
// configured). This is the "fail gracefully without breaking local dev"
// requirement — there's no env-var-missing error, just no widget.
const CaptchaWidget = forwardRef<CaptchaWidgetHandle, { onToken: (token: string) => void }>(
  function CaptchaWidget({ onToken }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | undefined>(undefined);
    const [loadError, setLoadError] = useState(false);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
        onToken("");
      },
    }));

    useEffect(() => {
      if (!SITE_KEY) return;

      const render = () => {
        if (!containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => setLoadError(true),
        });
      };

      if (window.turnstile) {
        render();
        return () => {
          if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
        };
      }

      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      const onLoad = () => render();
      const onError = () => setLoadError(true);

      if (existing) {
        existing.addEventListener("load", onLoad);
        existing.addEventListener("error", onError);
        return () => {
          existing.removeEventListener("load", onLoad);
          existing.removeEventListener("error", onError);
          if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
        };
      }

      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.addEventListener("load", onLoad);
      script.addEventListener("error", onError);
      document.body.appendChild(script);
      return () => {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      };
      // onToken is stable from the caller's useCallback/useState setter.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!SITE_KEY) return null;
    if (loadError) {
      return (
        <p className="text-[12.5px] text-ink-soft/60">
          Verification widget failed to load — check your connection and refresh the page.
        </p>
      );
    }
    return <div ref={containerRef} />;
  }
);

export default CaptchaWidget;
