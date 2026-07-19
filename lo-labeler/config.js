// Paste your Apps Script web-app URL after deploy (required for shared double-coverage).
window.LABELER_CONFIG = {
  roundId: "calibration_fw_qwen_fullgold_n200",
  roundTitle: "Calibration · academic gold",
  pairsUrl: "pairs/calibration_fw_qwen_fullgold_n200.json",
  sheetWebAppUrl: "https://script.google.com/macros/s/AKfycbyuXSU3BuRfZgjSDd475NwhVWzixqXb4-86TZVvqOJs1QnOuDSYZtMASs74sXCbJ1Ef/exec",
  /** Each pair stops being offered once this many distinct raters have labeled it. */
  targetRatings: 2,
};
