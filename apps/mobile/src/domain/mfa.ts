export type AuthenticatorAssuranceLevel = "aal1" | "aal2" | (string & {}) | null;
export type MfaGateStatus = "signed-out" | "checking" | "required" | "satisfied" | "error";

export function resolveMfaGateStatus(
  currentLevel: AuthenticatorAssuranceLevel,
  nextLevel: AuthenticatorAssuranceLevel
): Exclude<MfaGateStatus, "signed-out" | "checking"> {
  if (currentLevel === "aal2") return "satisfied";
  if (currentLevel === "aal1" || currentLevel === null) {
    if (nextLevel === "aal2") return "required";
    if (nextLevel === "aal1" || nextLevel === null) return "satisfied";
  }
  return "error";
}
