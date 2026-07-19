/**
 * Google Apps Script web app for the LO labeler.
 *
 * Setup:
 * 1. Create a Google Sheet with a tab named "labels".
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run ensureHeader once; approve permissions.
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Paste the web-app URL into lo-labeler/config.js → sheetWebAppUrl
 *
 * Endpoints:
 * - GET  ?callback=fn   → JSONP coverage { target, labels:[{pair_id,rater_id,label}] }
 * - POST text/plain JSON → append one label row
 */

var SHEET_NAME = "labels";
var TARGET_RATINGS = 2;

var HEADER = [
  "timestamp",
  "round_id",
  "pair_id",
  "rater_id",
  "label",
  "book",
  "section",
  "candidate",
  "course",
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
  var data = getCoverage();
  var body = JSON.stringify(data);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    // JSONP so GitHub Pages can read coverage without CORS issues
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
      data.pair_id || "",
      data.rater_id || "",
      data.label || "",
      data.book || "",
      data.section || "",
      data.candidate || "",
      data.course || "",
      data.notes || "",
      data.client || "",
    ]);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/** Unique (pair_id, rater_id) labels; latest row wins. */
function getCoverage() {
  var sh = _sheet();
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last, HEADER.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var pairId = String(row[2] || "").trim();
      var raterId = String(row[3] || "").trim();
      var label = String(row[4] || "").trim().toLowerCase();
      if (!pairId || !raterId) continue;
      if (label !== "match" && label !== "partial" && label !== "no") continue;
      map[pairId + "\t" + raterId] = {
        pair_id: pairId,
        rater_id: raterId,
        label: label,
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
