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
