# Seg-labeler calibration — `section_model_v2` (span model)

## Fresh start

1. Re-exported bank: `blocks/section_model_v2.json` (NSI + 8010 + TUM; **OSHA quarantined**).
2. Create a **new** Google Sheet (do not reuse v1).
3. Paste `apps_script/Code.gs` → `ensureHeader` → Deploy web app → paste URL into `config.js`.
4. Hard-refresh https://k3smith.github.io/seg-labeler/

## How to label

1. Select text in the unit.
2. **H** = header (short title), **B** = body (parent = last header), **S** = skip.
3. Edit section id / parent on each mark if needed.
4. Long numbered units: mark title as header, prose as body → body parent = that section id.
5. REFERENCES: `(b) OPNAVINST 3120.32` = header; after-dash text = body under `(b)`.

## Extractor

`supship-data-validation/datasets/export_section_span_blocks.py`
- Column-aware left-then-right for two-col pages
- Chrome filter (VerDate / SGML / DSK)
- Suggested header+body spans for citations and `N.N.N Title. Prose`

See `04-changeset-span-section-model.md`.
