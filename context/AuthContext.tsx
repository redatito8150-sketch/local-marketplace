"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceId";

interface AuthResult {
  error?: string;
  needsEmailConfirmation?: boolean;
  mfaRequired?: boolean;
}

export interface MfaChallenge {
  factorId: string;
}

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
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    fullName: string,
    email: string,
    phone: string,
    password: string,
    captchaToken?: string
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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      setProfile(sessionUser ? await fetchProfile(sessionUser.id) : null);
      setLoading(false);
      if (sessionUser) touchSession();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        fetchProfile(sessionUser.id).then(setProfile);
        if (event === "SIGNED_IN") touchSession();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    // Password alone only proves aal1. An account with a verified TOTP
    // factor also needs aal2 before it's really "signed in" — leave the
    // Supabase session as-is (it already exists at aal1) but surface a
    // pending challenge so the UI can block on a code before treating the
    // user as authenticated for anything sensitive.
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (level && level.nextLevel === "aal2" && level.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factorId = factors?.totp?.find((f) => f.status === "verified")?.id;
      if (factorId) {
        setMfaChallenge({ factorId });
        return { mfaRequired: true };
      }
    }
    return {};
  }, []);

  const verifyMfaChallenge = useCallback(
    async (code: string) => {
      if (!mfaChallenge) return { error: "No pending verification" };
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaChallenge.factorId,
      });
      if (challengeError) return { error: challengeError.message };

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaChallenge.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) return { error: verifyError.message };

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
      password: string,
      captchaToken?: string
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
          // Only sent when captcha protection is enabled in the Supabase
          // Dashboard (NEXT_PUBLIC_TURNSTILE_SITE_KEY set) — Supabase
          // ignores captchaToken entirely when the project has no captcha
          // provider configured, so this is safe to always pass through.
          captchaToken,
        },
      });
      if (error) return { error: error.message };
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
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, mfaChallenge, signIn, signUp, verifyMfaChallenge, signOut }}
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
