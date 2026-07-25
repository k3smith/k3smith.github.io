/* global GROUNDING_CONFIG */

(function () {
  "use strict";

  const TARGET = () =>
    Number(GROUNDING_CONFIG.targetRatings) > 0
      ? Number(GROUNDING_CONFIG.targetRatings)
      : 1;

  const DEFAULT_FRAMEWORKS = [
    {
      id: "engineering",
      short: "eng",
      label: "Engineering (CMC)",
      priority: "primary",
      url: "https://www.careeronestop.org/CompetencyModel/competency-models/engineering.aspx",
      required: true,
    },
    {
      id: "advanced_manufacturing",
      short: "am",
      label: "Advanced Manufacturing (CMC)",
      priority: "secondary",
      url: "https://www.careeronestop.org/CompetencyModel/competency-models/advanced-manufacturing.aspx",
      required: true,
    },
    {
      id: "esco",
      short: "esco",
      label: "ESCO",
      priority: "optional",
      url: "https://esco.ec.europa.eu/en/classification/skill_main",
      required: false,
    },
    {
      id: "onet",
      short: "onet",
      label: "O*NET",
      priority: "optional",
      url: "https://www.onetonline.org/",
      required: false,
    },
  ];

  const MATCHES = ["exact", "close", "related", "none"];

  const els = {
    setup: document.getElementById("setup"),
    main: document.getElementById("main"),
    done: document.getElementById("done"),
    start: document.getElementById("start"),
    raterId: document.getElementById("rater-id"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    coverageText: document.getElementById("coverage-text"),
    metaType: document.getElementById("meta-type"),
    metaComp: document.getElementById("meta-comp"),
    atomText: document.getElementById("atom-text"),
    fwTabs: document.getElementById("fw-tabs"),
    fwPanels: document.getElementById("fw-panels"),
    fwChecklist: document.getElementById("fw-checklist"),
    confidence: document.getElementById("confidence"),
    globalNotes: document.getElementById("global-notes"),
    status: document.getElementById("status"),
    setupStatus: document.getElementById("setup-status"),
    save: document.getElementById("save"),
    skip: document.getElementById("skip"),
    download: document.getElementById("download"),
    downloadDone: document.getElementById("download-done"),
    reset: document.getElementById("reset"),
    roundBadge: document.getElementById("round-badge"),
    sheetWarn: document.getElementById("sheet-warn"),
    doneMsg: document.getElementById("done-msg"),
    how: document.getElementById("how"),
  };

  /** @type {{atoms:any[],frameworks:any[],round_id?:string,framework_id?:string}} */
  let bank = { atoms: [], frameworks: DEFAULT_FRAMEWORKS };
  /** atom_id → answer object */
  let answers = {};
  /** atom_id → Set of rater_ids */
  let coverage = new Map();
  /** @type {any|null} */
  let current = null;
  let raterId = "";
  let activeFw = "engineering";
  /** @type {Record<string, any>} */
  let draft = {};

  function requiredIds() {
    const cfg = GROUNDING_CONFIG.requiredFrameworks || [];
    if (cfg.length) return cfg;
    return bank.frameworks.filter((f) => f.required).map((f) => f.id);
  }

  function storageKey() {
    return `cmc-grounding:${GROUNDING_CONFIG.roundId}:${raterId}`;
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
    return (GROUNDING_CONFIG.sheetWebAppUrl || "").trim();
  }

  function emptyFwState(fw) {
    if (fw.id === "esco") {
      return {
        match: "",
        uri: "",
        preferred_label: "",
        broader_label: "",
        notes: "",
      };
    }
    if (fw.id === "onet") {
      return {
        match: "",
        soc_code: "",
        occupation_title: "",
        element_name: "",
        url: "",
        notes: "",
        /** @type {any[]} accepted multi-facet mappings */
        elements: [],
      };
    }
    return {
      match: "",
      tier: "",
      competency_name: "",
      block_url: "",
      notes: "",
    };
  }

  function blankDraft() {
    const d = {
      confidence_1to3: "2",
      notes: "",
      frameworks: {},
    };
    for (const fw of bank.frameworks) {
      d.frameworks[fw.id] = emptyFwState(fw);
    }
    return d;
  }

  function fetchCoverageJsonp() {
    const url = sheetUrl();
    if (!url) {
      return Promise.resolve({ ok: true, target: TARGET(), labels: [] });
    }
    return new Promise((resolve, reject) => {
      const cb = `_gndCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
      const aid = (row.atom_id || "").trim();
      const rid = (row.rater_id || "").trim();
      if (!aid || !rid) continue;
      if (!coverage.has(aid)) coverage.set(aid, new Set());
      coverage.get(aid).add(rid);
    }
    for (const aid of Object.keys(answers)) {
      if (!coverage.has(aid)) coverage.set(aid, new Set());
      coverage.get(aid).add(raterId);
    }
  }

  function ratersFor(atomId) {
    return coverage.get(atomId) || new Set();
  }

  function eligibleAtoms() {
    const t = TARGET();
    return bank.atoms.filter((a) => {
      const set = ratersFor(a.atom_id);
      return set.size < t && !set.has(raterId);
    });
  }

  function atomsFullyCovered() {
    const t = TARGET();
    return bank.atoms.filter((a) => ratersFor(a.atom_id).size >= t).length;
  }

  function updateProgress() {
    const mine = Object.keys(answers).length;
    const full = atomsFullyCovered();
    const total = bank.atoms.length;
    const left = eligibleAtoms().length;
    els.progressText.textContent = `You: ${mine} · Queue left: ${left} · Bank: ${total}`;
    els.coverageText.textContent = `Fully covered (≥${TARGET()}): ${full}/${total}`;
    els.progressFill.style.width = `${total ? Math.round((100 * full) / total) : 0}%`;
  }

  function fwDone(fwId) {
    const st = draft.frameworks[fwId];
    return !!(st && st.match);
  }

  function updateChecklist() {
    const req = new Set(requiredIds());
    els.fwChecklist.innerHTML = "";
    for (const fw of bank.frameworks) {
      const span = document.createElement("span");
      const done = fwDone(fw.id);
      const need = req.has(fw.id);
      span.className = done ? "ok" : need ? "miss" : "";
      span.textContent = `${fw.label.split("(")[0].trim()}: ${
        done ? stLabel(draft.frameworks[fw.id].match) : need ? "needed" : "optional"
      }`;
      els.fwChecklist.appendChild(span);
      const tab = els.fwTabs.querySelector(`[data-fw="${fw.id}"]`);
      if (tab) tab.classList.toggle("done", done);
    }
  }

  function stLabel(m) {
    return m || "—";
  }

  function buildTabs() {
    els.fwTabs.innerHTML = "";
    els.fwPanels.innerHTML = "";
    for (const fw of bank.frameworks) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "fw-tab";
      tab.dataset.fw = fw.id;
      tab.setAttribute("role", "tab");
      tab.textContent =
        fw.id === "engineering"
          ? "Engineering"
          : fw.id === "advanced_manufacturing"
            ? "Adv. Mfg"
            : fw.label.split("(")[0].trim();
      tab.addEventListener("click", () => showFw(fw.id));
      els.fwTabs.appendChild(tab);

      const panel = document.createElement("div");
      panel.className = "fw-panel";
      panel.dataset.fw = fw.id;
      panel.id = `panel-${fw.id}`;
      panel.hidden = true;
      panel.innerHTML = panelHtml(fw);
      els.fwPanels.appendChild(panel);
      wirePanel(panel, fw);
    }
  }

  function panelHtml(fw) {
    const openLink = fw.url
      ? `<a href="${fw.url}" target="_blank" rel="noopener">Open model ↗</a>`
      : "";
    if (fw.id === "esco") {
      return `
        <h3>${fw.label} <span class="muted">(${fw.priority})</span></h3>
        <p class="fw-desc">${openLink} — paste concept URL if found.</p>
        <div class="match-row" data-match-group></div>
        <div class="grid-2">
          <label class="field">ESCO URI<input data-f="uri" type="url" placeholder="https://esco.ec.europa.eu/…" /></label>
          <label class="field">Preferred label<input data-f="preferred_label" type="text" /></label>
          <label class="field">Broader label<input data-f="broader_label" type="text" /></label>
          <label class="field">Framework notes<input data-f="notes" type="text" /></label>
        </div>`;
    }
    if (fw.id === "onet") {
      return `
        <h3>${fw.label} <span class="muted">(${fw.priority})</span></h3>
        <p class="fw-desc">${openLink} — O*NET is multi-facet: accept Task / DWA /
          Work activity / Knowledge suggestions below (Abilities optional).
          Overall match can be <em>none</em> if nothing fits.</p>
        <div class="match-row" data-match-group></div>
        <div id="onet-suggestions" class="onet-suggestions"></div>
        <div class="grid-2">
          <label class="field">SOC code<input data-f="soc_code" type="text" placeholder="17-3027.00" /></label>
          <label class="field">Occupation title<input data-f="occupation_title" type="text" /></label>
          <label class="field">Primary element (optional summary)<input data-f="element_name" type="text" /></label>
          <label class="field">Page URL<input data-f="url" type="url" /></label>
          <label class="field wide">Framework notes<input data-f="notes" type="text" /></label>
        </div>
        <div id="onet-accepted" class="onet-accepted"></div>`;
    }
    const tierHint =
      fw.id === "advanced_manufacturing"
        ? " Tier 4 industry-technical is especially useful."
        : "";
    return `
      <h3>${fw.label} <span class="muted">(${fw.priority})</span></h3>
      <p class="fw-desc">${openLink} — copy the block URL from the address bar.${tierHint}</p>
      <div class="match-row" data-match-group></div>
      <div class="grid-2">
        <label class="field">Tier (1–5)<input data-f="tier" type="text" inputmode="numeric" maxlength="1" placeholder="e.g. 4" /></label>
        <label class="field">Competency / block name<input data-f="competency_name" type="text" /></label>
        <label class="field wide">Block URL<input data-f="block_url" type="url" placeholder="https://www.careeronestop.org/…" /></label>
        <label class="field wide">Framework notes<input data-f="notes" type="text" /></label>
      </div>`;
  }

  function wirePanel(panel, fw) {
    const group = panel.querySelector("[data-match-group]");
    for (const m of MATCHES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "match-btn";
      btn.dataset.match = m;
      btn.textContent = m;
      btn.addEventListener("click", () => {
        draft.frameworks[fw.id].match = m;
        syncMatchButtons(panel, m);
        updateChecklist();
        setStatus("");
      });
      group.appendChild(btn);
    }
    panel.querySelectorAll("[data-f]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const key = inp.getAttribute("data-f");
        draft.frameworks[fw.id][key] = inp.value;
      });
    });
  }

  function syncMatchButtons(panel, match) {
    panel.querySelectorAll(".match-btn").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.match === match ? "true" : "false");
    });
  }

  function facetKey(f) {
    return `${f.facet}|${f.element_id || ""}|${(f.element_name || "").toLowerCase()}`;
  }

  function acceptedKeys() {
    const elsAccepted = (draft.frameworks.onet && draft.frameworks.onet.elements) || [];
    return new Set(elsAccepted.map(facetKey));
  }

  function renderOnetSuggestions() {
    const box = document.getElementById("onet-suggestions");
    const acc = document.getElementById("onet-accepted");
    if (!box || !acc || !current) return;
    const sug = current.onet_suggestions || {};
    const occ = sug.occupation || {};
    const facets = sug.facets || [];
    const onet = draft.frameworks.onet;

    // Prefill occupation once if empty
    if (occ.soc_code && !onet.soc_code) {
      onet.soc_code = occ.soc_code;
      const inp = document.querySelector('#panel-onet [data-f="soc_code"]');
      if (inp) inp.value = occ.soc_code;
    }
    if (occ.title && !onet.occupation_title) {
      onet.occupation_title = occ.title;
      const inp = document.querySelector('#panel-onet [data-f="occupation_title"]');
      if (inp) inp.value = occ.title;
    }

    const have = acceptedKeys();
    box.innerHTML = "";
    if (!facets.length) {
      box.innerHTML =
        '<p class="muted">No cue-rule suggestions for this atom. Search O*NET manually or set match to <em>none</em>.</p>';
    } else {
      const head = document.createElement("p");
      head.className = "onet-sug-head";
      head.textContent = `Suggestions (${sug.method || "rules"}) — click Accept to keep:`;
      box.appendChild(head);
      for (const f of facets) {
        const card = document.createElement("div");
        card.className = "onet-card";
        const taken = have.has(facetKey(f));
        card.innerHTML = `
          <div class="onet-card-top">
            <span class="pill facet-${f.facet}">${f.facet}</span>
            ${f.element_id ? `<code>${f.element_id}</code>` : ""}
            ${f.importance != null ? `<span class="muted">imp. ${f.importance}</span>` : ""}
            <span class="muted">${f.match || ""}</span>
          </div>
          <div class="onet-card-name">${escapeHtml(f.element_name || "")}</div>
          <p class="onet-card-why muted">${escapeHtml(f.rationale || "")}</p>
          <div class="onet-card-actions">
            <button type="button" class="secondary accept-facet" ${taken ? "disabled" : ""}>
              ${taken ? "Accepted" : "Accept"}
            </button>
            ${
              f.url
                ? `<a href="${f.url}" target="_blank" rel="noopener">Open ↗</a>`
                : ""
            }
          </div>`;
        const btn = card.querySelector(".accept-facet");
        btn.addEventListener("click", () => acceptFacet(f));
        box.appendChild(card);
      }
    }
    renderAccepted();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function acceptFacet(f) {
    const onet = draft.frameworks.onet;
    if (!onet.elements) onet.elements = [];
    if (acceptedKeys().has(facetKey(f))) return;
    onet.elements.push({ ...f, accepted: true });
    if (!onet.match || onet.match === "none") {
      // Promote overall match from best accepted facet match
      onet.match = f.match || "close";
      const panel = document.getElementById("panel-onet");
      if (panel) syncMatchButtons(panel, onet.match);
    }
    if (!onet.element_name) {
      onet.element_name = f.element_name || "";
      const inp = document.querySelector('#panel-onet [data-f="element_name"]');
      if (inp) inp.value = onet.element_name;
    }
    if (f.url && !onet.url) {
      onet.url = f.url;
      const inp = document.querySelector('#panel-onet [data-f="url"]');
      if (inp) inp.value = onet.url;
    }
    updateChecklist();
    renderOnetSuggestions();
    setStatus(`Accepted ${f.facet}: ${f.element_name}`, "ok");
  }

  function removeAccepted(idx) {
    const onet = draft.frameworks.onet;
    onet.elements.splice(idx, 1);
    renderOnetSuggestions();
    updateChecklist();
  }

  function renderAccepted() {
    const acc = document.getElementById("onet-accepted");
    if (!acc) return;
    const elsList = (draft.frameworks.onet && draft.frameworks.onet.elements) || [];
    if (!elsList.length) {
      acc.innerHTML = "";
      return;
    }
    acc.innerHTML = "<strong>Accepted facets</strong>";
    const ul = document.createElement("ul");
    ul.className = "onet-accepted-list";
    elsList.forEach((f, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="pill facet-${f.facet}">${f.facet}</span> ${escapeHtml(
        f.element_name || ""
      )} `;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "secondary";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => removeAccepted(idx));
      li.appendChild(rm);
      ul.appendChild(li);
    });
    acc.appendChild(ul);
  }

  function showFw(id) {
    activeFw = id;
    els.fwTabs.querySelectorAll(".fw-tab").forEach((t) => {
      t.setAttribute("aria-selected", t.dataset.fw === id ? "true" : "false");
    });
    els.fwPanels.querySelectorAll(".fw-panel").forEach((p) => {
      p.hidden = p.dataset.fw !== id;
    });
    if (id === "onet") renderOnetSuggestions();
  }

  function paintDraftToForm() {
    els.confidence.value = draft.confidence_1to3 || "2";
    els.globalNotes.value = draft.notes || "";
    for (const fw of bank.frameworks) {
      const panel = document.getElementById(`panel-${fw.id}`);
      const st = draft.frameworks[fw.id] || emptyFwState(fw);
      syncMatchButtons(panel, st.match || "");
      panel.querySelectorAll("[data-f]").forEach((inp) => {
        const key = inp.getAttribute("data-f");
        inp.value = st[key] || "";
      });
    }
    updateChecklist();
    renderOnetSuggestions();
  }

  function showAtom(atom) {
    current = atom;
    draft = blankDraft();
    els.metaType.textContent = atom.atom_type || "?";
    els.metaType.className = `pill ${atom.atom_type || ""}`;
    els.metaComp.textContent = atom.source_competency_title
      ? `from: ${atom.source_competency_title}`
      : "";
    els.atomText.textContent = atom.atom_text || "";
    paintDraftToForm();
    showFw(activeFw || "engineering");
    updateProgress();
    if (els.how) els.how.open = false;
  }

  function nextAtom() {
    const queue = eligibleAtoms();
    if (!queue.length) {
      els.main.hidden = true;
      els.done.hidden = false;
      els.doneMsg.textContent = `No atoms left for you in this round (${
        Object.keys(answers).length
      } saved locally). Download the CSV backup if the Sheet is offline.`;
      updateProgress();
      return;
    }
    els.done.hidden = true;
    els.main.hidden = false;
    showAtom(queue[0]);
  }

  function validateRequired() {
    const missing = requiredIds().filter((id) => !fwDone(id));
    if (missing.length) {
      const labels = bank.frameworks
        .filter((f) => missing.includes(f.id))
        .map((f) => f.label)
        .join(", ");
      setStatus(`Set a match for: ${labels}`, "err");
      showFw(missing[0]);
      return false;
    }
    return true;
  }

  function packRow() {
    const eng = draft.frameworks.engineering || {};
    const am = draft.frameworks.advanced_manufacturing || {};
    const esco = draft.frameworks.esco || {};
    const onet = draft.frameworks.onet || {};
    const today = new Date().toISOString().slice(0, 10);
    return {
      timestamp: new Date().toISOString(),
      round_id: GROUNDING_CONFIG.roundId,
      atom_id: current.atom_id,
      atom_type: current.atom_type,
      atom_text: current.atom_text,
      source_competency_id: current.source_competency_id || "",
      source_competency_title: current.source_competency_title || "",
      eng_match: eng.match || "",
      eng_tier: eng.tier || "",
      eng_competency_name: eng.competency_name || "",
      eng_block_url: eng.block_url || "",
      eng_notes: eng.notes || "",
      am_match: am.match || "",
      am_tier: am.tier || "",
      am_competency_name: am.competency_name || "",
      am_block_url: am.block_url || "",
      am_notes: am.notes || "",
      esco_uri: esco.uri || "",
      esco_preferred_label: esco.preferred_label || "",
      esco_broader_label: esco.broader_label || "",
      esco_match: esco.match || "",
      onet_soc_code: onet.soc_code || "",
      onet_occupation_title: onet.occupation_title || "",
      onet_element_name: onet.element_name || "",
      onet_url: onet.url || "",
      onet_match: onet.match || "",
      onet_elements_json: JSON.stringify(onet.elements || []),
      rater_id: raterId,
      date: today,
      confidence_1to3: draft.confidence_1to3 || els.confidence.value,
      notes: draft.notes || els.globalNotes.value,
      frameworks_json: JSON.stringify(draft.frameworks),
      client: "grounding-web",
    };
  }

  function postToSheet(row) {
    const url = sheetUrl();
    if (!url) return Promise.resolve({ ok: true, local_only: true });
    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(row),
    }).then(() => ({ ok: true }));
  }

  function saveCurrent() {
    draft.confidence_1to3 = els.confidence.value;
    draft.notes = els.globalNotes.value;
    if (!validateRequired()) return;
    const row = packRow();
    answers[current.atom_id] = {
      ...row,
      frameworks: JSON.parse(JSON.stringify(draft.frameworks)),
      ts: row.timestamp,
    };
    saveAnswers();
    if (!coverage.has(current.atom_id)) coverage.set(current.atom_id, new Set());
    coverage.get(current.atom_id).add(raterId);
    setStatus("Saving…");
    postToSheet(row)
      .then(() => {
        setStatus(sheetUrl() ? "Saved to Sheet + local" : "Saved locally", "ok");
        nextAtom();
      })
      .catch((err) => {
        setStatus(`Local save ok; Sheet failed: ${err.message}`, "err");
        nextAtom();
      });
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCsv() {
    const cols = [
      "atom_id",
      "atom_type",
      "atom_text",
      "source_competency_id",
      "source_competency_title",
      "eng_match",
      "eng_tier",
      "eng_competency_name",
      "eng_block_url",
      "eng_notes",
      "am_match",
      "am_tier",
      "am_competency_name",
      "am_block_url",
      "am_notes",
      "esco_uri",
      "esco_preferred_label",
      "esco_broader_label",
      "esco_match",
      "onet_soc_code",
      "onet_occupation_title",
      "onet_element_name",
      "onet_url",
      "onet_match",
      "onet_elements_json",
      "rater_id",
      "date",
      "confidence_1to3",
      "notes",
    ];
    const rows = Object.values(answers);
    const lines = [cols.join(",")];
    for (const r of rows) {
      lines.push(cols.map((c) => csvEscape(r[c])).join(","));
    }
    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cmc_grounding_${GROUNDING_CONFIG.roundId}_${raterId || "anon"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function startSession() {
    raterId = (els.raterId.value || "").trim().toLowerCase();
    if (!raterId) {
      setStatus("Enter your initials first.", "err");
      return;
    }
    localStorage.setItem("cmc-grounding:last-rater", raterId);
    loadAnswers();
    setStatus("Loading coverage…");
    fetchCoverageJsonp()
      .then((data) => {
        rebuildCoverage(data.labels || []);
        els.setup.hidden = true;
        nextAtom();
        setStatus("");
      })
      .catch((err) => {
        rebuildCoverage([]);
        els.setup.hidden = true;
        nextAtom();
        setStatus(`Coverage offline (${err.message}); using local only.`, "err");
      });
  }

  function init() {
    els.roundBadge.textContent =
      GROUNDING_CONFIG.roundTitle || GROUNDING_CONFIG.roundId;
    if (!sheetUrl()) els.sheetWarn.hidden = false;
    const last = localStorage.getItem("cmc-grounding:last-rater");
    if (last) els.raterId.value = last;

    els.start.addEventListener("click", startSession);
    els.save.addEventListener("click", saveCurrent);
    els.skip.addEventListener("click", () => {
      if (!current) return;
      nextAtom();
    });
    els.download.addEventListener("click", downloadCsv);
    els.downloadDone.addEventListener("click", downloadCsv);
    els.reset.addEventListener("click", () => {
      if (!confirm("Clear your local labels for this round?")) return;
      answers = {};
      saveAnswers();
      rebuildCoverage([]);
      fetchCoverageJsonp()
        .then((d) => {
          rebuildCoverage(d.labels || []);
          nextAtom();
        })
        .catch(() => nextAtom());
    });
    els.confidence.addEventListener("change", () => {
      draft.confidence_1to3 = els.confidence.value;
    });
    els.globalNotes.addEventListener("input", () => {
      draft.notes = els.globalNotes.value;
    });
    document.addEventListener("keydown", (e) => {
      if (els.main.hidden) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.target.matches("input,textarea,select"))) {
        e.preventDefault();
        saveCurrent();
      }
    });

    fetch(GROUNDING_CONFIG.atomsUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`atoms ${r.status}`);
        return r.json();
      })
      .then((data) => {
        bank = {
          atoms: data.atoms || [],
          frameworks: data.frameworks || DEFAULT_FRAMEWORKS,
          round_id: data.round_id,
          framework_id: data.framework_id,
        };
        if (data.round_id) {
          GROUNDING_CONFIG.roundId = data.round_id;
        }
        buildTabs();
        showFw("engineering");
        setStatus(`Loaded ${bank.atoms.length} atoms.`, "ok");
      })
      .catch((err) => {
        setStatus(`Failed to load atom bank: ${err.message}`, "err");
      });
  }

  init();
})();
