-- GREATEST and LEAST are PostgreSQL conditional expressions, not ordinary
-- functions that can be schema-qualified. Rewrite the already-deployed
-- receipt function in place without duplicating its large audited body.
do $migration$
declare
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public.receive_warehouse_document_v2(uuid,uuid,jsonb,text,text)'
  );
  v_definition text;
begin
  if v_signature is null then
    raise exception 'receive_warehouse_document_v2 is not installed';
  end if;

  select pg_catalog.pg_get_functiondef(v_signature)
  into v_definition;

  v_definition := pg_catalog.replace(
    v_definition,
    'pg_catalog.greatest(',
    'greatest('
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'pg_catalog.least(',
    'least('
  );

  if pg_catalog.strpos(v_definition, 'pg_catalog.greatest(') > 0
     or pg_catalog.strpos(v_definition, 'pg_catalog.least(') > 0 then
    raise exception 'warehouse receipt conditional-expression rewrite was incomplete';
  end if;

  execute v_definition;
end;
$migration$;

revoke all on function public.receive_warehouse_document_v2(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.receive_warehouse_document_v2(uuid, uuid, jsonb, text, text)
  to service_role;
