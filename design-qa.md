# Stock requests redesign — design QA

- Source visual truth: `C:\Users\pc\.codex\generated_images\01a0032c-1c17-7022-b30e-2582ba8cb71c\exec-c5f61ebe-b48c-47c7-9233-343be7702364.png`
- Rendered implementation: `C:\Users\pc\.codex\visualizations\2026\08\15\01a0032c-1c17-7022-b30e-2582ba8cb71c\stock-requests-redesign-implementation.png`
- Latest refinement verification: `C:\Users\pc\.codex\visualizations\2026\08\15\01a0032c-1c17-7022-b30e-2582ba8cb71c\stock-requests-redesign-latest.png`
- Combined comparison: `C:\Users\pc\.codex\visualizations\2026\08\15\01a0032c-1c17-7022-b30e-2582ba8cb71c\stock-requests-redesign-comparison.png`
- Browser/CSS viewport: 1440 × 1024, desktop, device scale factor 1
- Source pixels: 1486 × 1058
- Implementation capture: 1425 × 1025 (browser screenshot excludes the vertical scrollbar width)
- Comparison normalization: both captures scaled to 1440 px wide; source became 1440 × 1025 and implementation became 1440 × 1036.
- State: authenticated Admin, `/admin/warehouse`, all statuses, all brands, no date range, empty search.

## Full-view comparison evidence

The combined comparison shows the same compact hierarchy as the selected mockup: workspace navigation, a compact document count, a toolbar attached to the queue, four essential filters, one merged Status column, permanent Created/Updated timestamps, colored state rails, dense rows, and no per-row Resolve action. The latest refinement removes the duplicate unresolved title counter, displays a non-zero count inside Needs review, and makes the document number the primary row label with the brand name beneath it.

The implementation intentionally retains the product's existing Admin workspace tab treatment and the live database's true document statuses. These are product-system constraints rather than design drift.

## Focused region comparison evidence

A separate crop was not required because the toolbar and all six queue rows remain legible at the normalized 1440 px comparison size. The browser DOM was also inspected to confirm exact labels, Created/Updated dates, row links, pressed filter state, and accessible control names.

## Required fidelity surfaces

- Fonts and typography: existing Admin font stack and weights retained; title, counters, column labels, status labels, and dates match the selected compact hierarchy.
- Spacing and layout rhythm: queue begins immediately after the compact title; toolbar is attached to the table; row density and column alignment match the target without large summary cards.
- Colors and visual tokens: existing warm Admin surfaces and `#C85956` accent retained. Status rails and text use semantic red, amber, green, blue, violet, and neutral tones.
- Image quality and asset fidelity: real brand logos continue through `BrandMark`; Lucide icons are used for search, calendar, statuses, and row affordances. No placeholder or handcrafted icon assets were introduced.
- Copy and content: search, status filters, brand filter, document/brand identity, requested variants/units, merged status/issues, and Created/Updated timestamps match the approved requirements.

## Interaction verification

- Search by `STN-000008` returns exactly one document.
- Needs review returns the two unresolved documents.
- Brand selection narrows the queue correctly.
- The compact calendar opens the shared Brand Portal date-range dialog.
- Row links remain the single document-opening action.
- Browser console: no warnings or errors.

## Comparison history

### Pass 1

- P2: unresolved documents were mixed into strict newest-first order, so one problem document appeared below completed documents.
- Fix: default queue sorting now prioritizes unresolved documents, then preserves newest-first ordering within each group.

### Pass 2

- Post-fix evidence: the combined comparison shows both unresolved rows first, followed by received rows, matching the target's operational hierarchy.
- No remaining P0, P1, or P2 findings.

## Follow-up polish

- P3: the implementation keeps the existing Admin tab selection block instead of the mockup's thin underline so Inventory pages remain visually consistent.
- P3: real database timestamps and states differ from illustrative mockup values by design.

final result: passed

---

# Variant movements compact filter bar — design QA

## Evidence and normalization

- Source visual truth: `C:\Users\pc\AppData\Local\Temp\codex-clipboard-3fc42152-937e-4440-97f1-cd252e4ae4e1.png`
- Supporting light-color direction: `C:\Users\pc\AppData\Local\Temp\codex-clipboard-aa9be7e1-6ae4-40d4-af5d-d899a64ec85a.png`
- Browser-rendered implementation: `C:\Users\pc\AppData\Local\Temp\mahaly-design-qa\variant-movements-1170x900.png`
- Focused side-by-side comparison: `C:\Users\pc\AppData\Local\Temp\mahaly-design-qa\variant-movements-filter-comparison.png`
- Source pixels: 1005 × 95; source density is not encoded, so the native crop was treated as the visual truth.
- Implementation viewport and pixels: 1170 × 900 CSS px at device scale factor 1.
- Compared implementation region: 1015 × 62 px, matching the reference content width and default closed-filter state.
- Route/state: authenticated Admin, `/admin/inventory?view=activity`, collapsed sidebar, All movements, All brands, no date range, empty search.

## Full-view comparison evidence

The implementation begins directly with the compact filter bar; the previous page title and description no longer consume the first viewport. The full 1170 × 900 capture confirms the bar stays on one line at the reference content width, the movement ledger begins immediately below it, and no dark filled controls or active navigation circles remain. The table retains the existing Mahaly density and real inventory data because the source image specifies only the toolbar.

## Focused comparison evidence

The combined comparison shows the same sequence and rhythm as the reference: restrained search field, square calendar control, attached segmented choices, compact brand select, and a single light surface. The implementation intentionally substitutes movement-relevant segments (`All`, `Receipts`, `Orders`, `Corrections`) and adds a small advanced-filter control plus `Apply`, preserving the existing server-backed product, Variant, source, movement, and brand filters.

## Required fidelity surfaces

- Fonts and typography: the existing Admin font stack and compact 10.5–12 px control hierarchy match the reference; no display heading remains above the toolbar.
- Spacing and layout rhythm: control height is 40 px, the outer frame is 62 px, gaps are 8 px, and the bar remains single-line at the target width while wrapping cleanly on narrow screens.
- Colors and visual tokens: white, warm off-white, taupe borders, and the pale Mahaly rose selection state replace dark fills. Dark color is limited to readable foreground text.
- Image quality and asset fidelity: the reference contains no raster assets. Calendar, search, and filter controls use the project's existing Lucide icon set; no placeholder or handcrafted icon was introduced.
- Copy and content: labels differ only where the inventory-movement workflow requires different filters from Stock requests.

## Interaction verification

- Calendar opens a focused From/To date-range panel and exposes both date inputs.
- Receipts navigates to `movement=receipt_posted`; All returns to the unfiltered ledger.
- Advanced filters expose Source and Movement selectors.
- Search, Brand, Apply, Movements/Documents, and CSV export remain available.
- Desktop and narrow layouts were visually inspected.
- Browser console: no errors.

## Comparison history

### Pass 1

- No P0, P1, or P2 mismatch was found after normalization.
- Intentional differences are limited to movement-specific filter names and the two controls required to preserve the complete live filtering workflow.

## Follow-up polish

- P3: the implementation keeps a visible light `Apply` button because Brand and advanced filters are server-submitted; removing it would make those controls appear interactive without applying their values.

final result: passed

---

# Warehouse acceptance and private actor history — design QA

## Evidence

- Previous document state: `design-qa-artifacts/warehouse-corrections-compact-button-collapsed.png`
- Current document state: `design-qa-artifacts/warehouse-acceptance-history-privacy.png`
- Routes checked: `/admin/warehouse` and `/admin/warehouse/88f37b84-fd10-45be-83c4-906c598bfd59`

## Checks performed

- Confirmed the new queue filter presents `Requested` and `Awaiting arrival` as distinct compact states.
- Confirmed the brand select keeps the existing neutral border without the blue focus ring.
- Confirmed the document page remains visually unchanged above Document history, preserving the selected compact correction design.
- Confirmed Document history now shows `Requested by @Salsabil Ahmed`, masks administrative actors as `Zakhnook Staff Team`, and exposes identity affordances only in the full Admin surface.
- Confirmed correction history is reduced to one linked CRN event per correction, with no repeated correction payload or generic `Update` entry.
- Confirmed the current production-backed local preview still renders before the new migration is applied.
- Confirmed no horizontal overflow or broken control wrapping in the queue and document view.

## Findings and resolution

1. The native brand select had a prominent blue focus ring. Its focus styling now preserves only the existing neutral border.
2. `Requested` previously grouped all open workflow states, obscuring the new acceptance stage. It is now split from `Awaiting arrival` in both Admin and Brand Portal.
3. Audit entries previously exposed email addresses and repeated large correction descriptions. The new compact actor/CRN presentation removes that repetition while retaining full-Admin traceability.

final result: passed

---

# Warehouse correction history — design QA

## Evidence

- Source reference: `C:\Users\pc\AppData\Local\Temp\codex-clipboard-be32f4a7-62f1-4b54-b6f9-be5e042e77f3.png`
- Desktop implementation: `design-qa-artifacts/warehouse-corrections-expanded.png`
- Collapsed implementation: `design-qa-artifacts/warehouse-corrections-collapsed.png`
- Mobile implementation: `design-qa-artifacts/warehouse-corrections-mobile.png`
- Side-by-side comparison: `design-qa-artifacts/warehouse-corrections-comparison.png`

## Environment and state

- Route: `/admin/warehouse/88f37b84-fd10-45be-83c4-906c598bfd59`
- Record: `STN-000010`, received and corrected
- Desktop viewport: the Codex in-app browser default (1279 px wide screenshot)
- Responsive check: 390 × 844 px
- Compared states: old expanded correction-document cards; new collapsed Variant summaries; new expanded inline Variant timeline

## Checks performed

- Confirmed every persisted correction is grouped beneath its affected Variant.
- Expanded `Corrected · 1 change` and verified the CRN number, status, timestamp, stock impact, explanation, and verification note.
- Confirmed the large standalone `Correction documents` section no longer renders.
- Confirmed Document history still contains the document-level audit and actor identity.
- Confirmed the Brand Portal renders the same correction history read-only, without Admin correction controls.
- Confirmed the layout remains readable at 390 px and the primary document-line controls wrap without horizontal overflow.
- Confirmed no browser console errors during Admin and Brand Portal checks.

## Findings and resolution history

1. The old layout repeated the CRN card, correction type, quantity, Variant identity, and note in large nested panels. It also separated the correction from the Variant it affected.
2. The replacement uses one compact disclosure per affected Variant. The closed state adds only one slim row; the open state shows a chronological mini-timeline with no repeated product card.
3. Document-wide actions and actor identity remain in Document history, preventing the inline Variant view from duplicating audit information.
4. Pending approval and reversal controls remain available only once per correction in the Admin view; the shared Brand Portal view stays read-only.

## Final result

**Passed.** The new hierarchy is materially shorter, preserves operational and audit information, matches the existing warehouse visual language, and works in both Admin and Brand Portal across desktop and mobile.

### Compact correction-button refinement

- Before: the closed correction disclosure occupied the full 937 px Variant row width.
- After: `Corrected · 2 changes · 2 CRNs` is a 191 × 32 px content-sized button (20.3% of the Variant row width).
- Opening the button still reveals the full 897 px correction timeline beneath it.
- The disclosure opens and closes correctly, retains its focus state, and produced no browser console errors.
- Collapsed implementation: `design-qa-artifacts/warehouse-corrections-compact-button-collapsed.png`
- Expanded implementation: `design-qa-artifacts/warehouse-corrections-compact-button.png`
- Before/after comparison: `design-qa-artifacts/warehouse-corrections-compact-button-comparison.png`

final result: passed
