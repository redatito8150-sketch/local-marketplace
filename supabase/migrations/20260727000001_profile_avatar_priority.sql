-- Separates the user-controlled avatar from OAuth-provider-supplied avatar
-- data. Previously the only avatar storage was auth.users.user_metadata.
-- avatar_url — the same key Supabase's own GoTrue writes into on every
-- Google OAuth sign-in (merging the provider's `avatar_url`/`picture`
-- claim), so each Google login silently overwrote a manually uploaded
-- photo. profiles.avatar_url is now the sole manually-uploaded source of
-- truth — only app/api/account/avatar writes to it, and this migration
-- guarantees nothing else in the schema ever does. profiles.
-- provider_avatar_url mirrors the OAuth provider's photo purely as a
-- fallback for when no manual photo has been uploaded yet, and is kept in
-- sync automatically by the trigger below.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists provider_avatar_url text;

-- Account creation: a brand-new signup never has a manually uploaded photo
-- yet, so avatar_url always starts null regardless of provider.
-- provider_avatar_url captures whatever the provider handed over at signup
-- (Google's avatar_url/picture claim; null for a plain email/password
-- signup) as a same-tick fallback — kept current afterwards by the
-- on_auth_user_metadata_updated trigger below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url, provider_avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    null,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

-- Keeps profiles.provider_avatar_url current every time Supabase's GoTrue
-- rewrites auth.users.raw_user_meta_data — identity linking, and every
-- subsequent OAuth sign-in re-syncing the provider's claims. Deliberately
-- touches provider_avatar_url ONLY. It must never write to avatar_url, so a
-- manually uploaded photo can never be overwritten by this trigger no
-- matter how many times the user signs in with Google.
create or replace function public.sync_provider_avatar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set provider_avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;

-- `update of raw_user_meta_data` scopes this to fire only when that column
-- is part of the UPDATE's SET list (identity linking, OAuth metadata
-- re-sync) — ordinary session/token-refresh updates that never touch
-- metadata don't invoke it.
create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_provider_avatar();

revoke all on function public.sync_provider_avatar() from public;
revoke all on function public.sync_provider_avatar() from anon, authenticated;
