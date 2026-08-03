// Paste your Apps Script web-app URL after deploy (required for shared double-coverage).
// Until then, labels stay in localStorage + Download backup CSV.
// Use a NEW Google Sheet for the section-model round (do not reuse the old chunk sheet).
window.LABELER_CONFIG = {
  roundId: "section_model_v1",
  roundTitle: "DocGraph — section model (header / body / parent)",
  blocksUrl: "blocks/section_model_v1.json",
  sheetWebAppUrl: "https://script.google.com/macros/s/AKfycbwWa6c06ROb1B8mhgaJuXYKxgwNLOchGxhs84m7e2Qenv3kYElF01MlLb-oGgR1p8LM/exec",
  /** Each unit stops being offered once this many distinct raters have labeled it. */
  targetRatings: 2,
};
