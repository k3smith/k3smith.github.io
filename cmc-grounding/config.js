// Paste Apps Script web-app URL after deploy (optional shared coverage).
window.GROUNDING_CONFIG = {
  roundId: "cmc_grounding_pilot",
  roundTitle: "CMC grounding pilot",
  atomsUrl: "atoms/cmc_grounding_pilot.json",
  sheetWebAppUrl: "",
  targetRatings: 1,
  // Pass 1 (required): CMC only. Pass 2 (optional): ESCO / O*NET enrichment.
  requiredFrameworks: ["engineering", "advanced_manufacturing"],
  optionalFrameworks: ["esco", "onet"],
  maxItemsPerFramework: 3,
  catalogs: {
    engineering: "catalogs/engineering.json",
    advanced_manufacturing: "catalogs/advanced_manufacturing.json",
    onet: "catalogs/onet.json",
    esco: "catalogs/esco.json",
  },
  defaultOnetSoc: "17-3027.00",
};
