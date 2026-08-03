# Section-model labeling checklist (`section_model_v1`)

## Done in repo

- [x] Labeler UI retargeted to header / body / skip + parent header
- [x] Unit bank `blocks/section_model_v1.json` (converted from pilot excerpts)
- [x] Apps Script template `apps_script/Code.gs` (new column schema)
- [x] `config.js` points at `section_model_v1` with **empty** `sheetWebAppUrl`

## Your steps to go live

1. **Create a new Google Sheet** (fresh tab `labels`) → paste `apps_script/Code.gs` → run `ensureHeader` → deploy web app (Anyone) → put URL in `config.js` → `sheetWebAppUrl`.
2. **Push** `k3smith.github.io` so https://k3smith.github.io/seg-labeler/ updates.
3. **Self-calibrate** (~15–20 units): confirm header vs body, fix parent on nested headers. Local-only mode works before the Sheet URL is set (backup CSV).
4. **Recruit raters** (same as lo/ks): aim for 2 ratings/unit.
5. Export Sheet CSV → merge in `supship-data-validation`:

```bash
uv run python datasets/merge_section_labels.py sheet.csv \
  --blocks ../k3smith.github.io/seg-labeler/blocks/section_model_v1.json \
  -o data/gold/tier2_section/section_model_v1.jsonl \
  --conflicts results/section_label_conflicts.json \
  --min-raters 2
```

## What to prioritize while labeling

- Header **parent** corrections (the DocGraph heading↔heading gap).
- False headers (running titles, dates) → `skip`.
- Body under the wrong section → fix parent.

Do not spend time on fine-grained chunk types (requirement vs note); that was the old task.
