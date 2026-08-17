**Comparison target**

- Source visual truth: `C:\Users\pc\AppData\Local\Temp\codex-clipboard-b87a4c3f-54f2-42dd-8bd6-c3e7ceb77bc8.png`.
- Implementation screenshot: `C:\Users\pc\.codex\visualizations\2026\08\15\01a0032c-1c17-7022-b30e-2582ba8cb71c\warehouse-document-lines-totals-in-header.png`.
- Route: `http://localhost:3000/admin/warehouse/e9f8da15-efc1-48b8-9106-850494e2f2bb`.
- State: authenticated admin, open `STN-000008`, 6 Variants, 31 requested units, 0 accepted units.
- Source pixels: 1557 x 160. Implementation pixels: browser full-page capture at device scale 1.

**Findings**

- No remaining P0, P1, or P2 issue was visible in the updated Document lines header.
- The four-card facts strip was removed from Document history, leaving only the chronological activity.
- `6 variants · 31 units` and `0 accepted so far` now appear at the upper-right of Document lines.
- Ledger is absent in the open request state and remains present in received, partially received, and rejected final states.

**Required fidelity surfaces**

- Fonts and typography: existing admin type family and weights retained; the summary uses compact 11px/9.5px hierarchy.
- Spacing and layout rhythm: summary aligns to the right edge of the Document lines header and wraps below the title on narrow widths.
- Colors and visual tokens: existing warm neutral and coral admin tokens are unchanged.
- Image quality and assets: real Variant images remain unchanged; no new raster or generated assets were required.
- Copy and content: the exact Variant/unit and accepted totals are preserved, while the unwanted fact labels are removed.

**Interaction evidence**

- Open document DOM: one Document lines workspace, 6/31 totals in its header, no Ledger links, direct quantity inputs, and `Review receipt · 0 variants` disabled until a line is edited.
- Received document DOM: totals remain in Document lines, the history fact strip stays absent, and Ledger links are visible.
- TypeScript, targeted ESLint, 22 warehouse/inventory tests, and `git diff --check` passed.
- The full suite reached 966 passing tests before one external Supabase Auth request returned a transient 502; the affected 8-test file passed completely on immediate retry.

**Comparison limitation**

- Source and implementation were each opened and inspected, but the in-app browser previously rejected the local combined comparison canvas under its security policy. No alternate-browser or security-policy workaround was used.

**Implementation checklist**

- [x] Remove the document fact strip from Document history.
- [x] Move Variant/unit and accepted totals into Document lines.
- [x] Hide Ledger before a final receipt decision.
- [x] Keep Ledger available for received, partially received, and rejected documents.
- [x] Verify both open and completed document states.

final result: blocked
