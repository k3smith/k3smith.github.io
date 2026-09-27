// Paste Apps Script web-app URL after deploy (required for shared double-coverage).
window.LABELER_CONFIG = {
  roundId: "ragstudy_trust_pilot_v1",
  roundTitle: "RAGStudy · trust pilot",
  itemsUrl: "items/pilot_demo.json",
  sheetWebAppUrl: "https://script.google.com/macros/s/AKfycbw1JTW6JzoDnMbdY57Hky1AA71_iUAQ7E8WF24D82SoDDARQZjy4G3EBQzd04pnBjXw/exec",
  /** Each item stops being offered once this many distinct raters have labeled it. */
  targetRatings: 2,
};
