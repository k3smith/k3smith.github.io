/**
 * Google Apps Script for DocGraph span section labeling (section_model_v2).
 *
 * Setup (NEW Sheet — do not reuse v1):
 * 1. Create Sheet with tab "labels".
 * 2. Paste this file → Run ensureHeader → Deploy web app (Anyone).
 * 3. Paste URL into seg-labeler/config.js → sheetWebAppUrl.
 *
 * GET  ?callback=fn&round_id=section_model_v2 → coverage JSONP
 * POST text/plain JSON → append row (includes marks_json)
 */

var SHEET_NAME = "labels";
var TARGET_RATINGS = 2;

var HEADER = [
  "timestamp",
  "round_id",
  "block_id",
  "rater_id",
  "role",
  "section_number",
  "parent_section_number",
  "marks_json",
  "page_start",
  "page_end",
  "document_name",
  "document_class",
  "version_label",
  "text_excerpt",
  "notes",
  "client",
];

function ensureHeader() {
  var sh = _sheet();
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADER);
  }
}

function doGet(e) {
  var roundId = (e && e.parameter && e.parameter.round_id) || "";
  var data = getCoverage(roundId);
  var body = JSON.stringify(data);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + body + ")").setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(body).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    var data = JSON.parse(raw);
    var sh = _sheet();
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADER);
    }
    sh.appendRow([
      new Date().toISOString(),
      data.round_id || "",
      data.block_id || "",
      data.rater_id || "",
      data.role || "",
      data.section_number || "",
      data.parent_section_number || "",
      data.marks_json || "",
      data.page_start || "",
      data.page_end || "",
      data.document_name || "",
      data.document_class || "",
      data.version_label || "",
      data.text_excerpt || "",
      data.notes || "",
      data.client || "",
    ]);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function getCoverage(roundId) {
  var sh = _sheet();
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last, HEADER.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rowRound = String(row[1] || "").trim();
      if (roundId && rowRound && rowRound !== roundId) continue;
      var blockId = String(row[2] || "").trim();
      var raterId = String(row[3] || "").trim();
      var role = String(row[4] || "").trim().toLowerCase();
      var marksJson = String(row[7] || "").trim();
      if (!blockId || !raterId) continue;
      // Accept span labels (marks_json) or legacy role-only rows
      if (!role && !marksJson) continue;
      map[blockId + "\t" + raterId] = {
        block_id: blockId,
        rater_id: raterId,
        role: role || "marked",
      };
    }
  }
  var labels = [];
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      labels.push(map[k]);
    }
  }
  return { ok: true, target: TARGET_RATINGS, labels: labels, round_id: roundId };
}

function _sheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
