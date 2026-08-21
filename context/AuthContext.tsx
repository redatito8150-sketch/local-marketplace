"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceId";
import { normalizeAuthError } from "@/lib/errors/authMessages";
import {
  resolvePendingMfaChallenge,
  type PendingMfaChallenge,
} from "@/lib/supabase/mfaAuth";
import { isCompleteTotpCode, normalizeTotpCode } from "@/lib/auth/oneTimeCode";

interface AuthResult {
  error?: string;
  needsEmailConfirmation?: boolean;
  mfaRequired?: boolean;
}

export type MfaChallenge = PendingMfaChallenge;

const MFA_CHECK_ERROR =
  "We couldn't verify your multi-factor session. Refresh and try again, or sign out.";

// Just enough to decide what the header's "Dashboard" link should point
// at (Round 3, Phase 7) — the full role/permission picture lives in each
// area's own server-side gate (requireAdminUser/requireBrandOwner), this
// is a client-side hint only, not a security boundary.
export interface AuthProfile {
  isAdmin: boolean;
  role: string;
  onboardingCompletedAt: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  mfaChallenge: MfaChallenge | null;
  mfaError: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    fullName: string,
    email: string,
    phone: string,
    password: string
  ) => Promise<AuthResult>;
  verifyMfaChallenge: (code: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<AuthProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin, role, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    isAdmin: data.is_admin,
    role: data.role,
    onboardingCompletedAt: data.onboarding_completed_at,
  };
}

// Registers this browser in the account's "your devices" list (security
// page) — best-effort, never blocks or errors visibly if it fails.
function touchSession() {
  const deviceId = getDeviceId();
  if (!deviceId) return;
  fetch("/api/account/sessions/touch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  }).catch(() => {});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const sessionSyncVersion = useRef(0);

  useEffect(() => {
    let disposed = false;

    const synchronizeSession = (
      sessionUser: User | null,
      shouldTouchSession: boolean,
      defer = false
    ) => {
      const version = ++sessionSyncVersion.current;
      setUser(sessionUser);

      if (!sessionUser) {
        setProfile(null);
        setMfaChallenge(null);
        setMfaError(null);
        setLoading(false);
        return;
      }

      // Keep navigation blocked until both the role hint and the AAL check
      // finish. Otherwise a restored aal1 session can redirect away from the
      // challenge during the brief gap before getAuthenticatorAssuranceLevel.
      setLoading(true);
      const finish = async () => {
        const [nextProfile, mfaResolution] = await Promise.all([
          fetchProfile(sessionUser.id),
          resolvePendingMfaChallenge(supabase),
        ]);
        if (disposed || version !== sessionSyncVersion.current) return;

        setProfile(nextProfile);
        setMfaChallenge(
          mfaResolution.status === "required" ? mfaResolution.challenge : null
        );
        setMfaError(
          mfaResolution.status === "unavailable" ? MFA_CHECK_ERROR : null
        );
        setLoading(false);

        if (mfaResolution.status === "satisfied" && shouldTouchSession) {
          touchSession();
        }
      };

      // Supabase recommends keeping async Auth calls outside the synchronous
      // onAuthStateChange callback to avoid client-lock deadlocks.
      if (defer) {
        window.setTimeout(() => void finish(), 0);
      } else {
        void finish();
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      synchronizeSession(data.session?.user ?? null, true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;
      synchronizeSession(sessionUser, event === "SIGNED_IN" || event === "MFA_CHALLENGE_VERIFIED", true);
    });

    return () => {
      disposed = true;
      sessionSyncVersion.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setMfaError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: normalizeAuthError("auth.signIn", error).userMessage };

    // Password alone only proves aal1. An account with a verified TOTP
    // factor also needs aal2 before it's really "signed in" — leave the
    // Supabase session as-is (it already exists at aal1) but surface a
    // pending challenge so the UI can block on a code before treating the
    // user as authenticated for anything sensitive.
    const mfaResolution = await resolvePendingMfaChallenge(supabase);
    if (mfaResolution.status === "required") {
      setMfaChallenge(mfaResolution.challenge);
      return { mfaRequired: true };
    }
    if (mfaResolution.status === "unavailable") {
      setMfaError(MFA_CHECK_ERROR);
      return { error: MFA_CHECK_ERROR };
    }
    setMfaChallenge(null);
    return {};
  }, []);

  const verifyMfaChallenge = useCallback(
    async (code: string) => {
      if (!mfaChallenge) return { error: "No pending verification" };
      const normalizedCode = normalizeTotpCode(code);
      if (!isCompleteTotpCode(normalizedCode)) return { error: "Enter all 6 digits from your authenticator app." };
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaChallenge.factorId,
      });
      if (challengeError) return { error: normalizeAuthError("auth.mfa.challenge", challengeError).userMessage };

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaChallenge.factorId,
        challengeId: challenge.id,
        code: normalizedCode,
      });
      if (verifyError) {
        // The one auth failure mode with a genuinely more useful specific
        // message than normalizeAuthError's defaults — an incorrect code
        // is extremely common (typo, expired app entry) and "sign in
        // again" (its default "session"/generic wording) would be
        // actively misleading here.
        return { error: /invalid|incorrect/i.test(verifyError.message) ? "That code is incorrect. Check your authenticator app and try again." : normalizeAuthError("auth.mfa.verify", verifyError).userMessage };
      }

      const mfaResolution = await resolvePendingMfaChallenge(supabase);
      if (mfaResolution.status !== "satisfied") {
        if (mfaResolution.status === "unavailable") setMfaError(MFA_CHECK_ERROR);
        return { error: "Verification did not complete. Please try again." };
      }

      setMfaError(null);
      setMfaChallenge(null);
      return {};
    },
    [mfaChallenge]
  );

  const signUp = useCallback(
    async (
      fullName: string,
      email: string,
      phone: string,
      password: string
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone },
          // Send the confirmation link back to wherever the app is running
          // (localhost in dev, the deployed domain in production) instead of
          // relying on a single fixed Site URL in the Supabase dashboard.
          emailRedirectTo: `${window.location.origin}/account`,
        },
      });
      if (error) return { error: normalizeAuthError("auth.signUp", error).userMessage };
      // If email confirmation is required, Supabase returns a user but no
      // session — surface that distinctly so the UI can show the right message.
      if (data.user && !data.session) return { needsEmailConfirmation: true };
      return {};
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMfaChallenge(null);
    setMfaError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, mfaChallenge, mfaError, signIn, signUp, verifyMfaChallenge, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
