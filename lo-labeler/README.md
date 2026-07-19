# Learning-objective pair labeler (GitHub Pages)

Static clicker for Same / Partially overlapping / Different judgments.
Designed for university colleagues who are **not** instructional designers.

## Assignment model (5 raters × 2 ratings / pair)

1. Rater enters a stable name/initials.
2. Page **reads** current Sheet coverage (JSONP).
3. Offers a **random** pair that (a) has fewer than 2 distinct raters and (b) this
   rater has not already labeled.
4. On judgment, **appends** a row to the Sheet and draws the next available pair.
5. Stops for that person when nothing is left for them (~80 labels each if load is
   balanced: 200 × 2 / 5).

Two people can briefly open the same pair before either saves (race); a third rating
is rare and harmless — merge keeps latest per `(pair_id, rater_id)`.

## Contents

| Path | Role |
|------|------|
| `index.html` | UI + rater instructions |
| `app.js` / `styles.css` | Behavior & layout |
| `config.js` | Round id, pairs JSON path, Sheet web-app URL, `targetRatings` |
| `pairs/*.json` | Pair sets (no similarity scores — avoids bias) |
| `apps_script/Code.gs` | Paste into Google Apps Script |

## One-time Google Sheet setup

1. Create a Sheet; keep a tab named `labels`.
2. **Extensions → Apps Script**, paste `apps_script/Code.gs`, save.
3. Run `ensureHeader` once (approve permissions).
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the web-app URL into `config.js` → `sheetWebAppUrl`.
6. Commit & push; open https://k3smith.github.io/lo-labeler/

`POST` uses `text/plain` (append). `GET ?callback=` returns JSONP coverage.

## Public URL (after push)

https://k3smith.github.io/lo-labeler/

This site already uses GitHub Pages from `main` at the repo root.

## Refreshing / new rounds (from LearningObjectives research repo)

```bash
uv run python -m src.eval.labeler_io export-pairs \
  data/calibration/pairs_to_label_fw_qwen_fullgold_n200.csv \
  -o ../k3smith.github.io/lo-labeler/pairs/calibration_fw_qwen_fullgold_n200.json
```

Point `config.js` `pairsUrl` / `roundId` / `roundTitle` at the new file for validated-LO runs later.

## Pulling labels back for τ calibration

1. Google Sheet → File → Download → CSV.
2. In the research repo:

```bash
uv run python -m src.eval.labeler_io merge-sheet path/to/sheet.csv \
  --pairs data/calibration/pairs_to_label_fw_qwen_fullgold_n200.csv \
  -o data/calibration/labeled_fw_qwen_fullgold.csv

uv run python -m src.match.bipartite calibrate \
  data/calibration/labeled_fw_qwen_fullgold.csv
```

Raters can also use **Download backup CSV** if Sheet submit fails.
