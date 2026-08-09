import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  decideMfaAccess,
  type MfaAccessDecision,
} from "../auth/mfaPolicy.ts";

type AuthClient = Pick<SupabaseClient, "auth">;

export type MfaUserState =
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated"; user: null }
  | { status: Exclude<MfaAccessDecision, "allow">; user: User };

// getUser() verifies the JWT with Supabase Auth before any claim is trusted.
// Supplying accessToken also makes the AAL lookup validate that token and
// fetch its factors, which is required for native Bearer-token requests.
export async function getMfaUserState(
  client: AuthClient,
  accessToken?: string
): Promise<MfaUserState> {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser(accessToken);

  if (userError || !user) return { status: "unauthenticated", user: null };

  const { data: assurance, error: assuranceError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  const decision = decideMfaAccess(assurance, Boolean(assuranceError));

  if (decision === "allow") return { status: "authenticated", user };
  return { status: decision, user };
}

export interface PendingMfaChallenge {
  factorId: string;
}

export type MfaChallengeResolution =
  | { status: "satisfied"; challenge: null }
  | { status: "required"; challenge: PendingMfaChallenge }
  | { status: "unavailable"; challenge: null };

// Client-side companion to the server gate. It is used both immediately
// after password sign-in and when restoring a cookie session after reload or
// OAuth callback, so the challenge cannot disappear with React state.
export async function resolvePendingMfaChallenge(
  client: AuthClient
): Promise<MfaChallengeResolution> {
  try {
    const { data: assurance, error: assuranceError } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    const decision = decideMfaAccess(assurance, Boolean(assuranceError));

    if (decision === "allow") return { status: "satisfied", challenge: null };
    if (decision === "assurance_unavailable") {
      return { status: "unavailable", challenge: null };
    }

    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    if (factorsError) return { status: "unavailable", challenge: null };

    const factor = factors?.totp?.find((candidate) => candidate.status === "verified");
    if (!factor) return { status: "unavailable", challenge: null };

    return { status: "required", challenge: { factorId: factor.id } };
  } catch {
    return { status: "unavailable", challenge: null };
  }
}
