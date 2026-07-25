// Paste Apps Script web-app URL after deploy (optional shared coverage).
window.GROUNDING_CONFIG = {
  roundId: "cmc_grounding_pilot",
  roundTitle: "CMC grounding pilot",
  atomsUrl: "atoms/cmc_grounding_pilot.json",
  sheetWebAppUrl: "",
  /** Atom stops being offered once this many distinct raters finished it. */
  targetRatings: 1,
  /** Frameworks that must have a match before Save. */
  requiredFrameworks: ["engineering", "advanced_manufacturing"],
};
