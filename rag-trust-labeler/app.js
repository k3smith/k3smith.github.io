/* global LABELER_CONFIG */

(function () {
  "use strict";

  const CORRECT_OK = new Set([
    "yes",
    "no",
    "abstain_correct",
    "abstain_wrong",
    "na",
  ]);
  const YN_OK = new Set(["yes", "no", "na"]);

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
    metaBench: document.getElementById("meta-bench"),
    metaItem: document.getElementById("meta-item"),
    question: document.getElementById("text-question"),
    evidence: document.getElementById("text-evidence"),
    answer: document.getElementById("text-answer"),
    citations: document.getElementById("text-citations"),
    confidence: document.getElementById("text-confidence"),
    notes: document.getElementById("notes"),
    save: document.getElementById("save"),
    status: document.getElementById("status"),
    download: document.getElementById("download"),
    downloadDone: document.getElementById("download-done"),
    reset: document.getElementById("reset"),
    how: document.getElementById("how"),
    roundBadge: document.getElementById("round-badge"),
    sheetWarn: document.getElementById("sheet-warn"),
    doneMsg: document.getElementById("done-msg"),
    timerStart: document.getElementById("timer-start"),
    timerStop: document.getElementById("timer-stop"),
    timerDisplay: document.getElementById("timer-display"),
  };

  /** @type {object[]} */
  let items = [];
  /** item_id → label record for this rater */
  let answers = {};
  /** item_id → Set of rater_ids */
  let coverage = new Map();
  /** @type {object|null} */
  let current = null;
  let raterId = "";
  /** @type {{correct:string|null,faithful:string|null,attributed:string|null}} */
  let draft = { correct: null, faithful: null, attributed: null };

  let timerStartedAt = null;
  let timerSeconds = null;
  let timerTick = null;

  function storageKey() {
    return `rag-trust-labeler:${LABELER_CONFIG.roundId}:${raterId}`;
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
      const cb = `_ragTrustCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
      const iid = (row.item_id || "").trim();
      const rid = (row.rater_id || "").trim();
      if (!iid || !rid) continue;
      if (!coverage.has(iid)) coverage.set(iid, new Set());
      coverage.get(iid).add(rid);
    }
    for (const iid of Object.keys(answers)) {
      if (!coverage.has(iid)) coverage.set(iid, new Set());
      coverage.get(iid).add(raterId);
    }
  }

  function ratersFor(itemId) {
    return coverage.get(itemId) || new Set();
  }

  function eligibleItems() {
    const t = TARGET();
    return items.filter((it) => {
      const s = ratersFor(it.item_id);
      return s.size < t && !s.has(raterId);
    });
  }

  function itemsFullyCovered() {
    const t = TARGET();
    return items.filter((it) => ratersFor(it.item_id).size >= t).length;
  }

  function updateProgress() {
    const mine = Object.keys(answers).length;
    const full = itemsFullyCovered();
    const total = items.length;
    const t = TARGET();
    els.progressText.textContent = `Your labels: ${mine} · Items with ${t} ratings: ${full} / ${total}`;
    els.progressFill.style.width = total ? `${(100 * full) / total}%` : "0%";
    if (els.coverageText) {
      const open = eligibleItems().length;
      els.coverageText.textContent = open
        ? `${open} items still available for you`
        : "No items left for you right now";
    }
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function resetDraft() {
    draft = { correct: null, faithful: null, attributed: null };
    els.notes.value = "";
    document.querySelectorAll(".btn-row button").forEach((b) => {
      b.classList.remove("selected");
    });
    els.save.disabled = true;
    resetTimer();
  }

  function syncSaveEnabled() {
    const ok =
      CORRECT_OK.has(draft.correct || "") &&
      YN_OK.has(draft.faithful || "") &&
      YN_OK.has(draft.attributed || "");
    els.save.disabled = !ok;
  }

  function selectDim(dim, val, btn) {
    draft[dim] = val;
    const row = btn.closest(".btn-row");
    if (row) {
      row.querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
    }
    btn.classList.add("selected");
    syncSaveEnabled();
  }

  function resetTimer() {
    if (timerTick) clearInterval(timerTick);
    timerTick = null;
    timerStartedAt = null;
    timerSeconds = null;
    els.timerDisplay.textContent = "—";
    els.timerStart.disabled = false;
    els.timerStop.disabled = true;
  }

  function startTimer() {
    timerStartedAt = Date.now();
    timerSeconds = null;
    els.timerStart.disabled = true;
    els.timerStop.disabled = false;
    els.timerDisplay.textContent = "0s";
    if (timerTick) clearInterval(timerTick);
    timerTick = setInterval(() => {
      if (!timerStartedAt) return;
      const s = Math.floor((Date.now() - timerStartedAt) / 1000);
      els.timerDisplay.textContent = `${s}s`;
    }, 250);
  }

  function stopTimer() {
    if (!timerStartedAt) return;
    timerSeconds = Math.round((Date.now() - timerStartedAt) / 1000);
    if (timerTick) clearInterval(timerTick);
    timerTick = null;
    timerStartedAt = null;
    els.timerDisplay.textContent = `${timerSeconds}s (recorded)`;
    els.timerStart.disabled = false;
    els.timerStop.disabled = true;
  }

  function showDone(reason) {
    els.main.hidden = true;
    els.done.hidden = false;
    const mine = Object.keys(answers).length;
    const full = itemsFullyCovered();
    const t = TARGET();
    if (els.doneMsg) {
      els.doneMsg.innerHTML =
        reason ||
        `You have labeled <strong>${mine}</strong> items. ` +
          `Study coverage: <strong>${full}</strong> / ${items.length} items have ${t} ratings. Thank you!`;
    }
  }

  function formatCitations(it) {
    if (typeof it.citations === "string") return it.citations || "—";
    if (Array.isArray(it.citations)) {
      return it.citations
        .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
        .join("\n");
    }
    return "—";
  }

  function showItem(it) {
    current = it;
    els.done.hidden = true;
    els.main.hidden = false;
    els.metaBench.textContent = it.benchmark_id || "—";
    els.metaItem.textContent = it.item_id || "—";
    els.question.textContent = it.question || "";
    els.evidence.textContent = it.evidence || "";
    els.answer.textContent = it.answer || "";
    els.citations.textContent = formatCitations(it);
    const cc = it.confidence_correct;
    const cg = it.confidence_grounded;
    if (cc != null || cg != null) {
      const parts = [];
      if (cc != null) parts.push(`confidence_correct=${cc}`);
      if (cg != null) parts.push(`confidence_grounded=${cg}`);
      els.confidence.textContent = parts.join(" · ");
    } else {
      els.confidence.textContent = "";
    }
    resetDraft();
    updateProgress();
  }

  async function refreshAndShowNext() {
    setStatus("Finding an item…", "pending");
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

    const open = eligibleItems();
    updateProgress();
    if (!open.length) {
      const full = itemsFullyCovered();
      if (full >= items.length) {
        showDone(
          `All ${items.length} items already have ${TARGET()} ratings. Thank you!`
        );
      } else {
        showDone(
          `No more items available for <strong>${raterId}</strong> right now ` +
            `(you may have finished your share, or remaining slots need other raters). ` +
            `Coverage: <strong>${full}</strong> / ${items.length} items at ${TARGET()} ratings.`
        );
      }
      setStatus("", "");
      return;
    }
    showItem(pickRandom(open));
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

  async function saveLabel() {
    if (!current) return;
    syncSaveEnabled();
    if (els.save.disabled) return;

    const it = current;
    const ts = new Date().toISOString();
    const record = {
      correct: draft.correct,
      faithful: draft.faithful,
      attributed: draft.attributed,
      notes: (els.notes.value || "").trim(),
      citation_seconds: timerSeconds,
      ts,
    };
    answers[it.item_id] = record;
    saveAnswers();
    if (!coverage.has(it.item_id)) coverage.set(it.item_id, new Set());
    coverage.get(it.item_id).add(raterId);

    const payload = {
      round_id: LABELER_CONFIG.roundId,
      item_id: it.item_id,
      rater_id: raterId,
      correct: record.correct,
      faithful: record.faithful,
      attributed: record.attributed,
      notes: record.notes,
      citation_seconds: record.citation_seconds == null ? "" : record.citation_seconds,
      benchmark_id: it.benchmark_id || "",
      client: "gh-pages-rag-trust-labeler",
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
    return Object.entries(answers).map(([item_id, a]) => {
      const it = items.find((x) => x.item_id === item_id) || {};
      return {
        item_id,
        round_id: LABELER_CONFIG.roundId,
        rater_id: raterId,
        correct: a.correct,
        faithful: a.faithful,
        attributed: a.attributed,
        notes: a.notes || "",
        citation_seconds: a.citation_seconds == null ? "" : a.citation_seconds,
        benchmark_id: it.benchmark_id || "",
        labeled_at: a.ts || "",
      };
    });
  }

  function downloadCsv() {
    const rows = rowsForExport();
    const cols = [
      "item_id",
      "round_id",
      "rater_id",
      "correct",
      "faithful",
      "attributed",
      "notes",
      "citation_seconds",
      "benchmark_id",
      "labeled_at",
    ];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(
      rows.map((r) => cols.map((c) => esc(r[c] ?? "")).join(","))
    );
    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rag_trust_labels_${LABELER_CONFIG.roundId}_${raterId || "anon"}.csv`;
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
        "No Sheet URL — labels stay local + CSV until you deploy Apps Script.",
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

    const res = await fetch(LABELER_CONFIG.itemsUrl);
    if (!res.ok) throw new Error(`Could not load items (${res.status})`);
    items = await res.json();
    if (!Array.isArray(items) || !items.length) {
      throw new Error("Items file is empty");
    }

    els.start.addEventListener("click", () => {
      start().catch((e) => setStatus(String(e.message || e), "err"));
    });
    els.raterId.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        start().catch((err) => setStatus(String(err.message || err), "err"));
      }
    });
    document.querySelectorAll(".btn-row button[data-dim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectDim(btn.getAttribute("data-dim"), btn.getAttribute("data-val"), btn);
      });
    });
    els.save.addEventListener("click", () => {
      saveLabel().catch((e) => setStatus(String(e.message || e), "err"));
    });
    els.timerStart.addEventListener("click", startTimer);
    els.timerStop.addEventListener("click", stopTimer);
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
      localStorage.setItem("rag-trust-labeler:how-open", els.how.open ? "1" : "0");
    });
    els.how.open = localStorage.getItem("rag-trust-labeler:how-open") !== "0";
  }

  init().catch((err) => {
    setStatus(String(err.message || err), "err");
    console.error(err);
  });
})();
