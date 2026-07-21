// Paste your Apps Script web-app URL after deploy (required for shared coverage).
// Until then, labels stay in localStorage + Download backup CSV.
window.LABELER_CONFIG = {
  roundId: "pilot_mixed_skillspan_met_n100",
  roundTitle: "Pilot · SkillSpan + MET",
  sentencesUrl: "sentences/pilot_mixed_skillspan_met_n100.json",
  sheetWebAppUrl: "https://script.google.com/macros/s/AKfycbyxVsQQz9nxTFkYXU-NcIVtESU1ySv08LsB6_WFy1gblZQIOadxOecbaXip8HmSPjj9/exec",
  /** Each sentence stops being offered once this many distinct raters have labeled it. */
  targetRatings: 2,
  /**
   * After save on SkillSpan items, show overlap vs SkillSpan expert gold.
   * Keep false for pilot labeling — gold is inconsistent; do not train raters to it.
   * Offline compare is fine for RQ0 / denoise analysis.
   */
  showGoldFeedback: false,
};
