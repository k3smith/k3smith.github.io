/**
 * Google Apps Script web app for the K/S span labeler (ks-labeler).
 *
 * Setup:
 * 1. Create a Google Sheet with a tab named "labels".
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run ensureHeader once; approve permissions.
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Paste the web-app URL into eval/labeler/web/config.js → sheetWebAppUrl
 *
 * Endpoints:
 * - GET  ?callback=fn   → JSONP coverage { target, labels:[{sent_id,rater_id}] }
 * - POST text/plain JSON → append one label row
 */

var SHEET_NAME = "labels";
var TARGET_RATINGS = 2;

var HEADER = [
  "timestamp",
  "round_id",
  "sent_id",
  "rater_id",
  "corpus",
  "source",
  "tokens_json",
  "tags_skill_json",
  "tags_knowledge_json",
  "skill_f1",
  "knowledge_f1",
  "combined_f1",
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
      data.sent_id || "",
      data.rater_id || "",
      data.corpus || "",
      data.source || "",
      data.tokens_json || "",
      data.tags_skill_json || "",
      data.tags_knowledge_json || "",
      data.skill_f1 === 0 || data.skill_f1 ? data.skill_f1 : "",
      data.knowledge_f1 === 0 || data.knowledge_f1 ? data.knowledge_f1 : "",
      data.combined_f1 === 0 || data.combined_f1 ? data.combined_f1 : "",
      data.notes || "",
      data.client || "",
    ]);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/** Unique (sent_id, rater_id); latest row wins. */
function getCoverage() {
  var sh = _sheet();
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last, HEADER.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var sentId = String(row[2] || "").trim();
      var raterId = String(row[3] || "").trim();
      if (!sentId || !raterId) continue;
      map[sentId + "\t" + raterId] = {
        sent_id: sentId,
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
