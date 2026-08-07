# Google Sheet backend for SME review

1. Create a Google Sheet.
2. **Extensions → Apps Script** → paste [`Code.gs`](Code.gs) → Save.
3. Run **`ensureHeader`** once; approve permissions.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Paste the web-app URL into:
   - `eval/sme/web/config.js` → `sheetWebAppUrl`
   - Published site: `k3smith.github.io/sme-review/config.js`
6. `make publish-sme` and push Pages.

The UI posts each title/concept decision to the Sheet (and keeps a local
backup). Use **Download decisions** JSON for `cf apply-sme-review`, or export
the Sheet tabs as CSV for archival.
