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

interface AuthResult {
  error?: string;
  needsEmailConfirmation?: boolean;
}

// Just enough to decide what the header's "Dashboard" link should point
// at (Round 3, Phase 7) — the full role/permission picture lives in each
// area's own server-side gate (requireAdminUser/requireBrandOwner), this
// is a client-side hint only, not a security boundary.
export interface AuthProfile {
  isAdmin: boolean;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<AuthProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return { isAdmin: data.is_admin, role: data.role };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      setProfile(sessionUser ? await fetchProfile(sessionUser.id) : null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        fetchProfile(sessionUser.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signUp = useCallback(
    async (fullName: string, email: string, password: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          // Send the confirmation link back to wherever the app is running
          // (localhost in dev, the deployed domain in production) instead of
          // relying on a single fixed Site URL in the Supabase dashboard.
          emailRedirectTo: `${window.location.origin}/account`,
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
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
