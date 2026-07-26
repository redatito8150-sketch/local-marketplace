import { Session, User } from "@supabase/supabase-js";
import {
  AppState,
  AppStateStatus,
  Linking,
} from "react-native";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { parseAuthCallback } from "@/domain/auth-callback";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  recoverPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let active = true;
    const consumeAuthUrl = async (url: string | null) => {
      if (!url) return;
      const callback = parseAuthCallback(url);
      if (callback?.kind === "tokens") {
        await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
      } else if (callback?.kind === "code") {
        await supabase.auth.exchangeCodeForSession(callback.code);
      }
    };
    const initialize = async () => {
      try {
        await consumeAuthUrl(await Linking.getInitialURL());
        const { data } = await supabase.auth.getSession();
        if (active) setSession(data.session);
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void initialize();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
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
      data.subscription.unsubscribe();
      subscription.remove();
      linkSubscription.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session?.user),
      isLoading,
      configurationError: isSupabaseConfigured
        ? null
        : "Supabase public environment variables are missing.",
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email, password, name) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: "mahaly://" }
        });
        if (error) throw error;
      },
      recoverPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: "mahaly://reset-password"
        });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    }),
    [isLoading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
