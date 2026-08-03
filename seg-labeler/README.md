# Segmentation / section-model labeler (seg-labeler)

Static clicker for **DocGraph section-model** gold: each unit is a
`header`, `body`, or `skip`, with a **parent header** (`root` or a section
number). Same deployment pattern as
[lo-labeler](https://k3smith.github.io/lo-labeler/) and
[ks-labeler](https://k3smith.github.io/ks-labeler/).

**Public URL (after push):** https://k3smith.github.io/seg-labeler/

## Product model (what you are labeling)

| Role | Parent rule |
|------|-------------|
| **header** | Parent is another header, or `root` |
| **body** | Parent is the section header this text sits under |
| **skip** | Not a graph unit (running header, date line, TOC junk) |

Prefills come from automated suggestions — correct when wrong. Focus effort on
**header nesting** (parent of a header); body→header is usually obvious.

## Assignment model (2 ratings / unit)

1. Rater enters a stable name/initials.
2. Page **reads** current Sheet coverage (JSONP).
3. Offers a **random** unit that (a) has fewer than 2 distinct raters and (b) this
   rater has not already labeled.
4. On save, **appends** a row to the Sheet and draws the next available unit.
5. Backup CSV download if Sheet submit fails.

Shortcuts: `1` header · `2` body · `3` skip · Enter save.

## Contents

| Path | Role |
|------|------|
| `index.html` | UI + rater instructions |
| `app.js` / `styles.css` | Behavior & layout |
| `config.js` | Round id, blocks JSON path, Sheet web-app URL, `targetRatings` |
| `blocks/section_model_v1.json` | Unit bank (excerpts only — no full PDFs) |
| `blocks/pilot_v1.json` | Legacy chunk-type bank (superseded) |
| `apps_script/Code.gs` | Paste into Google Apps Script (**new Sheet**) |

## One-time Google Sheet setup (new sheet for this round)

1. Create a **new** Sheet (do not reuse the old chunk-block sheet); keep a tab named `labels`.
2. **Extensions → Apps Script**, paste `apps_script/Code.gs`, save.
3. Run `ensureHeader` once (approve permissions).
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the web-app URL into `config.js` → `sheetWebAppUrl`.
6. Commit & push; open https://k3smith.github.io/seg-labeler/

`POST` uses `text/plain` (append). `GET ?callback=` returns JSONP coverage.

### Sheet columns

`timestamp, round_id, block_id, rater_id, role, section_number, parent_section_number, page_start, page_end, document_name, document_class, version_label, text_excerpt, notes, client`

## Local preview

```bash
cd seg-labeler
python3 -m http.server 8766
# open http://localhost:8766/
```

## Refreshing the unit bank (from research repo)

From `supship-data-validation`:

```bash
uv run python datasets/export_section_label_blocks.py \
  --preset tier2 \
  --max-pages 8 \
  -o ../k3smith.github.io/seg-labeler/blocks/section_model_v1.json
```

Or convert the legacy pilot bank:

```bash
python3 -c "..."  # see CALIBRATION.md
```

Point `config.js` `blocksUrl` / `roundId` / `roundTitle` at the new file when needed.

## Pulling labels back into DocGraph gold

1. Google Sheet → File → Download → CSV (or rater **Download backup CSV**).
2. In `supship-data-validation`:

```bash
uv run python datasets/merge_section_labels.py path/to/sheet.csv \
  --blocks ../k3smith.github.io/seg-labeler/blocks/section_model_v1.json \
  -o data/gold/tier2_section/section_model_v1.jsonl \
  --conflicts results/section_label_conflicts.json
```

## Publish updates

```bash
# from k3smith.github.io
git add seg-labeler
git commit -m "Retarget seg-labeler to DocGraph section-model gold"
git push
```
