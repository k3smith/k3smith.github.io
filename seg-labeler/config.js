// Paste your Apps Script web-app URL after deploy (required for shared double-coverage).
// Until then, labels stay in localStorage + Download backup CSV.
window.LABELER_CONFIG = {
  roundId: "pilot_chunk_blocks_v1",
  roundTitle: "Pilot - chunk block labeling",
  blocksUrl: "blocks/pilot_v1.json",
  sheetWebAppUrl: "https://script.google.com/macros/s/AKfycbxfKWR0n3UNa0Q3yrTk8Mm5LaOVvEUsG4-zwuED-cmyQ4k_Y70iXr4RqQm7rOA_AfY/exec",
  /** Each block stops being offered once this many distinct raters have labeled it. */
  targetRatings: 2,
};
