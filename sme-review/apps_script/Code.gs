/**
 * Google Apps Script web app for the SME review tool (titles + concepts).
 *
 * Setup:
 * 1. Create a Google Sheet (or reuse one). Tabs "titles" and "concepts"
 *    are created automatically on first write.
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run ensureHeader once; approve permissions.
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Paste the web-app URL into:
 *    - eval/sme/web/config.js → sheetWebAppUrl
 *    - and the published copy on k3smith.github.io/sme-review/config.js
 *
 * Endpoints:
 * - GET  ?callback=fn → JSONP coverage
 *   { ok, titles:[{item_id,rater_id}], concepts:[{item_id,rater_id}] }
 * - POST text/plain JSON
 *   { kind: "title"|"concept"|"batch", ...fields }
 *   batch: { kind:"batch", rows:[{kind, ...}, ...] }
 *
 * Writes upsert by (rater_id, competency_id) or (rater_id, cluster_id)
 * so re-clicks update the same row instead of duplicating.
 */

var TITLES_SHEET = "titles";
var CONCEPTS_SHEET = "concepts";

var TITLE_HEADER = [
  "timestamp",
  "round_id",
  "rater_id",
  "corpus_key",
  "framework_id",
  "competency_id",
  "depth",
  "title",
  "action",
  "new_title",
  "merge_into_id",
  "notes",
  "client",
];

var CONCEPT_HEADER = [
  "timestamp",
  "round_id",
  "rater_id",
  "corpus_key",
  "cluster_id",
  "action",
  "canonical_text",
  "ksa_type",
  "n_members",
  "statement_ids_json",
  "notes",
  "client",
];

function ensureHeader() {
  _ensure(TITLES_SHEET, TITLE_HEADER);
  _ensure(CONCEPTS_SHEET, CONCEPT_HEADER);
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
    if (data.kind === "batch" && data.rows && data.rows.length) {
      for (var i = 0; i < data.rows.length; i++) {
        _upsertRow(data.rows[i]);
      }
      return _json({ ok: true, n: data.rows.length });
    }
    _upsertRow(data);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function getCoverage() {
  return {
    ok: true,
    titles: _coveragePairs(TITLES_SHEET, TITLE_HEADER, "competency_id", "rater_id"),
    concepts: _coveragePairs(CONCEPTS_SHEET, CONCEPT_HEADER, "cluster_id", "rater_id"),
  };
}

function _upsertRow(data) {
  var kind = String(data.kind || "").toLowerCase();
  if (kind === "title") {
    _ensure(TITLES_SHEET, TITLE_HEADER);
    var row = [
      data.timestamp || new Date().toISOString(),
      data.round_id || "",
      data.rater_id || "",
      data.corpus_key || "",
      data.framework_id || "",
      data.competency_id || "",
      data.depth == null ? "" : data.depth,
      data.title || "",
      data.action || "",
      data.new_title || "",
      data.merge_into_id || "",
      data.notes || "",
      data.client || "sme-review",
    ];
    _upsertByKeys(TITLES_SHEET, TITLE_HEADER, ["rater_id", "competency_id"], row);
    return;
  }
  if (kind === "concept") {
    _ensure(CONCEPTS_SHEET, CONCEPT_HEADER);
    var ids = data.statement_ids || [];
    var crow = [
      data.timestamp || new Date().toISOString(),
      data.round_id || "",
      data.rater_id || "",
      data.corpus_key || "",
      data.cluster_id || "",
      data.action || "",
      data.canonical_text || "",
      data.ksa_type || "",
      data.n_members == null ? ids.length : data.n_members,
      typeof ids === "string" ? ids : JSON.stringify(ids),
      data.notes || "",
      data.client || "sme-review",
    ];
    _upsertByKeys(CONCEPTS_SHEET, CONCEPT_HEADER, ["rater_id", "cluster_id"], crow);
    return;
  }
  throw new Error("Unknown kind: " + kind + " (use title|concept|batch)");
}

/** Update existing row matching key columns, else append. */
function _upsertByKeys(sheetName, header, keyNames, rowValues) {
  var sh = _sheet(sheetName);
  var keyCols = [];
  for (var i = 0; i < keyNames.length; i++) {
    var idx = header.indexOf(keyNames[i]);
    if (idx < 0) {
      sh.appendRow(rowValues);
      return;
    }
    keyCols.push(idx);
  }
  var last = sh.getLastRow();
  if (last < 2) {
    sh.appendRow(rowValues);
    return;
  }
  var values = sh.getRange(2, 1, last, header.length).getValues();
  for (var r = 0; r < values.length; r++) {
    var match = true;
    for (var k = 0; k < keyCols.length; k++) {
      var col = keyCols[k];
      if (String(values[r][col] || "").trim() !== String(rowValues[col] || "").trim()) {
        match = false;
        break;
      }
    }
    if (match) {
      sh.getRange(r + 2, 1, r + 2, header.length).setValues([rowValues]);
      return;
    }
  }
  sh.appendRow(rowValues);
}

function _coveragePairs(sheetName, header, idKey, raterKey) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var idCol = header.indexOf(idKey);
  var raterCol = header.indexOf(raterKey);
  if (idCol < 0 || raterCol < 0) return out;
  var values = sh.getRange(2, 1, sh.getLastRow(), header.length).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var itemId = String(values[i][idCol] || "").trim();
    var raterId = String(values[i][raterCol] || "").trim();
    if (!itemId || !raterId) continue;
    map[itemId + "\t" + raterId] = { item_id: itemId, rater_id: raterId };
  }
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]);
  }
  return out;
}

function _ensure(name, header) {
  var sh = _sheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
  }
}

function _sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
