# Third-party agent skills

These skills are installed for Mahaly after a source and safety review on 2026-08-19. Repository instructions and user requests always override skill preferences.

## Installation locations

- Codex user skills: `C:\Users\pc\.agents\skills`
- Claude user skills: `C:\Users\pc\.claude\skills`
- Claude project skills: `.claude/skills`
- Claude discovers project skills from `.claude/skills` when it opens this repository and user skills from its home skill directory.

## Audited sources

| Package | Audited commit | Installed scope | Notes |
| --- | --- | --- | --- |
| Taste Skill | `dfb6f9f9e93a39f673b1827c0889cc28326d1800` | `design-taste-frontend` | Primary use: storefront, landing, and brand-facing visual redesigns. It explicitly excludes dashboards and data tables. |
| UI/UX Pro Max | `8a1a6d857332da32252d77365da90c3f6293b47b` | `ui-ux-pro-max` | Primary use: admin/portal dashboards, dense tables, filters, accessibility, and design-system decisions. Includes local Python search scripts and bundled datasets. |
| Emil Kowalski Skills | `e879241fab3cdb22e8d95587cdbf40b57a88d7da` | 11 skills | Motion design, animation audits, UI-library selection, Sonner, prototyping, and interaction craft. |
| Vercel Web Interface Guidelines | agent skill `b8caa260a420a73042e35521de4b5c8baf6446cc`; rules `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1` | `mahaly-web-design-guidelines` | Installed as a pinned local variant. The upstream skill fetches live rules at runtime; Mahaly's copy reads bundled `guidelines.md` instead. |
| Transitions.dev | `4eb461439b28005ac5e7647162c50372ec718a0b` | `transitions-dev` | Installed in the Codex and Claude user directories only. The free transition skill is useful for narrowly selected UI motion. Refine, Pro, the login flow, and both CLIs were deliberately not installed. |
| Taste Skill Brandkit | `dfb6f9f9e93a39f673b1827c0889cc28326d1800` | `brandkit` | Brand identity boards, logo systems, visual-world direction, and brand-guideline imagery. It is not a general product-UI or dashboard skill. |
| Impeccable | `f88b2837a7d7c3182e46307bbbb091a1ed547571` | `impeccable` v4.1.1 | Broad design critique and finishing playbooks. The installed payload includes optional local-browser, source-editing, detector, hook, and image-generation scripts, so the execution restrictions below apply. |

The previously installed packages and Brandkit are MIT licensed. Impeccable is Apache-2.0. Transitions.dev transition snippets use the project's own terms: they may be used and modified in personal or commercial products, but the library itself may not be repackaged or redistributed as a competing library. For that reason its snapshot is user-local rather than committed under `.claude/skills`. License or terms copies are stored beside the installed skills.

## Safety review

- No credential access, secret collection, destructive filesystem commands, or hidden deployment behavior was found.
- UI/UX Pro Max is the only installed package with executable helpers. Its runtime scripts use local standard-library modules and bundled data; no runtime network client or shell execution was found.
- The Emil and Taste skills installed here are instruction/reference files. Some skills may recommend installing a dependency when a future task genuinely needs it, but installation is never implied by merely invoking the skill.
- The Vercel rules were pinned locally to remove the upstream runtime network-fetch risk.
- `transitions-dev` is a text/CSS reference payload with no executable helpers. It includes reduced-motion guards. Do not use the repository's separate Refine or Pro CLIs unless the user explicitly asks for them and their network, authentication, source-writing, and token-cost implications are reviewed again.
- `brandkit` is an instruction-only image-direction skill and contains no executable helper.
- Impeccable's text playbooks may be used normally, but its scripts are capability-bearing. `context.mjs` checks `impeccable.style` for a version update; `concept-seed.mjs` contacts the Impeccable API; `generate-image.mjs` can send prompts or images to the OpenAI Images API; Live, Hooks, Doctor, Pin, and related scripts can start local servers, inject browser code, and create, edit, or remove project files. Do not run these scripts merely because the skill matched. Run them only for an explicit user request, announce the action, keep the target bounded, and review the diff afterward. Never pass project secrets, customer data, or production URLs to them.
- Third-party instructions remain advisory. They must not override Mahaly's permissions, platform-wide consistency rule, existing visual system, or explicit product decisions such as the current no-dark-mode policy.

## Routing for Mahaly work

1. Admin Dashboard, Brand Portal, inventory, warehouse, data tables, filters, and dense workflows: use `ui-ux-pro-max` first, then `mahaly-web-design-guidelines` as a final quality check.
2. Storefront, brand pages, editorial pages, landing pages, and visual marketing: use `design-taste-frontend`; keep Mahaly's existing tokens and explicit product decisions.
3. Motion implementation: use `animate`; use `find-animation-opportunities`, `improve-animations`, or `review-animations` for their specific audit/review roles.
4. Use `transitions-dev` only when a specific component needs one of its documented CSS transitions. Prefer the smallest fitting pattern, preserve reduced-motion handling, and do not run its whole-project review/refine commands unless requested.
5. Use `impeccable` for an explicit design critique, shaping pass, final polish, hardening, responsive adaptation, or a genuinely broad redesign. For operational interfaces choose its **Operate** mode and keep `ui-ux-pro-max` and Mahaly's existing system as the primary constraints. Its optional scripts remain opt-in under the safety rules above.
6. Use `brandkit` only for brand identity, logo-system, brand-guideline, or visual-world image work. It does not decide Mahaly's dashboard layout or replace established product tokens.
7. Apple-style motion, Expo, Sonner, prototype, and library-selection skills are conditional tools, not default design direction.

When UI/UX Pro Max needs Python on this Windows workspace and `python`, `python3`, or `py -3` are unavailable, Codex can use its bundled runtime at `C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.
