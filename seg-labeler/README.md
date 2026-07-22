# Segmentation block labeler (seg-labeler)

Static clicker for labeling PDF text blocks with `blockType`, section number/path,
and hierarchy constraints (`mustNotSplitWith`). Same deployment pattern as
[lo-labeler](https://k3smith.github.io/lo-labeler/) and
[ks-labeler](https://k3smith.github.io/ks-labeler/).

**Public URL (after push):** https://k3smith.github.io/seg-labeler/

## Assignment model (2 ratings / block)

1. Rater enters a stable name/initials.
2. Page **reads** current Sheet coverage (JSONP).
3. Offers a **random** block that (a) has fewer than 2 distinct raters and (b) this
   rater has not already labeled.
4. On save, **appends** a row to the Sheet and draws the next available block.
5. Backup CSV download if Sheet submit fails.

## Contents

| Path | Role |
|------|------|
| `index.html` | UI + rater instructions |
| `app.js` / `styles.css` | Behavior & layout |
| `config.js` | Round id, blocks JSON path, Sheet web-app URL, `targetRatings` |
| `blocks/*.json` | Block banks (pilot excerpts only — no full PDFs) |
| `apps_script/Code.gs` | Paste into Google Apps Script |

## One-time Google Sheet setup

1. Create a Sheet; keep a tab named `labels`.
2. **Extensions ? Apps Script**, paste `apps_script/Code.gs`, save.
3. Run `ensureHeader` once (approve permissions).
4. **Deploy ? New deployment ? Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the web-app URL into `config.js` ? `sheetWebAppUrl`.
6. Commit & push; open https://k3smith.github.io/seg-labeler/

`POST` uses `text/plain` (append). `GET ?callback=` returns JSONP coverage.

## Local preview

```bash
cd seg-labeler
python3 -m http.server 8766
# open http://localhost:8766/
```

## Refreshing the block bank (from research repo)

From `supship-pi-research`:

```bash
python3 eval/chunking/scripts/export_blocks.py \
  --corpus "/path/to/supship-data-validation/Reference Documents" \
  -o ../k3smith.github.io/seg-labeler/blocks/pilot_v1.json
```

Point `config.js` `blocksUrl` / `roundId` / `roundTitle` at the new file when needed.

## Pulling labels back into chunking gold

1. Google Sheet ? File ? Download ? CSV (or rater **Download backup CSV**).
2. In `supship-pi-research`:

```bash
python3 eval/chunking/scripts/merge_sheet.py path/to/sheet.csv \
  --blocks ../k3smith.github.io/seg-labeler/blocks/pilot_v1.json \
  --seed eval/chunking/v1.jsonl \
  -o eval/chunking/v1.jsonl \
  --conflicts eval/chunking/conflicts_pilot_v1.json
```

## Publish updates

This site uses GitHub Pages from `main` at the repo root. After editing:

```bash
# from k3smith.github.io
git add seg-labeler
git commit -m "Add / update seg-labeler for chunking gold"
git push
```
