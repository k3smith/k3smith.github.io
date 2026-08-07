/* global SME_CONFIG */

(function () {
  "use strict";

  const state = {
    bank: null,
    rater: "",
    corpusKey: "",
    task: "titles",
    parentsOnly: true,
    decisions: { title: {}, concept: {} },
    sheetCoverage: { titles: new Set(), concepts: new Set() },
    statusTimer: null,
  };

  const els = {
    setup: document.getElementById("setup"),
    main: document.getElementById("main"),
    raterId: document.getElementById("rater-id"),
    btnStart: document.getElementById("btn-start"),
    setupStatus: document.getElementById("setup-status"),
    raterChip: document.getElementById("rater-chip"),
    btnExport: document.getElementById("btn-export"),
    btnSync: document.getElementById("btn-sync"),
    sheetStatus: document.getElementById("sheet-status"),
    corpusSelect: document.getElementById("corpus-select"),
    tabTitles: document.getElementById("tab-titles"),
    tabConcepts: document.getElementById("tab-concepts"),
    parentsOnly: document.getElementById("parents-only"),
    progress: document.getElementById("progress"),
    corpusNotes: document.getElementById("corpus-notes"),
    taskHelp: document.getElementById("task-help"),
    viewTitles: document.getElementById("view-titles"),
    viewConcepts: document.getElementById("view-concepts"),
  };

  function sheetUrl() {
    const u = (SME_CONFIG.sheetWebAppUrl || "").trim();
    return u || "";
  }

  function storageKey() {
    return `${SME_CONFIG.storagePrefix}:${state.rater}`;
  }

  function setSheetStatus(msg, ok) {
    if (!els.sheetStatus) return;
    els.sheetStatus.textContent = msg || "";
    els.sheetStatus.classList.toggle("ok", !!ok);
    els.sheetStatus.classList.toggle("err", msg && !ok);
    if (state.statusTimer) clearTimeout(state.statusTimer);
    if (msg) {
      state.statusTimer = setTimeout(() => {
        els.sheetStatus.textContent = sheetUrl()
          ? "Sheet connected"
          : "Sheet not configured (local only)";
        els.sheetStatus.classList.remove("ok", "err");
      }, 2500);
    }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.decisions) state.decisions = data.decisions;
    } catch (_) {
      /* ignore */
    }
  }

  function saveLocal() {
    localStorage.setItem(
      storageKey(),
      JSON.stringify({
        rater: state.rater,
        updated_at: new Date().toISOString(),
        decisions: state.decisions,
      }),
    );
    updateProgress();
    els.btnExport.disabled = false;
    if (els.btnSync) els.btnSync.disabled = !sheetUrl();
  }

  /** POST one row (or batch). Uses no-cors like CMC grounding when needed. */
  function postToSheet(payload) {
    const url = sheetUrl();
    if (!url) return Promise.resolve({ ok: true, local_only: true });
    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).then(() => ({ ok: true }));
  }

  function loadCoverage() {
    const url = sheetUrl();
    if (!url) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const cb = `_smeCov_${Date.now()}`;
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, 8000);
      function cleanup() {
        clearTimeout(timer);
        try {
          delete window[cb];
        } catch (_) {
          /* ignore */
        }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = (data) => {
        cleanup();
        state.sheetCoverage.titles = new Set();
        state.sheetCoverage.concepts = new Set();
        const titles = (data && data.titles) || [];
        const concepts = (data && data.concepts) || [];
        for (const row of titles) {
          if (row.rater_id === state.rater && row.item_id) {
            state.sheetCoverage.titles.add(row.item_id);
          }
        }
        for (const row of concepts) {
          if (row.rater_id === state.rater && row.item_id) {
            state.sheetCoverage.concepts.add(row.item_id);
          }
        }
        resolve();
      };
      const script = document.createElement("script");
      script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${cb}`;
      script.onerror = () => {
        cleanup();
        resolve();
      };
      document.body.appendChild(script);
    });
  }

  function packTitleRow(d, extra) {
    return {
      kind: "title",
      timestamp: new Date().toISOString(),
      round_id: SME_CONFIG.roundId || "",
      rater_id: state.rater,
      corpus_key: extra.corpus_key || "",
      framework_id: d.framework_id,
      competency_id: d.competency_id,
      depth: extra.depth == null ? "" : extra.depth,
      title: d.title || "",
      action: d.action,
      new_title: d.new_title || "",
      merge_into_id: d.merge_into_id || "",
      notes: d.notes || "",
      client: "sme-review",
    };
  }

  function packConceptRow(d) {
    return {
      kind: "concept",
      timestamp: new Date().toISOString(),
      round_id: SME_CONFIG.roundId || "",
      rater_id: state.rater,
      corpus_key: d.corpus_key,
      cluster_id: d.cluster_id,
      action: d.action,
      canonical_text: d.canonical_text || "",
      ksa_type: d.ksa_type || "",
      n_members: (d.statement_ids || []).length,
      statement_ids: d.statement_ids || [],
      notes: d.notes || "",
      client: "sme-review",
    };
  }

  function persistTitle(d, meta) {
    saveLocal();
    setSheetStatus(sheetUrl() ? "Saving to Sheet…" : "Saved locally");
    return postToSheet(packTitleRow(d, meta))
      .then(() => {
        state.sheetCoverage.titles.add(d.competency_id);
        setSheetStatus(
          sheetUrl() ? "Saved to Sheet + local" : "Saved locally",
          true,
        );
      })
      .catch((err) => {
        setSheetStatus(`Local ok; Sheet failed: ${err.message}`, false);
      });
  }

  function persistConcept(d) {
    saveLocal();
    setSheetStatus(sheetUrl() ? "Saving to Sheet…" : "Saved locally");
    return postToSheet(packConceptRow(d))
      .then(() => {
        state.sheetCoverage.concepts.add(d.cluster_id);
        setSheetStatus(
          sheetUrl() ? "Saved to Sheet + local" : "Saved locally",
          true,
        );
      })
      .catch((err) => {
        setSheetStatus(`Local ok; Sheet failed: ${err.message}`, false);
      });
  }

  function syncAllToSheet() {
    if (!sheetUrl()) {
      setSheetStatus("Configure sheetWebAppUrl in config.js first", false);
      return;
    }
    const rows = [];
    for (const d of Object.values(state.decisions.title)) {
      if (!d.action) continue;
      rows.push(packTitleRow(d, { corpus_key: "", depth: "" }));
    }
    for (const d of Object.values(state.decisions.concept)) {
      if (!d.action) continue;
      rows.push(packConceptRow(d));
    }
    if (!rows.length) {
      setSheetStatus("Nothing to sync", true);
      return;
    }
    setSheetStatus(`Syncing ${rows.length} rows…`);
    // Chunk to avoid Apps Script payload limits
    const chunk = 40;
    let chain = Promise.resolve();
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      chain = chain.then(() => postToSheet({ kind: "batch", rows: part }));
    }
    chain
      .then(() => setSheetStatus(`Synced ${rows.length} rows to Sheet`, true))
      .catch((err) => setSheetStatus(`Sync failed: ${err.message}`, false));
  }

  function corpus() {
    return (state.bank.corpora || []).find((c) => c.corpus_key === state.corpusKey);
  }

  function titleKey(fid, cid) {
    return `${fid}::${cid}`;
  }

  function updateProgress() {
    const c = corpus();
    if (!c) {
      els.progress.textContent = "";
      if (els.corpusNotes) els.corpusNotes.textContent = "";
      return;
    }
    if (els.corpusNotes) els.corpusNotes.textContent = c.notes || "";
    const titlesDone = (c.titles || []).filter(
      (t) => state.decisions.title[titleKey(c.framework_id, t.competency_id)],
    ).length;
    const conceptsDone = (c.concept_clusters || []).filter(
      (cl) => state.decisions.concept[cl.cluster_id],
    ).length;
    const nParents = (c.titles || []).filter((t) => Number(t.depth) === 0).length;
    els.progress.textContent = `${c.label}: titles ${titlesDone}/${c.titles.length} (${nParents} parents) · concepts ${conceptsDone}/${c.concept_clusters.length}`;
  }

  function setTask(task) {
    state.task = task;
    els.tabTitles.classList.toggle("active", task === "titles");
    els.tabConcepts.classList.toggle("active", task === "concepts");
    els.viewTitles.classList.toggle("hidden", task !== "titles");
    els.viewConcepts.classList.toggle("hidden", task !== "concepts");
    const inst = (state.bank && state.bank.instructions) || {};
    els.taskHelp.textContent = task === "titles" ? inst.titles || "" : inst.concepts || "";
    render();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function renderTitles() {
    const c = corpus();
    if (!c) return;
    const root = els.viewTitles;
    root.innerHTML = "";
    let ordered = c.titles || [];
    if (state.parentsOnly) {
      ordered = ordered.filter((t) => Number(t.depth) === 0);
    } else {
      const parents = ordered.filter((t) => Number(t.depth) === 0);
      const children = ordered.filter((t) => Number(t.depth) > 0);
      ordered = parents.concat(children);
    }

    for (const t of ordered) {
      const key = titleKey(c.framework_id, t.competency_id);
      const d = state.decisions.title[key] || { action: "" };
      const onSheet = state.sheetCoverage.titles.has(t.competency_id);
      const card = document.createElement("article");
      card.className = "card" + (d.action ? " done" : "");
      card.innerHTML = `
        <h3>${escapeHtml(t.title)}</h3>
        <div class="meta">
          ${t.depth ? "subcompetency · " : "parent · "}
          ${t.n_ksa} K/S · id <code>${t.competency_id.slice(0, 8)}</code>
          ${onSheet ? " · on Sheet" : ""}
        </div>
        <p>${escapeHtml(t.description || "")}</p>
        <p class="meta">${escapeHtml(t.ksa_sample || "")}</p>
        <div class="canonical-row rewrite-row ${d.action === "rewrite" ? "" : "hidden"}">
          <label>New title
            <input type="text" data-role="new-title" value="${escapeAttr(d.new_title || t.title)}" />
          </label>
        </div>
        <div class="canonical-row merge-row ${d.action === "merge" ? "" : "hidden"}">
          <label>Merge into competency id
            <input type="text" data-role="merge-into" value="${escapeAttr(d.merge_into_id || "")}" placeholder="full UUID of survivor" />
          </label>
        </div>
        <div class="actions"></div>
      `;
      const actions = card.querySelector(".actions");
      for (const action of ["keep", "rewrite", "merge", "drop"]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = action;
        btn.className = "ghost" + (d.action === action ? " active" : "");
        btn.addEventListener("click", () => {
          const newTitle = card.querySelector('[data-role="new-title"]').value.trim();
          const mergeInto = card.querySelector('[data-role="merge-into"]').value.trim();
          const decision = {
            framework_id: c.framework_id,
            competency_id: t.competency_id,
            title: t.title,
            action,
            new_title: action === "rewrite" ? newTitle : "",
            merge_into_id: action === "merge" ? mergeInto : "",
            notes: "",
          };
          state.decisions.title[key] = decision;
          persistTitle(decision, {
            corpus_key: c.corpus_key,
            depth: t.depth,
          }).then(() => renderTitles());
        });
        actions.appendChild(btn);
      }
      card.querySelector('[data-role="new-title"]').addEventListener("change", (e) => {
        if (!state.decisions.title[key]) return;
        state.decisions.title[key].new_title = e.target.value.trim();
        saveLocal();
      });
      card.querySelector('[data-role="merge-into"]').addEventListener("change", (e) => {
        if (!state.decisions.title[key]) return;
        state.decisions.title[key].merge_into_id = e.target.value.trim();
        saveLocal();
      });
      root.appendChild(card);
    }
  }

  function renderConcepts() {
    const c = corpus();
    if (!c) return;
    const root = els.viewConcepts;
    root.innerHTML = "";
    if (!(c.concept_clusters || []).length) {
      root.innerHTML =
        "<p class='hint'>No auto-proposed clusters (need ≥2 equivalent phrasings).</p>";
      return;
    }
    for (const cl of c.concept_clusters) {
      const d = state.decisions.concept[cl.cluster_id] || { action: "" };
      const onSheet = state.sheetCoverage.concepts.has(cl.cluster_id);
      const card = document.createElement("article");
      card.className = "card" + (d.action ? " done" : "");
      const membersHtml = cl.members
        .map(
          (m) =>
            `<div class="member"><strong>${escapeHtml(m.text)}</strong><div class="meta">${escapeHtml(m.course)} · ${escapeHtml(m.filename)}</div></div>`,
        )
        .join("");
      card.innerHTML = `
        <h3>${escapeHtml(cl.ksa_type)} · ${cl.n_members} variants · ${cl.n_courses} courses${onSheet ? " · on Sheet" : ""}</h3>
        <div class="meta">key: <code>${escapeHtml(cl.norm_key)}</code></div>
        <div class="canonical-row">
          <label>Canonical label
            <input type="text" data-role="canonical" value="${escapeAttr(d.canonical_text || cl.proposed_canonical)}" />
          </label>
        </div>
        ${membersHtml}
        <div class="actions"></div>
      `;
      const actions = card.querySelector(".actions");
      for (const action of ["same", "distinct"]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = action === "same" ? "Same concept" : "Distinct";
        btn.className = "ghost" + (d.action === action ? " active" : "");
        btn.addEventListener("click", () => {
          const canonical = card.querySelector('[data-role="canonical"]').value.trim();
          const decision = {
            corpus_key: c.corpus_key,
            cluster_id: cl.cluster_id,
            action,
            canonical_text: canonical || cl.proposed_canonical,
            ksa_type: cl.ksa_type,
            statement_ids: cl.members.map((m) => m.statement_id),
          };
          state.decisions.concept[cl.cluster_id] = decision;
          persistConcept(decision).then(() => renderConcepts());
        });
        actions.appendChild(btn);
      }
      card.querySelector('[data-role="canonical"]').addEventListener("change", (e) => {
        if (!state.decisions.concept[cl.cluster_id]) return;
        state.decisions.concept[cl.cluster_id].canonical_text = e.target.value.trim();
        saveLocal();
      });
      root.appendChild(card);
    }
  }

  function render() {
    if (state.task === "titles") renderTitles();
    else renderConcepts();
    updateProgress();
  }

  function buildExport() {
    return {
      version: 1,
      rater: state.rater,
      exported_at: new Date().toISOString(),
      title_decisions: Object.values(state.decisions.title),
      concept_decisions: Object.values(state.decisions.concept),
    };
  }

  els.btnStart.addEventListener("click", async () => {
    const rater = (els.raterId.value || "").trim();
    if (!rater) {
      els.setupStatus.textContent = "Enter your initials.";
      return;
    }
    els.setupStatus.textContent = "Loading bank…";
    try {
      const res = await fetch(SME_CONFIG.bankUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${SME_CONFIG.bankUrl}`);
      state.bank = await res.json();
      if (!(state.bank.corpora || []).length) {
        throw new Error("Bank has no corpora — run cf export-sme-review first");
      }
      state.rater = rater;
      loadSaved();
      els.setupStatus.textContent = sheetUrl()
        ? "Loading Sheet coverage…"
        : "Sheet not configured — local + download only.";
      await loadCoverage();
      state.corpusKey = state.bank.corpora[0].corpus_key;
      els.corpusSelect.innerHTML = state.bank.corpora
        .map(
          (c) =>
            `<option value="${escapeAttr(c.corpus_key)}">${escapeHtml(c.label)} (${c.n_titles} titles, ${c.n_concept_clusters} concept clusters)</option>`,
        )
        .join("");
      els.corpusSelect.value = state.corpusKey;
      els.setup.classList.add("hidden");
      els.main.classList.remove("hidden");
      els.raterChip.textContent = rater;
      els.raterChip.classList.remove("hidden");
      els.btnExport.disabled = false;
      if (els.btnSync) els.btnSync.disabled = !sheetUrl();
      setSheetStatus(
        sheetUrl() ? "Sheet connected" : "Sheet not configured (local only)",
        !!sheetUrl(),
      );
      setTask("titles");
      els.setupStatus.textContent = "";
    } catch (err) {
      els.setupStatus.textContent = String(err.message || err);
    }
  });

  els.corpusSelect.addEventListener("change", () => {
    state.corpusKey = els.corpusSelect.value;
    render();
  });

  if (els.parentsOnly) {
    els.parentsOnly.addEventListener("change", () => {
      state.parentsOnly = !!els.parentsOnly.checked;
      render();
    });
  }

  els.tabTitles.addEventListener("click", () => setTask("titles"));
  els.tabConcepts.addEventListener("click", () => setTask("concepts"));

  els.btnExport.addEventListener("click", () => {
    const payload = buildExport();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sme_review_${state.rater}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  if (els.btnSync) {
    els.btnSync.addEventListener("click", () => syncAllToSheet());
  }
})();
