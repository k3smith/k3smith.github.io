/* global LABELER_CONFIG */

(function () {
  "use strict";

  const ROLES = new Set(["header", "body", "skip"]);

  const TARGET = () =>
    Number(LABELER_CONFIG.targetRatings) > 0
      ? Number(LABELER_CONFIG.targetRatings)
      : 2;

  const els = {
    setup: document.getElementById("setup"),
    main: document.getElementById("main"),
    done: document.getElementById("done"),
    start: document.getElementById("start"),
    raterId: document.getElementById("rater-id"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    coverageText: document.getElementById("coverage-text"),
    metaDoc: document.getElementById("meta-doc"),
    metaClass: document.getElementById("meta-class"),
    metaVersion: document.getElementById("meta-version"),
    metaPage: document.getElementById("meta-page"),
    ctxBeforeWrap: document.getElementById("ctx-before-wrap"),
    ctxBefore: document.getElementById("ctx-before"),
    ctxAfterWrap: document.getElementById("ctx-after-wrap"),
    ctxAfter: document.getElementById("ctx-after"),
    blockText: document.getElementById("block-text"),
    form: document.getElementById("label-form"),
    unitRole: document.getElementById("unit-role"),
    sectionNumber: document.getElementById("section-number"),
    parentSection: document.getElementById("parent-section"),
    notes: document.getElementById("notes"),
    useSuggestions: document.getElementById("use-suggestions"),
    status: document.getElementById("status"),
    setupStatus: document.getElementById("setup-status"),
    download: document.getElementById("download"),
    downloadDone: document.getElementById("download-done"),
    reset: document.getElementById("reset"),
    how: document.getElementById("how"),
    roundBadge: document.getElementById("round-badge"),
    sheetWarn: document.getElementById("sheet-warn"),
    doneMsg: document.getElementById("done-msg"),
  };

  /** @type {Array<Record<string, any>>} */
  let blocks = [];
  /** block_id → answer object */
  let answers = {};
  /** block_id → Set of rater_ids */
  let coverage = new Map();
  /** @type {Record<string, any>|null} */
  let current = null;
  let raterId = "";

  function storageKey() {
    return `seg-labeler:${LABELER_CONFIG.roundId}:${raterId}`;
  }

  function loadAnswers() {
    try {
      answers = JSON.parse(localStorage.getItem(storageKey()) || "{}");
    } catch {
      answers = {};
    }
  }

  function saveAnswers() {
    localStorage.setItem(storageKey(), JSON.stringify(answers));
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.dataset.kind = kind || "";
    if (els.setupStatus) {
      els.setupStatus.textContent = msg || "";
      els.setupStatus.dataset.kind = kind || "";
    }
  }

  function sheetUrl() {
    return (LABELER_CONFIG.sheetWebAppUrl || "").trim();
  }

  function fetchCoverageJsonp() {
    const url = sheetUrl();
    if (!url) {
      return Promise.resolve({ ok: true, target: TARGET(), labels: [] });
    }
    return new Promise((resolve, reject) => {
      const cb = `_segLabelerCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sheet coverage timed out"));
      }, 15000);
      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      }
      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };
      const sep = url.includes("?") ? "&" : "?";
      script.src = `${url}${sep}callback=${encodeURIComponent(cb)}&_=${Date.now()}`;
      script.onerror = () => {
        cleanup();
        reject(new Error("Sheet coverage request failed"));
      };
      document.body.appendChild(script);
    });
  }

  function rebuildCoverage(remoteLabels) {
    coverage = new Map();
    for (const row of remoteLabels || []) {
      const bid = (row.block_id || "").trim();
      const rid = (row.rater_id || "").trim();
      if (!bid || !rid) continue;
      if (!coverage.has(bid)) coverage.set(bid, new Set());
      coverage.get(bid).add(rid);
    }
    for (const bid of Object.keys(answers)) {
      if (!coverage.has(bid)) coverage.set(bid, new Set());
      coverage.get(bid).add(raterId);
    }
  }

  function ratersFor(blockId) {
    return coverage.get(blockId) || new Set();
  }

  function eligibleBlocks() {
    const t = TARGET();
    return blocks.filter((b) => {
      const s = ratersFor(b.block_id);
      return s.size < t && !s.has(raterId);
    });
  }

  function blocksFullyCovered() {
    const t = TARGET();
    return blocks.filter((b) => ratersFor(b.block_id).size >= t).length;
  }

  function updateProgress() {
    const mine = Object.keys(answers).length;
    const full = blocksFullyCovered();
    const total = blocks.length;
    const t = TARGET();
    els.progressText.textContent = `Your labels: ${mine} · Units with ${t} ratings: ${full} / ${total}`;
    els.progressFill.style.width = total ? `${(100 * full) / total}%` : "0%";
    if (els.coverageText) {
      const open = eligibleBlocks().length;
      els.coverageText.textContent = open
        ? `${open} units still available for you`
        : "No units left for you right now";
    }
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function fillParentOptions(b, selected) {
    const sel = els.parentSection;
    sel.innerHTML = "";
    const candidates = Array.isArray(b.candidateParents)
      ? b.candidateParents.slice()
      : [];
    const hasRoot = candidates.some(
      (c) => String(c.sectionNumber || "").toLowerCase() === "root"
    );
    if (!hasRoot) {
      candidates.unshift({
        sectionNumber: "root",
        label: "(document root)",
      });
    }
    // Always allow typing via free option if suggested parent missing
    const seen = new Set();
    for (const c of candidates) {
      const val = String(c.sectionNumber || "").trim();
      if (!val || seen.has(val)) continue;
      seen.add(val);
      const opt = document.createElement("option");
      opt.value = val;
      const lab = (c.label || "").trim();
      opt.textContent = lab ? `${val} — ${lab}` : val;
      sel.appendChild(opt);
    }
    if (selected && !seen.has(selected)) {
      const opt = document.createElement("option");
      opt.value = selected;
      opt.textContent = selected;
      sel.appendChild(opt);
    }
    const want = selected || "root";
    sel.value = seen.has(want) || selected ? want : "root";
  }

  function applySuggestions(b) {
    const role = (b.suggestedRole || "").toLowerCase();
    els.unitRole.value = ROLES.has(role) ? role : "";
    els.sectionNumber.value = b.suggestedSectionNumber || "";
    const parent =
      b.suggestedParentSectionNumber === "" ||
      b.suggestedParentSectionNumber == null
        ? "root"
        : String(b.suggestedParentSectionNumber);
    fillParentOptions(b, parent);
    els.notes.value = "";
    toggleFieldsForRole();
  }

  function toggleFieldsForRole() {
    const role = els.unitRole.value;
    const needParent = role === "header" || role === "body";
    els.parentSection.disabled = !needParent;
    els.sectionNumber.disabled = role === "skip";
    if (role === "skip") {
      els.sectionNumber.value = "";
    }
  }

  function showDone(reason) {
    els.main.hidden = true;
    els.done.hidden = false;
    const mine = Object.keys(answers).length;
    const full = blocksFullyCovered();
    const t = TARGET();
    if (els.doneMsg) {
      els.doneMsg.innerHTML =
        reason ||
        `You have labeled <strong>${mine}</strong> units. ` +
          `Study coverage: <strong>${full}</strong> / ${blocks.length} units have ${t} ratings. Thank you!`;
    }
  }

  function showBlock(b) {
    current = b;
    els.done.hidden = true;
    els.main.hidden = false;
    els.metaDoc.textContent = b.documentName || "-";
    els.metaClass.textContent = b.documentClass || "-";
    els.metaVersion.textContent = b.versionLabel || "-";
    const ps = b.pageStart != null ? b.pageStart : "-";
    const pe = b.pageEnd != null ? b.pageEnd : ps;
    els.metaPage.textContent = ps === pe ? String(ps) : `${ps}-${pe}`;

    const before = (b.contextBefore || "").trim();
    const after = (b.contextAfter || "").trim();
    if (before) {
      els.ctxBeforeWrap.hidden = false;
      els.ctxBefore.textContent = before;
    } else {
      els.ctxBeforeWrap.hidden = true;
      els.ctxBefore.textContent = "";
    }
    if (after) {
      els.ctxAfterWrap.hidden = false;
      els.ctxAfter.textContent = after;
    } else {
      els.ctxAfterWrap.hidden = true;
      els.ctxAfter.textContent = "";
    }
    els.blockText.textContent = b.text || "";
    applySuggestions(b);
    updateProgress();
    els.unitRole.focus();
  }

  async function refreshAndShowNext() {
    setStatus("Finding a unit…", "pending");
    try {
      const data = await fetchCoverageJsonp();
      if (data && data.target) {
        LABELER_CONFIG.targetRatings = data.target;
      }
      rebuildCoverage(data && data.labels);
    } catch (err) {
      rebuildCoverage([]);
      if (sheetUrl()) {
        setStatus(
          `Could not read Sheet (${err.message}). Showing local-only queue.`,
          "warn"
        );
      }
    }

    const open = eligibleBlocks();
    updateProgress();
    if (!open.length) {
      const full = blocksFullyCovered();
      if (full >= blocks.length) {
        showDone(
          `All ${blocks.length} units already have ${TARGET()} ratings. Thank you!`
        );
      } else {
        showDone(
          `No more units available for <strong>${raterId}</strong> right now ` +
            `(you may have finished your share, or remaining slots need other raters). ` +
            `Coverage: <strong>${full}</strong> / ${blocks.length} units at ${TARGET()} ratings.`
        );
      }
      setStatus("", "");
      return;
    }
    showBlock(pickRandom(open));
    if (!els.status.dataset.kind || els.status.dataset.kind === "pending") {
      setStatus("", "");
    }
  }

  async function postToSheet(payload) {
    const url = sheetUrl();
    if (!url) return { ok: false, skipped: true };

    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data && data.ok === false) throw new Error(data.error || "Sheet rejected");
    return { ok: true };
  }

  function excerpt(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > 200 ? t.slice(0, 200) : t;
  }

  async function saveLabel(ev) {
    if (ev) ev.preventDefault();
    if (!current) return;

    const role = (els.unitRole.value || "").trim().toLowerCase();
    if (!ROLES.has(role)) {
      setStatus("Select a role (header / body / skip).", "err");
      els.unitRole.focus();
      return;
    }

    let parent = (els.parentSection.value || "").trim();
    if (role === "skip") {
      parent = "";
    } else if (!parent) {
      setStatus("Choose a parent header (or root).", "err");
      els.parentSection.focus();
      return;
    }

    const b = current;
    const ts = new Date().toISOString();
    const answer = {
      role,
      section_number: (els.sectionNumber.value || "").trim(),
      parent_section_number: parent,
      notes: (els.notes.value || "").trim(),
      ts,
    };
    answers[b.block_id] = answer;
    saveAnswers();
    if (!coverage.has(b.block_id)) coverage.set(b.block_id, new Set());
    coverage.get(b.block_id).add(raterId);

    const payload = {
      round_id: LABELER_CONFIG.roundId,
      block_id: b.block_id,
      rater_id: raterId,
      role: answer.role,
      section_number: answer.section_number,
      parent_section_number: answer.parent_section_number,
      page_start: b.pageStart != null ? b.pageStart : "",
      page_end: b.pageEnd != null ? b.pageEnd : b.pageStart != null ? b.pageStart : "",
      document_name: b.documentName || "",
      document_class: b.documentClass || "",
      version_label: b.versionLabel || "",
      text_excerpt: excerpt(b.text),
      notes: answer.notes,
      client: "gh-pages-seg-labeler",
    };

    setStatus("Saving…", "pending");
    try {
      const result = await postToSheet(payload);
      if (result.skipped) {
        setStatus(
          "Saved in this browser only (configure Sheet URL for shared coverage).",
          "warn"
        );
      } else {
        setStatus("Saved.", "ok");
      }
    } catch (err) {
      setStatus(
        `Saved locally; Sheet send failed (${err.message}). Use Download backup.`,
        "err"
      );
    }
    await refreshAndShowNext();
  }

  function rowsForExport() {
    return Object.entries(answers).map(([block_id, a]) => {
      const b = blocks.find((x) => x.block_id === block_id) || {};
      return {
        block_id,
        round_id: LABELER_CONFIG.roundId,
        rater_id: raterId,
        role: a.role || "",
        section_number: a.section_number || "",
        parent_section_number: a.parent_section_number || "",
        page_start: b.pageStart != null ? b.pageStart : "",
        page_end: b.pageEnd != null ? b.pageEnd : "",
        document_name: b.documentName || "",
        document_class: b.documentClass || "",
        version_label: b.versionLabel || "",
        text_excerpt: excerpt(b.text),
        notes: a.notes || "",
        labeled_at: a.ts || "",
      };
    });
  }

  function downloadCsv() {
    const rows = rowsForExport();
    const cols = [
      "timestamp",
      "round_id",
      "block_id",
      "rater_id",
      "role",
      "section_number",
      "parent_section_number",
      "page_start",
      "page_end",
      "document_name",
      "document_class",
      "version_label",
      "text_excerpt",
      "notes",
      "client",
    ];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(
      rows.map((r) =>
        cols
          .map((c) => {
            if (c === "timestamp") return esc(r.labeled_at || "");
            if (c === "client") return esc("gh-pages-seg-labeler-backup");
            return esc(r[c] ?? "");
          })
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `section_labels_${LABELER_CONFIG.roundId}_${raterId || "anon"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function start() {
    raterId = (els.raterId.value || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!raterId || raterId.length < 2) {
      els.raterId.focus();
      setStatus("Please enter your name or initials.", "err");
      return;
    }
    if (!sheetUrl()) {
      setStatus(
        "No Sheet URL — saving locally only. Configure sheetWebAppUrl before recruiting raters.",
        "warn"
      );
    }
    loadAnswers();
    els.setup.hidden = true;
    await refreshAndShowNext();
  }

  async function init() {
    els.roundBadge.textContent = LABELER_CONFIG.roundTitle || LABELER_CONFIG.roundId;
    if (!sheetUrl()) {
      els.sheetWarn.hidden = false;
    }

    const res = await fetch(LABELER_CONFIG.blocksUrl);
    if (!res.ok) throw new Error(`Could not load blocks (${res.status})`);
    blocks = await res.json();
    if (!Array.isArray(blocks) || !blocks.length) {
      throw new Error("Blocks file is empty");
    }

    els.start.addEventListener("click", () => {
      start().catch((e) => setStatus(String(e.message || e), "err"));
    });
    els.raterId.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        start().catch((err) => setStatus(String(err.message || err), "err"));
      }
    });
    els.form.addEventListener("submit", (e) => {
      saveLabel(e).catch((err) => setStatus(String(err.message || err), "err"));
    });
    els.unitRole.addEventListener("change", toggleFieldsForRole);
    els.useSuggestions.addEventListener("click", () => {
      if (current) applySuggestions(current);
    });
    els.download.addEventListener("click", downloadCsv);
    els.downloadDone.addEventListener("click", downloadCsv);
    els.reset.addEventListener("click", () => {
      if (!confirm("Clear your local backup labels for this round in this browser?"))
        return;
      answers = {};
      saveAnswers();
      refreshAndShowNext().catch((e) => setStatus(String(e.message || e), "err"));
    });
    els.how.addEventListener("toggle", () => {
      localStorage.setItem("seg-labeler:how-open", els.how.open ? "1" : "0");
    });
    els.how.open = localStorage.getItem("seg-labeler:how-open") !== "0";

    // Shortcuts: 1 header · 2 body · 3 skip · Enter save
    document.addEventListener("keydown", (e) => {
      if (els.main.hidden) return;
      if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
      }
      if (e.key === "1") {
        els.unitRole.value = "header";
        toggleFieldsForRole();
      } else if (e.key === "2") {
        els.unitRole.value = "body";
        toggleFieldsForRole();
      } else if (e.key === "3") {
        els.unitRole.value = "skip";
        toggleFieldsForRole();
      }
    });
  }

  init().catch((err) => {
    setStatus(String(err.message || err), "err");
    console.error(err);
  });
})();
