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
  "eng_items_json",
  "am_match",
  "am_tier",
  "am_competency_name",
  "am_block_url",
  "am_notes",
  "am_items_json",
  "esco_match",
  "esco_notes",
  "esco_items_json",
  "onet_match",
  "onet_soc_code",
  "onet_occupation_title",
  "onet_url",
  "onet_notes",
  "onet_elements_json",
  "onet_categories_json",
  "onet_max_importance_json",
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
    var row = [];
    for (var i = 0; i < HEADER.length; i++) {
      var key = HEADER[i];
      var val = data[key];
      if (key === "timestamp" && !val) {
        val = new Date().toISOString();
      }
      row.push(val == null ? "" : val);
    }
    sh.appendRow(row);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function getCoverage() {
  var sh = _sheet();
  var last = sh.getLastRow();
  var map = {};
  var raterCol = HEADER.indexOf("rater_id");
  var atomCol = HEADER.indexOf("atom_id");
  if (last >= 2 && raterCol >= 0 && atomCol >= 0) {
    var values = sh.getRange(2, 1, last, HEADER.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var atomId = String(values[i][atomCol] || "").trim();
      var raterId = String(values[i][raterCol] || "").trim();
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
