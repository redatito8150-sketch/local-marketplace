# Platform-wide consistency rule

For every workflow or domain change, treat all connected product surfaces as one system.

- Identify every affected actor and surface before editing: customer storefront/account, Admin Dashboard, Brand Portal, APIs, notifications, reports, and database state.
- Keep statuses, business meaning, timelines, quantities, and history canonical across all surfaces. Permissions and available actions may differ by role; the underlying truth must not.
- Never ship a one-surface workflow change when another surface reads or acts on the same data. Update all affected copy, filters, badges, transitions, empty/error states, and tests together.
- Add or update role-matrix tests covering customer, Admin, Brand Owner, assistants/staff, and admin impersonation wherever applicable.
- Before push, merge, deploy, or production verification, explicitly report whether SQL migrations are required and remind the user to apply them in the correct order before testing the dependent application code.

