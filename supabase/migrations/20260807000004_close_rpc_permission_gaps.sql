-- Two access-control gaps found while auditing every RPC in this project for
-- the same class of bug as place_order's missing grants (20260807000003):
--
-- 1. place_order's legacy 10-parameter overload is still live alongside the
--    new 12-parameter one — the `drop function` statement that was supposed
--    to remove it (20260807000001, see its own comment explaining why) was
--    apparently never actually run against this database, so Postgres now
--    has two overloads sharing the same first 10 parameter names and can't
--    pick one ("Could not choose the best candidate function") for any
--    caller that omits the two newer parameters. Re-stated here,
--    idempotently, so this fixes it regardless of whether that drop ran.
--
-- 2. cancel_order_group (added in 20260807000001) never got a revoke/grant
--    at all — confirmed live and exploitable: the anon key can call it
--    directly and it executes fully (reaches its internal
--    'ORDER_GROUP_NOT_FOUND' exception rather than being blocked). Worse
--    than a generic missing-grant issue: it takes p_user_id as a plain
--    parameter instead of deriving it from the caller's own session, so
--    with EXECUTE open to anon/authenticated, anyone who learns an
--    order_group_id and a user_id could cancel a *different* customer's
--    paid orders. Locked down to service_role, matching every other
--    order-mutating RPC in this project.
drop function if exists public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid);

revoke all on function public.cancel_order_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_order_group(uuid, uuid) to service_role;
