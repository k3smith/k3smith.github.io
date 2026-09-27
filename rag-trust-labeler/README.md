# RAGStudy trust labeler (GitHub Pages)

Blind human labels for Phase 6 judge validation: **correct / faithful / attributed**,
optional citation-verification timer (RQ5). Same Sheets + JSONP coverage pattern as
[lo-labeler](../lo-labeler/).

Public URL (after push): https://k3smith.github.io/rag-trust-labeler/

## Assignment model

1. Rater enters stable initials.
2. Page reads Sheet coverage (JSONP).
3. Offers a random item with fewer than `targetRatings` (default **2**) distinct
   raters that this rater has not already labeled.
4. On save, appends a Sheet row and draws the next item.
5. Gold answers and auto `TrustReport` scores are **never** in the item JSON.

## Contents

| Path | Role |
|------|------|
| `index.html` | UI + codebook |
| `app.js` / `styles.css` | Behavior & layout |
| `config.js` | Round id, items JSON, Sheet URL, `targetRatings` |
| `items/*.json` | Blind packs (no gold / auto scores) |
| `apps_script/Code.gs` | Paste into Google Apps Script |

## One-time Google Sheet setup

1. Create a Sheet; keep a tab named `labels`.
2. **Extensions → Apps Script**, paste `apps_script/Code.gs`, save.
3. Run `ensureHeader` once (approve permissions).
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the web-app URL into `config.js` → `sheetWebAppUrl`.
6. Commit & push this folder.

Until step 5, the page still works: labels stay in `localStorage` + **Download backup CSV**.

## Export / merge (RAGStudy repo)

```bash
# After a pilot generation run (or stub JSONL):
python -m ragstudy.scripts.human_eval_io export-pack \
  path/to/generations.jsonl \
  --config configs/human_eval/pilot.yaml \
  --out-items ../k3smith.github.io/rag-trust-labeler/items/pilot_v1.json \
  --out-sidecar data/human_eval/pilot_v1_sidecar.jsonl

# After Sheet → Download CSV (or rater backup CSV):
python -m ragstudy.scripts.human_eval_io merge-sheet path/to/sheet.csv \
  --sidecar data/human_eval/pilot_v1_sidecar.jsonl \
  -o data/human_eval/pilot_v1_merged.jsonl
```

Point `config.js` `itemsUrl` / `roundId` / `roundTitle` at the new pack when ready.

## Author as rater?

Yes, if blinded (no gold / auto scores on first pass) and at least one independent
second rater covers the double-label subset. See RAGStudy
`docs/phase6/human_eval.md`.
