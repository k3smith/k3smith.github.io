# Pilot calibration checklist (`pilot_chunk_blocks_v1`)

## Done in repo

- [x] Labeler UI at `k3smith.github.io/seg-labeler/`
- [x] Block bank `blocks/pilot_v1.json` (120 blocks, 30 per excerpt)
- [x] Apps Script template `apps_script/Code.gs`
- [x] Export / merge scripts in `supship-pi-research/eval/chunking/scripts/`
- [x] Merge pipeline smoke-tested via `eval/chunking/fixtures/`

## Your steps to go live

1. **Create Google Sheet** ? paste `apps_script/Code.gs` ? deploy web app (Anyone) ? put URL in `config.js` ? `sheetWebAppUrl`.
2. **Push** `k3smith.github.io` so https://k3smith.github.io/seg-labeler/ is public.
3. **Self-calibrate** (~10-15 blocks): confirm suggestions, adjust instructions if needed. Local-only mode works before the Sheet URL is set (backup CSV).
4. **Recruit raters** (same as lo/ks): aim for 2 ratings/block. After enough coverage:

```bash
python3 eval/chunking/scripts/merge_sheet.py sheet.csv \
  --blocks ../../k3smith.github.io/seg-labeler/blocks/pilot_v1.json \
  --seed eval/chunking/v1.jsonl \
  -o eval/chunking/v1.jsonl \
  --conflicts eval/chunking/conflicts_pilot_v1.json \
  --min-raters 2
```

5. Stop when gold has **?30** non-skip rows across the four pilot docs (A1e).
