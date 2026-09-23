/* global LABELER_CONFIG */

(function () {
  "use strict";

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
    marksList: document.getElementById("marks-list"),
    form: document.getElementById("label-form"),
    notes: document.getElementById("notes"),
    markHeader: document.getElementById("mark-header"),
    markBody: document.getElementById("mark-body"),
    markSkip: document.getElementById("mark-skip"),
    clearMarks: document.getElementById("clear-marks"),
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
  /** block_id → answer */
  let answers = {};
  /** block_id → Set of rater_ids */
  let coverage = new Map();
  /** @type {Record<string, any>|null} */
  let current = null;
  let raterId = "";
  /** @type {Array<Record<string, any>>} */
  let marks = [];

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
      script.src = `${url}${sep}callback=${encodeURIComponent(cb)}&round_id=${encodeURIComponent(LABELER_CONFIG.roundId)}&_=${Date.now()}`;
      script.onerror = () => {
        cleanup();
        reject(new Error("Sheet coverage request failed"));
      };
      document.body.appendChild(script);
    });
  }

  function rebuildCoverage(remoteLabels) {
    coverage = new Map();
    (remoteLabels || []).forEach((row) => {
      const bid = (row.block_id || "").trim();
      const rid = (row.rater_id || "").trim();
      if (!bid || !rid) return;
      if (!coverage.has(bid)) coverage.set(bid, new Set());
      coverage.get(bid).add(rid);
    });
    Object.keys(answers).forEach((bid) => {
      if (!coverage.has(bid)) coverage.set(bid, new Set());
      coverage.get(bid).add(raterId);
    });
  }

  function eligibleBlocks() {
    const t = TARGET();
    return blocks.filter((b) => {
      const raters = coverage.get(b.block_id) || new Set();
      if (raters.has(raterId)) return false;
      return raters.size < t;
    });
  }

  function updateProgress() {
    const mine = Object.keys(answers).length;
    const elig = eligibleBlocks().length;
    const total = blocks.length;
    els.progressText.textContent = `Your labels: ${mine}`;
    els.coverageText.textContent = `${elig} units still need you · bank ${total}`;
    const pct = total ? Math.min(100, (mine / Math.max(1, total)) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
  }

  function cloneMarks(src) {
    return (src || []).map((m) => ({ ...m }));
  }

  function loadSuggestions() {
    marks = cloneMarks(current.suggestedMarks || []);
    if (!marks.length && current.text) {
      marks = [
        {
          role: "body",
          start: 0,
          end: current.text.length,
          section_number: "",
          parent_section_number: current.suggestedParentSectionNumber || "root",
          text: current.text,
        },
      ];
    }
    renderText();
    renderMarksList();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderText() {
    const text = current.text || "";
    const sorted = marks
      .slice()
      .filter((m) => Number.isFinite(m.start) && Number.isFinite(m.end) && m.end > m.start)
      .sort((a, b) => a.start - b.start || b.end - a.end);

    // Build non-overlapping highlight layers (simple: paint in order, later wins on overlap display via nested spans avoided — use sequential segments)
    const cuts = new Set([0, text.length]);
    sorted.forEach((m) => {
      cuts.add(Math.max(0, Math.min(text.length, m.start)));
      cuts.add(Math.max(0, Math.min(text.length, m.end)));
    });
    const points = Array.from(cuts).sort((a, b) => a - b);
    let html = "";
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a >= b) continue;
      const covering = sorted.filter((m) => m.start <= a && m.end >= b);
      const role = covering.length ? covering[covering.length - 1].role : "";
      const chunk = escapeHtml(text.slice(a, b));
      if (role) {
        html += `<mark class="span-${role}" data-role="${role}">${chunk}</mark>`;
      } else {
        html += chunk;
      }
    }
    els.blockText.innerHTML = html || escapeHtml(text);
  }

  function getSelectionOffsets() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!els.blockText.contains(range.commonAncestorContainer)) return null;

    const pre = document.createRange();
    pre.selectNodeContents(els.blockText);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    if (end <= start) return null;
    return { start, end, text: (current.text || "").slice(start, end) };
  }

  function inferSectionNumber(role, selectedText) {
    if (role !== "header") return "";
    const t = (selectedText || "").trim();
    const num = t.match(/^(\d+(?:\.\d+){0,5})\b/);
    if (num) return num[1];
    const let_ = t.match(/^(\([a-z0-9]+\))/i);
    if (let_) return let_[1];
    if (/^references?$/i.test(t) || /^references?\b/i.test(t)) return "References";
    return t.slice(0, 48);
  }

  function lastHeaderSection() {
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i].role === "header" && marks[i].section_number) {
        return marks[i].section_number;
      }
    }
    return current.suggestedParentSectionNumber || "root";
  }

  function addMark(role) {
    const sel = getSelectionOffsets();
    if (!sel) {
      setStatus("Select text in the unit first, then mark.", "err");
      return;
    }
    // remove overlapping marks
    marks = marks.filter((m) => m.end <= sel.start || m.start >= sel.end);
    const section =
      role === "header" ? inferSectionNumber(role, sel.text) : "";
    const parent =
      role === "skip"
        ? ""
        : role === "header"
          ? "root"
          : lastHeaderSection();
    marks.push({
      role,
      start: sel.start,
      end: sel.end,
      section_number: section,
      parent_section_number: parent,
      text: sel.text,
    });
    marks.sort((a, b) => a.start - b.start);
    window.getSelection().removeAllRanges();
    renderText();
    renderMarksList();
    setStatus(`Marked ${role} [${sel.start},${sel.end})`, "ok");
  }

  function renderMarksList() {
    if (!marks.length) {
      els.marksList.innerHTML =
        '<p class="lead" style="margin:0">No marks yet — select text and press H / B / S.</p>';
      return;
    }
    const cand = current.candidateParents || [];
    els.marksList.innerHTML = marks
      .map((m, idx) => {
        const opts = [
          `<option value="root">root</option>`,
          ...cand
            .filter((c) => c.sectionNumber && c.sectionNumber !== "root")
            .map((c) => {
              const sel =
                (m.parent_section_number || "") === c.sectionNumber
                  ? " selected"
                  : "";
              return `<option value="${escapeHtml(c.sectionNumber)}"${sel}>${escapeHtml(c.sectionNumber)} — ${escapeHtml(c.label || "")}</option>`;
            }),
          `<option value="__other__">Other…</option>`,
        ].join("");
        const parentVal = m.parent_section_number || "root";
        const known = cand.some((c) => c.sectionNumber === parentVal) || parentVal === "root";
        return `<div class="mark-row role-${m.role}" data-idx="${idx}">
          <span class="mark-role">${m.role}</span>
          <code class="mark-excerpt">${escapeHtml((m.text || "").slice(0, 72))}${(m.text || "").length > 72 ? "…" : ""}</code>
          ${
            m.role === "header"
              ? `<label>section<input data-field="section_number" value="${escapeHtml(m.section_number || "")}" /></label>`
              : ""
          }
          ${
            m.role !== "skip"
              ? `<label>parent
                  <select data-field="parent_select">${opts}</select>
                  <input data-field="parent_other" placeholder="Other parent" value="${known ? "" : escapeHtml(parentVal)}" ${known ? "hidden" : ""} />
                </label>`
              : ""
          }
          <button type="button" class="secondary mark-remove" data-idx="${idx}">Remove</button>
        </div>`;
      })
      .join("");

    // set parent selects correctly for Other
    els.marksList.querySelectorAll(".mark-row").forEach((row) => {
      const idx = Number(row.getAttribute("data-idx"));
      const m = marks[idx];
      const sel = row.querySelector('[data-field="parent_select"]');
      const other = row.querySelector('[data-field="parent_other"]');
      if (!sel || !m || m.role === "skip") return;
      const parentVal = m.parent_section_number || "root";
      const has = Array.from(sel.options).some((o) => o.value === parentVal);
      if (has) sel.value = parentVal;
      else {
        sel.value = "__other__";
        if (other) {
          other.hidden = false;
          other.value = parentVal;
        }
      }
    });
  }

  els.marksList.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".mark-remove");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-idx"));
    marks.splice(idx, 1);
    renderText();
    renderMarksList();
  });

  els.marksList.addEventListener("input", (ev) => {
    const row = ev.target.closest(".mark-row");
    if (!row) return;
    const idx = Number(row.getAttribute("data-idx"));
    const m = marks[idx];
    if (!m) return;
    const field = ev.target.getAttribute("data-field");
    if (field === "section_number") m.section_number = ev.target.value.trim();
    if (field === "parent_other") m.parent_section_number = ev.target.value.trim();
  });

  els.marksList.addEventListener("change", (ev) => {
    const row = ev.target.closest(".mark-row");
    if (!row) return;
    const idx = Number(row.getAttribute("data-idx"));
    const m = marks[idx];
    if (!m) return;
    if (ev.target.getAttribute("data-field") === "parent_select") {
      const other = row.querySelector('[data-field="parent_other"]');
      if (ev.target.value === "__other__") {
        if (other) other.hidden = false;
      } else {
        m.parent_section_number = ev.target.value;
        if (other) {
          other.hidden = true;
          other.value = "";
        }
      }
    }
  });

  function showUnit(block) {
    current = block;
    els.metaDoc.textContent = block.documentName || "—";
    els.metaClass.textContent = block.documentClass || "—";
    els.metaVersion.textContent = block.versionLabel || "—";
    els.metaPage.textContent =
      block.pageStart === block.pageEnd
        ? String(block.pageStart)
        : `${block.pageStart}–${block.pageEnd}`;
    const before = block.contextBefore || "";
    const after = block.contextAfter || "";
    els.ctxBeforeWrap.hidden = !before;
    els.ctxAfterWrap.hidden = !after;
    els.ctxBefore.textContent = before;
    els.ctxAfter.textContent = after;
    els.notes.value = "";
    loadSuggestions();
    if (els.how) els.how.open = false;
  }

  function nextUnit() {
    const pool = eligibleBlocks();
    updateProgress();
    if (!pool.length) {
      els.main.hidden = true;
      els.done.hidden = false;
      els.doneMsg.textContent = `Done for now — ${Object.keys(answers).length} labels saved locally.`;
      return;
    }
    els.done.hidden = true;
    els.main.hidden = false;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    showUnit(pick);
  }

  function collectMarksForSave() {
    return marks.map((m) => {
      const row = { ...m };
      return {
        role: row.role,
        start: row.start,
        end: row.end,
        section_number: row.section_number || "",
        parent_section_number: row.parent_section_number || "",
        text: row.text || (current.text || "").slice(row.start, row.end),
      };
    });
  }

  function validateMarks(ms) {
    if (!ms.length) return "Add at least one mark (or mark the whole unit skip).";
    for (const m of ms) {
      if (!["header", "body", "skip"].includes(m.role)) return "Invalid mark role.";
      if (m.role === "header" && !m.section_number) return "Each header mark needs a section number/title.";
      if (m.role === "body" && !m.parent_section_number) return "Each body mark needs a parent header.";
    }
    return "";
  }

  async function postToSheet(payload) {
    const url = sheetUrl();
    if (!url) return { ok: true, localOnly: true };
    const res = await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return { ok: true, opaque: true, res };
  }

  els.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!current) return;
    // sync parent_other fields
    els.marksList.querySelectorAll(".mark-row").forEach((row) => {
      const idx = Number(row.getAttribute("data-idx"));
      const m = marks[idx];
      if (!m || m.role === "skip") return;
      const sel = row.querySelector('[data-field="parent_select"]');
      const other = row.querySelector('[data-field="parent_other"]');
      if (sel && sel.value === "__other__" && other) {
        m.parent_section_number = other.value.trim();
      }
    });
    const ms = collectMarksForSave();
    const err = validateMarks(ms);
    if (err) {
      setStatus(err, "err");
      return;
    }
    const primary = ms.find((m) => m.role === "header") || ms[0];
    const answer = {
      block_id: current.block_id,
      rater_id: raterId,
      round_id: LABELER_CONFIG.roundId,
      marks: ms,
      role: primary.role,
      section_number: primary.section_number || "",
      parent_section_number: primary.parent_section_number || "",
      notes: (els.notes.value || "").trim(),
      page_start: current.pageStart,
      page_end: current.pageEnd,
      document_name: current.documentName,
      document_class: current.documentClass,
      version_label: current.versionLabel,
      text_excerpt: (current.text || "").slice(0, 180),
      client: "gh-pages-seg-labeler-v2",
      timestamp: new Date().toISOString(),
    };
    answers[current.block_id] = answer;
    saveAnswers();
    if (!coverage.has(current.block_id)) coverage.set(current.block_id, new Set());
    coverage.get(current.block_id).add(raterId);
    try {
      await postToSheet({
        round_id: answer.round_id,
        block_id: answer.block_id,
        rater_id: answer.rater_id,
        role: answer.role,
        section_number: answer.section_number,
        parent_section_number: answer.parent_section_number,
        marks_json: JSON.stringify(answer.marks),
        page_start: answer.page_start,
        page_end: answer.page_end,
        document_name: answer.document_name,
        document_class: answer.document_class,
        version_label: answer.version_label,
        text_excerpt: answer.text_excerpt,
        notes: answer.notes,
        client: answer.client,
      });
      setStatus("Saved.", "ok");
    } catch (e) {
      setStatus("Saved locally (Sheet post failed).", "err");
    }
    nextUnit();
  });

  function downloadCsv() {
    const rows = Object.values(answers);
    const cols = [
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
    const esc = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [cols.join(",")];
    rows.forEach((r) => {
      lines.push(
        cols
          .map((c) => {
            if (c === "marks_json") return esc(JSON.stringify(r.marks || []));
            return esc(r[c]);
          })
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seg-labeler-${LABELER_CONFIG.roundId}-${raterId || "local"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  els.markHeader.addEventListener("click", () => addMark("header"));
  els.markBody.addEventListener("click", () => addMark("body"));
  els.markSkip.addEventListener("click", () => addMark("skip"));
  els.clearMarks.addEventListener("click", () => {
    marks = [];
    renderText();
    renderMarksList();
  });
  els.useSuggestions.addEventListener("click", () => loadSuggestions());

  document.addEventListener("keydown", (ev) => {
    if (els.main.hidden) return;
    const tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = ev.key.toLowerCase();
    if (k === "h") {
      ev.preventDefault();
      addMark("header");
    } else if (k === "b") {
      ev.preventDefault();
      addMark("body");
    } else if (k === "s") {
      ev.preventDefault();
      addMark("skip");
    }
  });

  els.download.addEventListener("click", downloadCsv);
  els.downloadDone.addEventListener("click", downloadCsv);
  els.reset.addEventListener("click", () => {
    if (!confirm("Clear your local labels for this round?")) return;
    answers = {};
    saveAnswers();
    rebuildCoverage([]);
    fetchCoverageJsonp()
      .then((data) => {
        rebuildCoverage(data.labels || []);
        nextUnit();
      })
      .catch(() => nextUnit());
  });

  els.start.addEventListener("click", async () => {
    raterId = (els.raterId.value || "").trim();
    if (!raterId) {
      setStatus("Enter your initials.", "err");
      return;
    }
    loadAnswers();
    setStatus("Loading units…");
    try {
      const res = await fetch(LABELER_CONFIG.blocksUrl + "?_=" + Date.now());
      blocks = await res.json();
      const cov = await fetchCoverageJsonp();
      rebuildCoverage(cov.labels || []);
      els.setup.hidden = true;
      nextUnit();
      setStatus("");
    } catch (e) {
      setStatus(String(e.message || e), "err");
    }
  });

  // boot
  els.roundBadge.textContent = LABELER_CONFIG.roundId || "round";
  if (!sheetUrl()) els.sheetWarn.hidden = false;
})();
