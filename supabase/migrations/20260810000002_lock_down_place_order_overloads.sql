-- Security hotfix: remove every known legacy place_order overload and keep
-- only the current 12-argument server-side entry point. PostgreSQL grants
-- EXECUTE to PUBLIC for new functions unless default privileges say otherwise,
-- so both the existing function ACL and future migration-runner defaults are
-- locked down here.

begin;

-- Legacy signatures observed across the schema history and the connected
-- production metadata. None may remain addressable through PostgREST RPC.
drop function if exists public.place_order(
  text, text, text, text, text, text, uuid, jsonb
);
drop function if exists public.place_order(
  text, text, text, text, text, text, uuid, jsonb, text
);
drop function if exists public.place_order(
  text, text, text, text, text, text, uuid, jsonb, text, uuid
);

-- The canonical checkout RPC is invoked only by trusted server code. Revoke
-- PUBLIC explicitly because anon/authenticated inherit its function access.
revoke all on function public.place_order(
  text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.place_order(
  text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric
) to service_role;

-- Default privileges are scoped to the role applying migrations. Future
-- functions created by a different owner must establish the same defaults for
-- that owner before creating functions in the exposed public schema.
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- Fail closed if the expected canonical function is missing, another overload
-- exists, or a client role can still execute it through a direct or inherited
-- grant. Keeping this assertion in the migration prevents a partial-looking
-- success when production metadata differs from the repository history.
do $place_order_acl_guard$
declare
  v_canonical regprocedure;
  v_unexpected regprocedure;
begin
  v_canonical := to_regprocedure(
    'public.place_order(text,text,text,text,text,text,uuid,jsonb,text,uuid,numeric,numeric)'
  );

  if v_canonical is null then
    raise exception 'Canonical public.place_order signature is missing';
  end if;

  select p.oid::regprocedure
  into v_unexpected
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'place_order'
    and p.oid <> v_canonical::oid
  order by p.oid
  limit 1;

  if v_unexpected is not null then
    raise exception 'Unexpected public.place_order overload remains: %', v_unexpected;
  end if;

  if pg_catalog.has_function_privilege('anon', v_canonical, 'execute')
     or pg_catalog.has_function_privilege('authenticated', v_canonical, 'execute') then
    raise exception 'Client role still has EXECUTE on canonical public.place_order';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_canonical, 'execute') then
    raise exception 'service_role lacks EXECUTE on canonical public.place_order';
  end if;
end
$place_order_acl_guard$;

commit;
