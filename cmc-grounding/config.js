// Paste Apps Script web-app URL after deploy (optional shared coverage).
window.GROUNDING_CONFIG = {
  roundId: "cmc_grounding_pilot",
  roundTitle: "CMC grounding pilot",
  atomsUrl: "atoms/cmc_grounding_pilot.json",
  sheetWebAppUrl: "https://script.google.com/macros/s/AKfycbyfayNHBzoLPTgEjPvUGuTllzf-7apIT_kiNmLStXju6gkifsdYJmsdHceraX3sX3LM/exec",
  targetRatings: 1,
  requiredFrameworks: ["engineering", "advanced_manufacturing"],
  maxItemsPerFramework: 3,
  catalogs: {
    engineering: "catalogs/engineering.json",
    advanced_manufacturing: "catalogs/advanced_manufacturing.json",
    onet: "catalogs/onet.json",
    esco: "catalogs/esco.json",
  },
  defaultOnetSoc: "17-3027.00",
};
