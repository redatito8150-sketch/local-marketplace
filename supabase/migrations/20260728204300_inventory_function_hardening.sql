-- Trigger-only functions must not be callable through the public RPC API.
revoke all on function public.prevent_inventory_movement_mutation()
from public, anon, authenticated;
revoke all on function public.record_order_placed_inventory_movement()
from public, anon, authenticated;
revoke all on function public.record_order_cancelled_inventory_movements()
from public, anon, authenticated;

;
