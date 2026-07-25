/**
 * Google Apps Script web app for the CMC grounding labeler.
 *
 * Setup:
 * 1. Create a Google Sheet with a tab named "grounding".
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run ensureHeader once; approve permissions.
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Paste the web-app URL into eval/grounding/web/config.js → sheetWebAppUrl
 *
 * Endpoints:
 * - GET  ?callback=fn → JSONP coverage { target, labels:[{atom_id,rater_id}] }
 * - POST text/plain JSON → append one grounding row
 */

var SHEET_NAME = "grounding";
var TARGET_RATINGS = 1;

var HEADER = [
  "timestamp",
  "round_id",
  "atom_id",
  "atom_type",
  "atom_text",
  "source_competency_id",
  "source_competency_title",
  "eng_match",
  "eng_tier",
  "eng_competency_name",
  "eng_block_url",
  "eng_notes",
  "am_match",
  "am_tier",
  "am_competency_name",
  "am_block_url",
  "am_notes",
  "esco_uri",
  "esco_preferred_label",
  "esco_broader_label",
  "esco_match",
  "onet_soc_code",
  "onet_occupation_title",
  "onet_element_name",
  "onet_url",
  "onet_match",
  "rater_id",
  "date",
  "confidence_1to3",
  "notes",
  "frameworks_json",
  "client",
];

function ensureHeader() {
  var sh = _sheet();
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADER);
  }
}

function doGet(e) {
  var data = getCoverage();
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
      data.timestamp || new Date().toISOString(),
      data.round_id || "",
      data.atom_id || "",
      data.atom_type || "",
      data.atom_text || "",
      data.source_competency_id || "",
      data.source_competency_title || "",
      data.eng_match || "",
      data.eng_tier || "",
      data.eng_competency_name || "",
      data.eng_block_url || "",
      data.eng_notes || "",
      data.am_match || "",
      data.am_tier || "",
      data.am_competency_name || "",
      data.am_block_url || "",
      data.am_notes || "",
      data.esco_uri || "",
      data.esco_preferred_label || "",
      data.esco_broader_label || "",
      data.esco_match || "",
      data.onet_soc_code || "",
      data.onet_occupation_title || "",
      data.onet_element_name || "",
      data.onet_url || "",
      data.onet_match || "",
      data.rater_id || "",
      data.date || "",
      data.confidence_1to3 || "",
      data.notes || "",
      data.frameworks_json || "",
      data.client || "",
    ]);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function getCoverage() {
  var sh = _sheet();
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last, HEADER.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var atomId = String(row[2] || "").trim();
      var raterId = String(row[26] || "").trim();
      if (!atomId || !raterId) continue;
      map[atomId + "\t" + raterId] = {
        atom_id: atomId,
        rater_id: raterId,
      };
    }
  }
  var labels = [];
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      labels.push(map[k]);
    }
  }
  return {
    ok: true,
    target: TARGET_RATINGS,
    labels: labels,
  };
}

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  return sh;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
