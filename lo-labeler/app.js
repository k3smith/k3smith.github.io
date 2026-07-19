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
    book: document.getElementById("meta-book"),
    section: document.getElementById("meta-section"),
    candidate: document.getElementById("text-candidate"),
    course: document.getElementById("text-course"),
    status: document.getElementById("status"),
    download: document.getElementById("download"),
    downloadDone: document.getElementById("download-done"),
    reset: document.getElementById("reset"),
    how: document.getElementById("how"),
    roundBadge: document.getElementById("round-badge"),
    sheetWarn: document.getElementById("sheet-warn"),
    doneMsg: document.getElementById("done-msg"),
  };

  /** @type {{pair_id:string,book:string,section:string,candidate:string,course:string}[]} */
  let pairs = [];
  /** Local cache: pair_id → {label, ts} for this rater */
  let answers = {};
  /** pair_id → Set of rater_ids from Sheet (+ local) */
  let coverage = new Map();
  /** @type {{pair_id:string,book:string,section:string,candidate:string,course:string}|null} */
  let current = null;
  let raterId = "";

  function storageKey() {
    return `lo-labeler:${LABELER_CONFIG.roundId}:${raterId}`;
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

  /** JSONP GET — reliable from GitHub Pages → Apps Script. */
  function fetchCoverageJsonp() {
    const url = sheetUrl();
    if (!url) {
      return Promise.resolve({ ok: true, target: TARGET(), labels: [] });
    }
    return new Promise((resolve, reject) => {
      const cb = `_loLabelerCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
      const pid = (row.pair_id || "").trim();
      const rid = (row.rater_id || "").trim();
      if (!pid || !rid) continue;
      if (!coverage.has(pid)) coverage.set(pid, new Set());
      coverage.get(pid).add(rid);
    }
    // This rater's local answers count even if Sheet POST is briefly behind
    for (const pid of Object.keys(answers)) {
      if (!coverage.has(pid)) coverage.set(pid, new Set());
      coverage.get(pid).add(raterId);
    }
  }

  function ratersFor(pairId) {
    return coverage.get(pairId) || new Set();
  }

  function eligiblePairs() {
    const t = TARGET();
    return pairs.filter((p) => {
      const s = ratersFor(p.pair_id);
      return s.size < t && !s.has(raterId);
    });
  }

  function pairsFullyCovered() {
    const t = TARGET();
    return pairs.filter((p) => ratersFor(p.pair_id).size >= t).length;
  }

  function updateProgress() {
    const mine = Object.keys(answers).length;
    const full = pairsFullyCovered();
    const total = pairs.length;
    const t = TARGET();
    els.progressText.textContent = `Your labels: ${mine} · Pairs with ${t} ratings: ${full} / ${total}`;
    els.progressFill.style.width = total ? `${(100 * full) / total}%` : "0%";
    if (els.coverageText) {
      const open = eligiblePairs().length;
      els.coverageText.textContent = open
        ? `${open} pairs still available for you`
        : "No pairs left for you right now";
    }
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function showDone(reason) {
    els.main.hidden = true;
    els.done.hidden = false;
    const mine = Object.keys(answers).length;
    const full = pairsFullyCovered();
    const t = TARGET();
    if (els.doneMsg) {
      els.doneMsg.innerHTML =
        reason ||
        `You have labeled <strong>${mine}</strong> pairs. ` +
          `Study coverage: <strong>${full}</strong> / ${pairs.length} pairs have ${t} ratings. Thank you!`;
    }
  }

  function showPair(p) {
    current = p;
    els.done.hidden = true;
    els.main.hidden = false;
    els.book.textContent = p.book || "—";
    els.section.textContent = p.section || "—";
    els.candidate.textContent = p.candidate;
    els.course.textContent = p.course;
    updateProgress();
  }

  async function refreshAndShowNext() {
    setStatus("Finding a pair…", "pending");
    try {
      const data = await fetchCoverageJsonp();
      if (data && data.target) {
        LABELER_CONFIG.targetRatings = data.target;
      }
      rebuildCoverage(data && data.labels);
    } catch (err) {
      // Offline / misconfigured: still use local-only coverage
      rebuildCoverage([]);
      if (sheetUrl()) {
        setStatus(
          `Could not read Sheet (${err.message}). Showing local-only queue.`,
          "warn"
        );
      }
    }

    const open = eligiblePairs();
    updateProgress();
    if (!open.length) {
      const full = pairsFullyCovered();
      if (full >= pairs.length) {
        showDone(
          `All ${pairs.length} pairs already have ${TARGET()} ratings. Thank you!`
        );
      } else {
        showDone(
          `No more pairs available for <strong>${raterId}</strong> right now ` +
            `(you may have finished your share, or remaining slots need other raters). ` +
            `Coverage: <strong>${full}</strong> / ${pairs.length} pairs at ${TARGET()} ratings.`
        );
      }
      setStatus("", "");
      return;
    }
    showPair(pickRandom(open));
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

  async function label(choice) {
    if (!current || !["match", "partial", "no"].includes(choice)) return;
    const p = current;
    const ts = new Date().toISOString();
    answers[p.pair_id] = { label: choice, ts };
    saveAnswers();
    if (!coverage.has(p.pair_id)) coverage.set(p.pair_id, new Set());
    coverage.get(p.pair_id).add(raterId);

    const payload = {
      round_id: LABELER_CONFIG.roundId,
      pair_id: p.pair_id,
      rater_id: raterId,
      label: choice,
      book: p.book,
      section: p.section,
      candidate: p.candidate,
      course: p.course,
      notes: "",
      client: "gh-pages-labeler",
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
    return Object.entries(answers).map(([pair_id, a]) => {
      const p = pairs.find((x) => x.pair_id === pair_id) || {};
      return {
        pair_id,
        round_id: LABELER_CONFIG.roundId,
        rater_id: raterId,
        label: a.label,
        book: p.book || "",
        section: p.section || "",
        candidate: p.candidate || "",
        course: p.course || "",
        labeled_at: a.ts || "",
      };
    });
  }

  function downloadCsv() {
    const rows = rowsForExport();
    const cols = [
      "pair_id",
      "round_id",
      "rater_id",
      "label",
      "book",
      "section",
      "candidate",
      "course",
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
    a.download = `lo_labels_${LABELER_CONFIG.roundId}_${raterId || "anon"}.csv`;
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
        "Add the Google Sheet web-app URL in config.js so raters share coverage.",
        "err"
      );
      return;
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

    const res = await fetch(LABELER_CONFIG.pairsUrl);
    if (!res.ok) throw new Error(`Could not load pairs (${res.status})`);
    pairs = await res.json();
    if (!Array.isArray(pairs) || !pairs.length) {
      throw new Error("Pairs file is empty");
    }

    els.start.addEventListener("click", () => {
      start().catch((e) => setStatus(String(e.message || e), "err"));
    });
    els.raterId.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        start().catch((err) => setStatus(String(err.message || err), "err"));
      }
    });
    document.querySelectorAll("[data-label]").forEach((btn) => {
      btn.addEventListener("click", () => {
        label(btn.getAttribute("data-label")).catch((e) =>
          setStatus(String(e.message || e), "err")
        );
      });
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
      localStorage.setItem("lo-labeler:how-open", els.how.open ? "1" : "0");
    });
    els.how.open = localStorage.getItem("lo-labeler:how-open") !== "0";

    document.addEventListener("keydown", (e) => {
      if (els.main.hidden) return;
      if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "1") label("match");
      if (e.key === "2") label("partial");
      if (e.key === "3") label("no");
    });
  }

  init().catch((err) => {
    setStatus(String(err.message || err), "err");
    console.error(err);
  });
})();
