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
    metaCorpus: document.getElementById("meta-corpus"),
    metaSource: document.getElementById("meta-source"),
    tokens: document.getElementById("tokens"),
    feedback: document.getElementById("feedback"),
    status: document.getElementById("status"),
    save: document.getElementById("save"),
    none: document.getElementById("none"),
    download: document.getElementById("download"),
    downloadDone: document.getElementById("download-done"),
    reset: document.getElementById("reset"),
    roundBadge: document.getElementById("round-badge"),
    sheetWarn: document.getElementById("sheet-warn"),
    doneMsg: document.getElementById("done-msg"),
    how: document.getElementById("how"),
    setupStatus: null,
  };

  /** @type {Array<{sent_id:string,tokens:string[],corpus:string,source?:string,gold_skill?:string[],gold_knowledge?:string[]}>} */
  let sentences = [];
  /** sent_id → {tags_skill, tags_knowledge, ts, metrics?} */
  let answers = {};
  /** sent_id → Set of rater_ids */
  let coverage = new Map();
  /** @type {typeof sentences[0]|null} */
  let current = null;
  let raterId = "";
  /** @type {"knowledge"|"skill"|"clear"} */
  let paintMode = "skill";
  /** @type {("O"|"B"|"I")[]} */
  let tagsSkill = [];
  /** @type {("O"|"B"|"I")[]} */
  let tagsKnowledge = [];
  let dragStart = null;
  let dragging = false;

  function storageKey() {
    return `ks-labeler:${LABELER_CONFIG.roundId}:${raterId}`;
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
      const cb = `_ksLabelerCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sheet coverage timed out"));
      }, 8000);
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
      const sid = (row.sent_id || "").trim();
      const rid = (row.rater_id || "").trim();
      if (!sid || !rid) continue;
      if (!coverage.has(sid)) coverage.set(sid, new Set());
      coverage.get(sid).add(rid);
    }
    for (const sid of Object.keys(answers)) {
      if (!coverage.has(sid)) coverage.set(sid, new Set());
      coverage.get(sid).add(raterId);
    }
  }

  function ratersFor(sentId) {
    return coverage.get(sentId) || new Set();
  }

  function eligibleSentences() {
    const t = TARGET();
    return sentences.filter((s) => {
      const set = ratersFor(s.sent_id);
      return set.size < t && !set.has(raterId);
    });
  }

  function sentencesFullyCovered() {
    const t = TARGET();
    return sentences.filter((s) => ratersFor(s.sent_id).size >= t).length;
  }

  function updateProgress() {
    const mine = Object.keys(answers).length;
    const full = sentencesFullyCovered();
    const total = sentences.length;
    const t = TARGET();
    els.progressText.textContent = `Your labels: ${mine} · Sentences with ${t} ratings: ${full} / ${total}`;
    els.progressFill.style.width = total ? `${(100 * full) / total}%` : "0%";
    if (els.coverageText) {
      const open = eligibleSentences().length;
      els.coverageText.textContent = open
        ? `${open} sentences still available for you`
        : "No sentences left for you right now";
    }
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function bioFromSpans(n, spans) {
    const tags = Array(n).fill("O");
    for (const [s, e] of spans) {
      if (s < 0 || e > n || s >= e) continue;
      tags[s] = "B";
      for (let i = s + 1; i < e; i++) tags[i] = "I";
    }
    return tags;
  }

  /** Merge same-type spans that touch (no O between). Paint order can leave B|B. */
  function coalesceAdjacentSpans(spans) {
    if (!spans.length) return spans;
    const sorted = spans.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [[sorted[0][0], sorted[0][1], sorted[0][2]]];
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      const prev = out[out.length - 1];
      if (cur[2] === prev[2] && cur[0] <= prev[1]) {
        prev[1] = Math.max(prev[1], cur[1]);
      } else {
        out.push([cur[0], cur[1], cur[2]]);
      }
    }
    return out;
  }

  function spansFromBio(tags, type) {
    const spans = [];
    let start = null;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      if (t === "B") {
        if (start !== null) spans.push([start, i, type]);
        start = i;
      } else if (t === "I") {
        if (start === null) start = i;
      } else {
        if (start !== null) spans.push([start, i, type]);
        start = null;
      }
    }
    if (start !== null) spans.push([start, tags.length, type]);
    return coalesceAdjacentSpans(spans);
  }

  function overlapF1(gold, pred) {
    if (!gold.length && !pred.length) return 1;
    if (!gold.length || !pred.length) return 0;
    const used = new Set();
    let tp = 0;
    for (const g of gold) {
      let best = -1;
      let bestJ = -1;
      for (let j = 0; j < pred.length; j++) {
        if (used.has(j)) continue;
        const p = pred[j];
        if (g[2] !== p[2]) continue;
        if (g[0] < p[1] && p[0] < g[1]) {
          const inter = Math.min(g[1], p[1]) - Math.max(g[0], p[0]);
          const union = Math.max(g[1], p[1]) - Math.min(g[0], p[0]);
          const score = inter / (union || 1);
          if (score > best) {
            best = score;
            bestJ = j;
          }
        }
      }
      if (bestJ >= 0) {
        used.add(bestJ);
        tp += 1;
      }
    }
    const prec = tp / pred.length;
    const rec = tp / gold.length;
    if (prec + rec === 0) return 0;
    return (2 * prec * rec) / (prec + rec);
  }

  function setPaintMode(mode) {
    paintMode = mode;
    document.querySelectorAll(".paint").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
  }

  function paintRange(i0, i1, mode) {
    const lo = Math.min(i0, i1);
    const hi = Math.max(i0, i1);
    if (mode === "clear") {
      for (let i = lo; i <= hi; i++) {
        tagsSkill[i] = "O";
        tagsKnowledge[i] = "O";
      }
    } else if (mode === "skill") {
      for (let i = lo; i <= hi; i++) {
        tagsKnowledge[i] = "O";
        tagsSkill[i] = i === lo ? "B" : "I";
      }
      // fix B if continuing an existing skill span to the left
      if (lo > 0 && tagsSkill[lo - 1] !== "O") tagsSkill[lo] = "I";
      for (let i = lo + 1; i <= hi; i++) {
        if (tagsSkill[i] !== "O") tagsSkill[i] = "I";
      }
      if (tagsSkill[lo] === "O") tagsSkill[lo] = "B";
      // normalize skill spans in range
      const skillSpans = spansFromBio(tagsSkill, "skill");
      tagsSkill = bioFromSpans(tagsSkill.length, skillSpans.map((s) => [s[0], s[1]]));
    } else if (mode === "knowledge") {
      for (let i = lo; i <= hi; i++) {
        tagsSkill[i] = "O";
        tagsKnowledge[i] = i === lo ? "B" : "I";
      }
      if (lo > 0 && tagsKnowledge[lo - 1] !== "O") tagsKnowledge[lo] = "I";
      const knowSpans = spansFromBio(tagsKnowledge, "knowledge");
      tagsKnowledge = bioFromSpans(
        tagsKnowledge.length,
        knowSpans.map((s) => [s[0], s[1]])
      );
    }
    renderTokens();
  }

  function tokenClass(i) {
    if (tagsSkill[i] !== "O") return "tok skill";
    if (tagsKnowledge[i] !== "O") return "tok knowledge";
    return "tok";
  }

  function renderTokens() {
    if (!current) return;
    els.tokens.innerHTML = "";
    current.tokens.forEach((tok, i) => {
      const span = document.createElement("span");
      span.className = tokenClass(i);
      span.textContent = tok;
      span.dataset.i = String(i);
      span.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dragging = true;
        dragStart = i;
        span.classList.add("dragging");
      });
      span.addEventListener("mouseenter", () => {
        if (!dragging || dragStart === null) return;
        document.querySelectorAll(".tok").forEach((el) => {
          const j = Number(el.dataset.i);
          const lo = Math.min(dragStart, i);
          const hi = Math.max(dragStart, i);
          el.classList.toggle("dragging", j >= lo && j <= hi);
        });
      });
      span.addEventListener("mouseup", () => {
        if (!dragging || dragStart === null) return;
        paintRange(dragStart, i, paintMode);
        dragging = false;
        dragStart = null;
        document.querySelectorAll(".tok.dragging").forEach((el) =>
          el.classList.remove("dragging")
        );
      });
      els.tokens.appendChild(span);
    });
  }

  document.addEventListener("mouseup", () => {
    if (dragging && dragStart !== null && current) {
      // mouse released outside a token — treat as click on dragStart
      paintRange(dragStart, dragStart, paintMode);
    }
    dragging = false;
    dragStart = null;
    document.querySelectorAll(".tok.dragging").forEach((el) =>
      el.classList.remove("dragging")
    );
  });

  function showSentence(item) {
    current = item;
    tagsSkill = Array(item.tokens.length).fill("O");
    tagsKnowledge = Array(item.tokens.length).fill("O");
    els.metaCorpus.textContent = item.corpus || "unknown";
    els.metaCorpus.dataset.corpus = item.corpus || "";
    els.metaSource.textContent = item.source
      ? `source: ${item.source}`
      : item.course
        ? `course: ${item.course}`
        : "";
    els.feedback.hidden = true;
    els.feedback.innerHTML = "";
    renderTokens();
    setStatus("");
  }

  function showDone(reason) {
    els.main.hidden = true;
    els.setup.hidden = true;
    els.done.hidden = false;
    if (els.doneMsg) {
      const mine = Object.keys(answers).length;
      const full = sentencesFullyCovered();
      els.doneMsg.innerHTML =
        reason ||
        `You have labeled <strong>${mine}</strong> sentences. ` +
          `Coverage: <strong>${full}</strong> / ${sentences.length} have ${TARGET()} ratings. Thank you!`;
    }
  }

  function nextSentence() {
    const open = eligibleSentences();
    updateProgress();
    if (!open.length) {
      const full = sentencesFullyCovered();
      if (full >= sentences.length) {
        showDone(
          `All ${sentences.length} sentences already have ${TARGET()} ratings. Thank you!`
        );
      } else {
        showDone(
          `No more sentences available for <strong>${raterId}</strong> right now ` +
            `(you may have finished your share, or remaining slots need other raters). ` +
            `Coverage: <strong>${full}</strong> / ${sentences.length} at ${TARGET()} ratings.`
        );
      }
      return;
    }
    els.done.hidden = true;
    els.main.hidden = false;
    showSentence(pickRandom(open));
  }

  async function refreshAndShowNext() {
    setStatus("Finding a sentence…", "pending");
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
          `Could not read Sheet (${err.message}). Using local-only queue.`,
          "err"
        );
      }
    }
    nextSentence();
    if (!els.status.dataset.kind || els.status.dataset.kind === "pending") {
      setStatus("", "");
    }
  }

  function goldMetrics(item) {
    if (item.corpus !== "skillspan") return null;
    if (!item.gold_skill || !item.gold_knowledge) return null;
    const goldS = spansFromBio(item.gold_skill, "skill");
    const goldK = spansFromBio(item.gold_knowledge, "knowledge");
    const predS = spansFromBio(tagsSkill, "skill");
    const predK = spansFromBio(tagsKnowledge, "knowledge");
    return {
      skill_overlap_f1: Math.round(overlapF1(goldS, predS) * 1000) / 1000,
      knowledge_overlap_f1: Math.round(overlapF1(goldK, predK) * 1000) / 1000,
      combined_overlap_f1:
        Math.round(
          overlapF1(goldS.concat(goldK), predS.concat(predK)) * 1000
        ) / 1000,
    };
  }

  function spanPhrase(tokens, span) {
    return tokens.slice(span[0], span[1]).join(" ");
  }

  function classifySpanMatches(gold, pred) {
    const matched = [];
    const onlyGold = [];
    const onlyYou = [];
    const used = new Set();
    for (const g of gold) {
      let bestJ = -1;
      let best = -1;
      for (let j = 0; j < pred.length; j++) {
        if (used.has(j)) continue;
        const p = pred[j];
        if (g[2] !== p[2]) continue;
        if (g[0] < p[1] && p[0] < g[1]) {
          const inter = Math.min(g[1], p[1]) - Math.max(g[0], p[0]);
          const union = Math.max(g[1], p[1]) - Math.min(g[0], p[0]);
          const score = inter / (union || 1);
          if (score > best) {
            best = score;
            bestJ = j;
          }
        }
      }
      if (bestJ >= 0) {
        used.add(bestJ);
        matched.push({ gold: g, you: pred[bestJ], overlap: best });
      } else {
        onlyGold.push(g);
      }
    }
    for (let j = 0; j < pred.length; j++) {
      if (!used.has(j)) onlyYou.push(pred[j]);
    }
    return { matched, onlyGold, onlyYou };
  }

  function renderTokenStrip(tokens, skillTags, knowTags, title) {
    const chips = tokens
      .map((tok, i) => {
        let cls = "fb-tok";
        if (skillTags[i] && skillTags[i] !== "O") cls += " skill";
        else if (knowTags[i] && knowTags[i] !== "O") cls += " knowledge";
        return `<span class="${cls}">${escapeHtml(tok)}</span>`;
      })
      .join(" ");
    return `<div class="fb-strip"><div class="fb-strip-label">${title}</div><div class="fb-tokens">${chips}</div></div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSpanList(tokens, spans, emptyLabel) {
    if (!spans.length) return `<em>${emptyLabel}</em>`;
    return spans
      .map((sp) => {
        const kind = sp[2] === "skill" ? "Skill" : "Knowledge";
        return `<span class="fb-chip ${sp[2]}">${kind}: ${escapeHtml(spanPhrase(tokens, sp))}</span>`;
      })
      .join(" ");
  }

  function showFeedback(metrics, item) {
    /** @returns {Promise<void>} resolves when the rater dismisses (or immediately if no gold panel). */
    if (!LABELER_CONFIG.showGoldFeedback || item.corpus !== "skillspan") {
      return Promise.resolve();
    }

    const goldSkillTags = item.gold_skill || Array(item.tokens.length).fill("O");
    const goldKnowTags = item.gold_knowledge || Array(item.tokens.length).fill("O");
    const goldS = spansFromBio(goldSkillTags, "skill");
    const goldK = spansFromBio(goldKnowTags, "knowledge");
    const predS = spansFromBio(tagsSkill, "skill");
    const predK = spansFromBio(tagsKnowledge, "knowledge");
    const goldAll = goldS.concat(goldK);
    const predAll = predS.concat(predK);
    const cmp = classifySpanMatches(goldAll, predAll);
    const f1 =
      metrics ||
      {
        skill_overlap_f1: Math.round(overlapF1(goldS, predS) * 1000) / 1000,
        knowledge_overlap_f1: Math.round(overlapF1(goldK, predK) * 1000) / 1000,
        combined_overlap_f1:
          Math.round(overlapF1(goldAll, predAll) * 1000) / 1000,
      };

    let summary;
    if (!goldAll.length && !predAll.length) {
      summary =
        "<p><strong>Match:</strong> You and the experts both marked nothing in this sentence.</p>";
    } else if (!goldAll.length) {
      summary =
        "<p><strong>Experts marked nothing</strong> here (negative example). " +
        "Anything you marked is an extra relative to gold.</p>";
    } else if (!predAll.length) {
      summary =
        "<p><strong>You marked nothing</strong>, but experts marked the spans below.</p>";
    } else {
      summary = "<p><strong>Compared to experts:</strong></p><ul class='fb-list'>";
      if (cmp.matched.length) {
        summary +=
          `<li><strong>Overlapping</strong> (${cmp.matched.length}): ` +
          cmp.matched
            .map((m) => {
              const g = escapeHtml(spanPhrase(item.tokens, m.gold));
              const y = escapeHtml(spanPhrase(item.tokens, m.you));
              return g === y
                ? `<span class="fb-chip ${m.gold[2]}">${g}</span>`
                : `<span class="fb-chip ${m.gold[2]}">you “${y}” ≈ gold “${g}”</span>`;
            })
            .join(" ") +
          "</li>";
      }
      if (cmp.onlyYou.length) {
        summary +=
          `<li><strong>Only you</strong> (not in gold): ` +
          formatSpanList(item.tokens, cmp.onlyYou, "—") +
          "</li>";
      }
      if (cmp.onlyGold.length) {
        summary +=
          `<li><strong>Only experts</strong> (you missed): ` +
          formatSpanList(item.tokens, cmp.onlyGold, "—") +
          "</li>";
      }
      summary += "</ul>";
    }

    els.feedback.hidden = false;
    els.feedback.innerHTML =
      `<strong>SkillSpan gold check</strong> — your marks vs expert spans` +
      renderTokenStrip(item.tokens, tagsSkill, tagsKnowledge, "Your marks") +
      renderTokenStrip(item.tokens, goldSkillTags, goldKnowTags, "Expert gold") +
      summary +
      `<p class="muted fb-f1">Overlap F1 (skill ${f1.skill_overlap_f1} · knowledge ${f1.knowledge_overlap_f1} · combined ${f1.combined_overlap_f1})</p>` +
      `<div class="feedback-actions"><button type="button" id="feedback-next" class="feedback-next">Continue to next →</button></div>`;

    return new Promise((resolve) => {
      const btn = document.getElementById("feedback-next");
      const finish = () => {
        document.removeEventListener("keydown", onKey);
        els.feedback.hidden = true;
        els.feedback.innerHTML = "";
        resolve();
      };
      const onKey = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          finish();
        }
      };
      if (btn) btn.addEventListener("click", finish, { once: true });
      document.addEventListener("keydown", onKey);
      if (btn) btn.focus();
    });
  }

  async function postLabel(payload) {
    const url = sheetUrl();
    if (!url) return { ok: true, localOnly: true };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Sheet POST ${res.status}`);
    try {
      return await res.json();
    } catch {
      return { ok: true };
    }
  }

  async function commitLabel({ empty }) {
    if (!current) return;
    if (empty) {
      tagsSkill = Array(current.tokens.length).fill("O");
      tagsKnowledge = Array(current.tokens.length).fill("O");
    }
    const metrics = goldMetrics(current);
    const record = {
      tags_skill: tagsSkill.slice(),
      tags_knowledge: tagsKnowledge.slice(),
      ts: new Date().toISOString(),
      metrics: metrics || undefined,
    };
    answers[current.sent_id] = record;
    saveAnswers();
    if (!coverage.has(current.sent_id)) coverage.set(current.sent_id, new Set());
    coverage.get(current.sent_id).add(raterId);

    const payload = {
      round_id: LABELER_CONFIG.roundId,
      sent_id: current.sent_id,
      rater_id: raterId,
      corpus: current.corpus || "",
      source: current.source || current.course || "",
      tokens_json: JSON.stringify(current.tokens),
      tags_skill_json: JSON.stringify(tagsSkill),
      tags_knowledge_json: JSON.stringify(tagsKnowledge),
      skill_f1: metrics ? metrics.skill_overlap_f1 : "",
      knowledge_f1: metrics ? metrics.knowledge_overlap_f1 : "",
      combined_f1: metrics ? metrics.combined_overlap_f1 : "",
      notes: "",
      client: "ks-labeler",
    };

    els.save.disabled = true;
    els.none.disabled = true;
    try {
      await postLabel(payload);
      setStatus(
        sheetUrl() ? "Saved to Sheet." : "Saved locally (Sheet not configured).",
        "ok"
      );
      await showFeedback(metrics, current);
      nextSentence();
    } catch (err) {
      setStatus(
        `Sheet save failed (${err.message}). Kept locally — use Download backup CSV.`,
        "err"
      );
    } finally {
      els.save.disabled = false;
      els.none.disabled = false;
    }
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCsv() {
    const header = [
      "timestamp",
      "round_id",
      "sent_id",
      "rater_id",
      "corpus",
      "tokens_json",
      "tags_skill_json",
      "tags_knowledge_json",
      "skill_f1",
      "knowledge_f1",
      "combined_f1",
    ];
    const lines = [header.join(",")];
    for (const [sid, ans] of Object.entries(answers)) {
      const item = sentences.find((s) => s.sent_id === sid);
      lines.push(
        [
          ans.ts || "",
          LABELER_CONFIG.roundId,
          sid,
          raterId,
          (item && item.corpus) || "",
          csvEscape(JSON.stringify((item && item.tokens) || [])),
          csvEscape(JSON.stringify(ans.tags_skill || [])),
          csvEscape(JSON.stringify(ans.tags_knowledge || [])),
          (ans.metrics && ans.metrics.skill_overlap_f1) || "",
          (ans.metrics && ans.metrics.knowledge_overlap_f1) || "",
          (ans.metrics && ans.metrics.combined_overlap_f1) || "",
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ks-labels-${LABELER_CONFIG.roundId}-${raterId || "anon"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function startSession() {
    raterId = (els.raterId.value || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!raterId) {
      els.raterId.focus();
      setStatus("Please enter your name or initials.", "err");
      return;
    }
    if (!sentences.length) {
      setStatus("Sentence bank not loaded yet. Wait a moment and try again.", "err");
      return;
    }
    loadAnswers();
    // Keep UI visible while Sheet coverage loads (avoid a blank page).
    els.setup.hidden = true;
    if (els.how) els.how.open = false;
    els.done.hidden = true;
    els.main.hidden = false;
    setStatus("Loading coverage…", "pending");
    els.tokens.innerHTML = "<span class='muted'>Loading…</span>";
    await refreshAndShowNext();
  }

  // Status lives in #main; mirror onto setup so errors show before the session starts.
  els.setupStatus = document.createElement("p");
  els.setupStatus.className = "status";
  els.setupStatus.id = "setup-status";
  els.setupStatus.setAttribute("role", "status");
  if (els.setup) els.setup.appendChild(els.setupStatus);

  async function init() {
    els.roundBadge.textContent = LABELER_CONFIG.roundTitle || LABELER_CONFIG.roundId;
    if (!sheetUrl()) els.sheetWarn.hidden = false;

    els.start.disabled = true;
    setStatus("Loading sentences…", "pending");

    const res = await fetch(LABELER_CONFIG.sentencesUrl);
    if (!res.ok) throw new Error(`Could not load sentences (${res.status})`);
    const data = await res.json();
    sentences = Array.isArray(data) ? data : [];
    if (!sentences.length) throw new Error("Sentence bank is empty");

    setStatus(`${sentences.length} sentences ready. Enter initials to start.`, "ok");
    els.start.disabled = false;

    document.querySelectorAll(".paint").forEach((btn) => {
      btn.addEventListener("click", () => setPaintMode(btn.dataset.mode));
    });
    setPaintMode("skill");

    els.start.addEventListener("click", () => {
      startSession().catch((e) => {
        console.error(e);
        setStatus(String(e.message || e), "err");
        els.setup.hidden = false;
      });
    });
    els.raterId.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        startSession().catch((err) => {
          console.error(err);
          setStatus(String(err.message || err), "err");
          els.setup.hidden = false;
        });
      }
    });
    els.save.addEventListener("click", () => {
      commitLabel({ empty: false }).catch((e) =>
        setStatus(String(e.message || e), "err")
      );
    });
    els.none.addEventListener("click", () => {
      commitLabel({ empty: true }).catch((e) =>
        setStatus(String(e.message || e), "err")
      );
    });
    els.download.addEventListener("click", downloadCsv);
    els.downloadDone.addEventListener("click", downloadCsv);
    els.reset.addEventListener("click", () => {
      if (!confirm("Clear your local labels for this round on this browser?")) return;
      answers = {};
      saveAnswers();
      location.reload();
    });

    document.addEventListener("keydown", (e) => {
      if (els.main.hidden) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"))
        return;
      if (e.key === "1") setPaintMode("knowledge");
      if (e.key === "2") setPaintMode("skill");
      if (e.key === "3") setPaintMode("clear");
      if (e.key === "0") {
        commitLabel({ empty: true }).catch((err) =>
          setStatus(String(err.message || err), "err")
        );
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitLabel({ empty: false }).catch((err) =>
          setStatus(String(err.message || err), "err")
        );
      }
    });
  }

  init().catch((err) => {
    console.error(err);
    setStatus(String(err.message || err), "err");
    if (els.sheetWarn) {
      els.sheetWarn.hidden = false;
      els.sheetWarn.textContent = `Could not start labeler: ${err.message || err}`;
    }
    if (els.start) els.start.disabled = true;
  });
})();
