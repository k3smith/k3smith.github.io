/**
 * Google Apps Script web app for the RAGStudy trust labeler.
 *
 * Setup:
 * 1. Create a Google Sheet with a tab named "labels".
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run ensureHeader once; approve permissions.
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Paste the web-app URL into rag-trust-labeler/config.js → sheetWebAppUrl
 *
 * Endpoints:
 * - GET  ?callback=fn → JSONP coverage { target, labels:[{item_id,rater_id}] }
 * - POST text/plain JSON → append one label row
 */

var SHEET_NAME = "labels";
var TARGET_RATINGS = 2;

var HEADER = [
  "timestamp",
  "round_id",
  "item_id",
  "rater_id",
  "correct",
  "faithful",
  "attributed",
  "notes",
  "citation_seconds",
  "benchmark_id",
  "client",
];

var CORRECT_OK = {
  yes: 1,
  no: 1,
  abstain_correct: 1,
  abstain_wrong: 1,
  na: 1,
};
var YN_OK = { yes: 1, no: 1, na: 1 };

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
      new Date().toISOString(),
      data.round_id || "",
      data.item_id || "",
      data.rater_id || "",
      data.correct || "",
      data.faithful || "",
      data.attributed || "",
      data.notes || "",
      data.citation_seconds === 0 || data.citation_seconds
        ? data.citation_seconds
        : "",
      data.benchmark_id || "",
      data.client || "",
    ]);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/** Unique (item_id, rater_id); latest row wins. */
function getCoverage() {
  var sh = _sheet();
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last, HEADER.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var itemId = String(row[2] || "").trim();
      var raterId = String(row[3] || "").trim();
      var correct = String(row[4] || "").trim().toLowerCase();
      var faithful = String(row[5] || "").trim().toLowerCase();
      var attributed = String(row[6] || "").trim().toLowerCase();
      if (!itemId || !raterId) continue;
      if (!CORRECT_OK[correct] || !YN_OK[faithful] || !YN_OK[attributed]) continue;
      map[itemId + "\t" + raterId] = {
        item_id: itemId,
        rater_id: raterId,
        correct: correct,
        faithful: faithful,
        attributed: attributed,
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
