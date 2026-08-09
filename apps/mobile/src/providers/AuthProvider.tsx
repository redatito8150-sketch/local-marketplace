import type { Session, User } from "@supabase/supabase-js";
import {
  AppState,
  AppStateStatus,
  Linking
} from "react-native";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { MfaGateStatus } from "@/domain/mfa";
import { resolveMfaGateStatus } from "@/domain/mfa";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  clearMobileAuthRedirect,
  consumeMobileAuthCallback,
  createMobileAuthRedirect
} from "@/lib/supabase/mobile-auth-callback";

type SignInDestination = "authenticated" | "mfa-required";
type SignUpDestination = SignInDestination | "confirmation-required";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  hasSession: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaStatus: MfaGateStatus;
  requiresMfa: boolean;
  recoveryReady: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<SignInDestination>;
  signUp: (email: string, password: string, name: string, consentVersion: string) => Promise<SignUpDestination>;
  recoverPassword: (email: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  refreshMfaStatus: () => Promise<void>;
  completePasswordRecovery: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [mfaStatus, setMfaStatus] = useState<MfaGateStatus>("signed-out");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const mounted = useRef(false);
  const securityCheckVersion = useRef(0);

  const syncSessionSecurity = useCallback(async (nextSession: Session | null) => {
    const checkVersion = securityCheckVersion.current + 1;
    securityCheckVersion.current = checkVersion;

    if (!nextSession) {
      if (mounted.current) {
        setSession(null);
        setMfaStatus("signed-out");
        setRecoveryReady(false);
        setIsLoading(false);
      }
      return "signed-out" as const;
    }

    if (mounted.current) {
      setSession(nextSession);
      setMfaStatus("checking");
      setIsLoading(true);
    }

    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(
      nextSession.access_token
    );
    if (!mounted.current || checkVersion !== securityCheckVersion.current) {
      return "checking" as const;
    }

    if (error || !data) {
      setMfaStatus("error");
      setIsLoading(false);
      return "error" as const;
    }

    const status = resolveMfaGateStatus(data.currentLevel, data.nextLevel);
    setMfaStatus(status);
    setIsLoading(false);
    return status;
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!isSupabaseConfigured) {
      return () => {
        mounted.current = false;
      };
    }

    let active = true;
    const scheduledChecks = new Set<ReturnType<typeof setTimeout>>();

    const consumeAuthUrl = async (url: string | null) => {
      if (!url) return;
      const callback = await consumeMobileAuthCallback(url);
      if (!callback) return;

      const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
      const redirectType =
        "redirectType" in data && typeof data.redirectType === "string"
          ? data.redirectType
          : null;
      const redirectTypeMatches =
        callback.flow === "recovery"
          ? redirectType === "recovery"
          : redirectType !== "recovery";
      if (error || !data.session || !redirectTypeMatches) {
        if (data.session && !redirectTypeMatches) {
          await supabase.auth.signOut({ scope: "local" });
        }
        throw error ?? new Error("Auth callback type did not match the pending flow.");
      }

      setRecoveryReady(callback.flow === "recovery");
    };

    const initialize = async () => {
      try {
        await consumeAuthUrl(await Linking.getInitialURL());
      } catch {
        // The callback is intentionally single-use. A failed exchange requires a
        // fresh email link, but must not destroy an unrelated existing session.
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (active) await syncSessionSecurity(data.session);
      } catch {
        if (active) await syncSessionSecurity(null);
      }
    };
    void initialize();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
      if (event === "SIGNED_IN") setRecoveryReady(false);
      if (event === "SIGNED_OUT") setRecoveryReady(false);

      // Supabase warns against awaiting other auth methods inside this callback.
      const timer = setTimeout(() => {
        scheduledChecks.delete(timer);
        if (active) void syncSessionSecurity(nextSession);
      }, 0);
      scheduledChecks.add(timer);
    });

    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void consumeAuthUrl(url).catch(() => undefined);
    });

    return () => {
      active = false;
      mounted.current = false;
      securityCheckVersion.current += 1;
      scheduledChecks.forEach(clearTimeout);
      data.subscription.unsubscribe();
      subscription.remove();
      linkSubscription.remove();
    };
  }, [syncSessionSecurity]);

  const value = useMemo<AuthContextValue>(() => {
    const isAuthenticated = Boolean(session?.user) && mfaStatus === "satisfied";

    return {
      session,
      user: isAuthenticated ? session?.user ?? null : null,
      hasSession: Boolean(session?.user),
      isAuthenticated,
      isLoading,
      mfaStatus,
      requiresMfa: mfaStatus === "required",
      recoveryReady,
      configurationError: isSupabaseConfigured
        ? null
        : "Supabase public environment variables are missing.",
      signIn: async (email, password) => {
        setRecoveryReady(false);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) throw error ?? new Error("Sign in returned no session.");
        const status = await syncSessionSecurity(data.session);
        return status === "satisfied" ? "authenticated" : "mfa-required";
      },
      signUp: async (email, password, name, consentVersion) => {
        const emailRedirectTo = await createMobileAuthRedirect("signup");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              legal_consent_version: consentVersion,
              legal_consent_at: new Date().toISOString(),
            },
            emailRedirectTo,
          }
        });
        if (error) {
          await clearMobileAuthRedirect("signup");
          throw error;
        }
        if (!data.session) return "confirmation-required";

        await clearMobileAuthRedirect("signup");
        const status = await syncSessionSecurity(data.session);
        return status === "satisfied" ? "authenticated" : "mfa-required";
      },
      recoverPassword: async (email) => {
        const redirectTo = await createMobileAuthRedirect("recovery");
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
          await clearMobileAuthRedirect("recovery");
          throw error;
        }
      },
      verifyMfa: async (code) => {
        if (!/^\d{6}$/.test(code)) throw new Error("MFA code must contain six digits.");

        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) throw factors.error;
        const factor = factors.data.totp.find(({ status }) => status === "verified");
        if (!factor) throw new Error("No verified TOTP factor is available.");

        const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challenge.error) throw challenge.error;
        const verification = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.data.id,
          code
        });
        if (verification.error) throw verification.error;

        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) throw error ?? new Error("MFA verification returned no session.");
        const status = await syncSessionSecurity(data.session);
        if (status !== "satisfied") throw new Error("The session did not reach AAL2.");
      },
      refreshMfaStatus: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        await syncSessionSecurity(data.session);
      },
      completePasswordRecovery: async (password) => {
        if (!recoveryReady || !isAuthenticated) {
          throw new Error("A verified recovery session is required.");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecoveryReady(false);
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setRecoveryReady(false);
      }
    };
  }, [isLoading, mfaStatus, recoveryReady, session, syncSessionSecurity]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
