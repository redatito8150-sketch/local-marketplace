-- RLS does not govern TRUNCATE, REFERENCES, or TRIGGER. Supabase's public
-- schema default privileges can grant those capabilities to API roles on new
-- tables, so reset the complete table ACL before restoring read-only access.
revoke all on public.warehouse_receipts, public.warehouse_receipt_lines,
  public.warehouse_corrections, public.warehouse_correction_lines
  from public, anon, authenticated, service_role;

grant select on public.warehouse_receipts, public.warehouse_receipt_lines,
  public.warehouse_corrections, public.warehouse_correction_lines
  to authenticated, service_role;
