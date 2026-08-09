-- Add explicit permissions for admin surfaces that previously inherited broad
-- profiles.is_admin access. Application guards fail closed for unmapped admin
-- paths and require one of these catalog keys for every mapped surface.

insert into public.permissions (key, label, description, category, sort_order)
values
  ('view_analytics', 'View Analytics', 'View marketplace-wide revenue and performance analytics.', 'Administration', 105),
  ('view_audit_log', 'View Audit Log', 'View recorded administrative and brand activity.', 'Administration', 106),
  ('view_admin_notifications', 'View Admin Notifications', 'View the shared administrative notification feed.', 'Administration', 107),
  ('manage_settings', 'Manage Settings', 'Change operational settings and send integration test messages.', 'Administration', 108)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    category = excluded.category,
    sort_order = excluded.sort_order;

-- Preserve the legacy tier experience while making the authorization contract
-- explicit. Custom roles receive no new privilege until an administrator grants
-- it deliberately.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in (
  'view_analytics',
  'view_audit_log',
  'view_admin_notifications',
  'manage_settings'
)
where r.is_protected = true
  and r.name = 'Admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in (
  'view_analytics',
  'view_admin_notifications'
)
where r.is_protected = true
  and r.name in ('Manager', 'Staff')
on conflict do nothing;
