# Platform-wide consistency rule

For every workflow or domain change, treat all connected product surfaces as one system.

- Identify every affected actor and surface before editing: customer storefront/account, Admin Dashboard, Brand Portal, APIs, notifications, reports, and database state.
- Keep statuses, business meaning, timelines, quantities, and history canonical across all surfaces. Permissions and available actions may differ by role; the underlying truth must not.
- Never ship a one-surface workflow change when another surface reads or acts on the same data. Update all affected copy, filters, badges, transitions, empty/error states, and tests together.
- Add or update role-matrix tests covering customer, Admin, Brand Owner, assistants/staff, and admin impersonation wherever applicable.
- Before push, merge, deploy, or production verification, explicitly report whether SQL migrations are required and remind the user to apply them in the correct order before testing the dependent application code.

# Design skill routing

- For Admin Dashboard, Brand Portal, inventory, warehouse, tables, filters, and other dense operational UI, use `ui-ux-pro-max` as the primary design skill and `mahaly-web-design-guidelines` for the final accessibility and interface-quality review.
- For storefront, brand, editorial, landing, and marketing pages, use `design-taste-frontend`. It is not the primary skill for dashboards or data tables.
- For motion, use the narrowly matched Emil Kowalski skill (`animate`, `find-animation-opportunities`, `improve-animations`, or `review-animations`) and keep frequent operational actions fast and restrained.
- Use `transitions-dev` for a specific documented micro-transition after the interaction need is clear. Choose the smallest matching pattern, preserve `prefers-reduced-motion`, and do not run its whole-project review/refine commands unless the user asks.
- Use `impeccable` for explicit critique, shaping, polish, hardening, adaptation, or broad redesign work. On Admin Dashboard and Brand Portal surfaces, use its **Operate** mode and keep `ui-ux-pro-max` plus Mahaly's current system as the primary constraints. Its Live, Hooks, Doctor, Pin, context, concept-seed, and image-generation scripts are opt-in: announce and run them only when the user explicitly requests the associated operation.
- Use `brandkit` only for brand identity, logo-system, guidelines-board, or visual-world image generation. Do not use it as a general dashboard or product-UI design skill.
- Skills are advisory. Explicit user requests, Mahaly's existing design system, connected-surface consistency, permissions, and documented product decisions take precedence. In particular, do not reintroduce dark mode or replace established project tokens merely because a skill prefers them.
- The audited versions and their source commits are recorded in `docs/agent-skills.md`.
