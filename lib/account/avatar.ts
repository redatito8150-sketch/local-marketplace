// Single source of truth for avatar display priority, shared by every
// server component that renders a profile photo. A manually uploaded
// photo (profiles.avatar_url) always wins; the OAuth provider's photo
// (profiles.provider_avatar_url, kept in sync by the
// on_auth_user_metadata_updated trigger) is shown only as a fallback when
// no manual photo has ever been uploaded. Never read
// user.user_metadata.avatar_url/picture directly for display — that key is
// rewritten by Supabase's own GoTrue on every OAuth sign-in and is not the
// user's chosen photo.
export function resolveAvatarUrl(
  avatarUrl: string | null | undefined,
  providerAvatarUrl: string | null | undefined
): string | null {
  return avatarUrl || providerAvatarUrl || null;
}
