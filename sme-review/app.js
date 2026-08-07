/* global SME_CONFIG */

(function () {
  "use strict";

  const state = {
    bank: null,
    rater: "",
    corpusKey: "",
    task: "titles", // titles | concepts
    parentsOnly: true,
    decisions: { title: {}, concept: {} },
  };

  const els = {
    setup: document.getElementById("setup"),
    main: document.getElementById("main"),
    raterId: document.getElementById("rater-id"),
    btnStart: document.getElementById("btn-start"),
    setupStatus: document.getElementById("setup-status"),
    raterChip: document.getElementById("rater-chip"),
    btnExport: document.getElementById("btn-export"),
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

  function storageKey() {
    return `${SME_CONFIG.storagePrefix}:${state.rater}`;
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

  function save() {
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
      els.corpusNotes.textContent = "";
      return;
    }
    els.corpusNotes.textContent = c.notes || "";
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
      const card = document.createElement("article");
      card.className = "card" + (d.action ? " done" : "");
      card.innerHTML = `
        <h3>${escapeHtml(t.title)}</h3>
        <div class="meta">
          ${t.depth ? "subcompetency · " : "parent · "}
          ${t.n_ksa} K/S · id <code>${t.competency_id.slice(0, 8)}</code>
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
          state.decisions.title[key] = {
            framework_id: c.framework_id,
            competency_id: t.competency_id,
            title: t.title,
            action,
            new_title: action === "rewrite" ? newTitle : "",
            merge_into_id: action === "merge" ? mergeInto : "",
            notes: "",
          };
          save();
          renderTitles();
        });
        actions.appendChild(btn);
      }
      card.querySelector('[data-role="new-title"]').addEventListener("change", (e) => {
        if (!state.decisions.title[key]) return;
        state.decisions.title[key].new_title = e.target.value.trim();
        save();
      });
      card.querySelector('[data-role="merge-into"]').addEventListener("change", (e) => {
        if (!state.decisions.title[key]) return;
        state.decisions.title[key].merge_into_id = e.target.value.trim();
        save();
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
        "<p class='hint'>No auto-proposed clusters (need ≥2 equivalent phrasings). Induce first, then re-export the bank.</p>";
      return;
    }
    for (const cl of c.concept_clusters) {
      const d = state.decisions.concept[cl.cluster_id] || { action: "" };
      const card = document.createElement("article");
      card.className = "card" + (d.action ? " done" : "");
      const membersHtml = cl.members
        .map(
          (m) =>
            `<div class="member"><strong>${escapeHtml(m.text)}</strong><div class="meta">${escapeHtml(m.course)} · ${escapeHtml(m.filename)}</div></div>`,
        )
        .join("");
      card.innerHTML = `
        <h3>${escapeHtml(cl.ksa_type)} · ${cl.n_members} variants · ${cl.n_courses} courses</h3>
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
          state.decisions.concept[cl.cluster_id] = {
            corpus_key: c.corpus_key,
            cluster_id: cl.cluster_id,
            action,
            canonical_text: canonical || cl.proposed_canonical,
            ksa_type: cl.ksa_type,
            statement_ids: cl.members.map((m) => m.statement_id),
          };
          save();
          renderConcepts();
        });
        actions.appendChild(btn);
      }
      card.querySelector('[data-role="canonical"]').addEventListener("change", (e) => {
        if (!state.decisions.concept[cl.cluster_id]) return;
        state.decisions.concept[cl.cluster_id].canonical_text = e.target.value.trim();
        save();
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

  els.parentsOnly.addEventListener("change", () => {
    state.parentsOnly = !!els.parentsOnly.checked;
    render();
  });

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
})();
