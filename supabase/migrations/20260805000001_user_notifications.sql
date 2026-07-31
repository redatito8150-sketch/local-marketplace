-- Per-customer in-site notification inbox. The existing `notifications`
-- table is admin-only (no per-user recipient, no public RLS policy at
-- all — see supabase/schema.sql) and is deliberately left untouched here:
-- different audience, different RLS shape, and this avoids any risk to
-- the already-working admin bell / prune trigger.
--
-- Mirrors that table's proven shape (type/title/body/read/created_at,
-- plus the same related_entity_type/related_entity_id link-to-item
-- pattern used by the admin bell) with a user_id column and RLS scoping
-- reads/updates to the owning user. All inserts happen server-side via
-- the service-role client (see lib/notify.ts's new notifyUser()) — same
-- convention as every other write in this app — so there is no insert
-- policy for anon/authenticated at all.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  related_entity_type text,
  related_entity_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_id_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "Users read own notifications" on public.user_notifications;
create policy "Users read own notifications"
  on public.user_notifications for select
  to authenticated
  using (user_id = auth.uid());

-- The only mutation an ordinary user can make is marking their own
-- notification read — never the content, never another user's row.
drop policy if exists "Users mark own notifications read" on public.user_notifications;
create policy "Users mark own notifications read"
  on public.user_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Same "keep it bounded, Discord/email is the permanent record" design as
-- the admin notifications table (see prune_old_notifications in
-- supabase/schema.sql) — capped per-user rather than globally, since this
-- table has many recipients instead of one shared admin feed.
create or replace function public.prune_old_user_notifications()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  delete from public.user_notifications
  where user_id = new.user_id
    and id not in (
      select id from public.user_notifications
      where user_id = new.user_id
      order by created_at desc
      limit 50
    );
  return new;
end;
$$;

drop trigger if exists trigger_prune_user_notifications on public.user_notifications;
create trigger trigger_prune_user_notifications
  after insert on public.user_notifications
  for each row execute function public.prune_old_user_notifications();
