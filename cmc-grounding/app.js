/* global GROUNDING_CONFIG, GROUNDING_PROMPTS */

(function () {
  "use strict";

  const TARGET = () =>
    Number(GROUNDING_CONFIG.targetRatings) > 0
      ? Number(GROUNDING_CONFIG.targetRatings)
      : 1;

  const MAX_ITEMS = () => {
    const n = Number(GROUNDING_CONFIG.maxItemsPerFramework);
    return n > 0 ? n : 3;
  };

  const ONET_CATEGORIES = [
    "task",
    "dwa",
    "work_activity",
    "knowledge",
    "skill",
    "ability",
  ];

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
    passBanner: document.getElementById("pass-banner"),
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
    switchPass: document.getElementById("switch-pass"),
    download: document.getElementById("download"),
    downloadDone: document.getElementById("download-done"),
    startOptionalPass: document.getElementById("start-optional-pass"),
    backToSetup: document.getElementById("back-to-setup"),
    reset: document.getElementById("reset"),
    roundBadge: document.getElementById("round-badge"),
    sheetWarn: document.getElementById("sheet-warn"),
    doneMsg: document.getElementById("done-msg"),
    how: document.getElementById("how"),
  };

  /** @type {{atoms:any[],frameworks:any[],round_id?:string,framework_id?:string}} */
  let bank = { atoms: [], frameworks: DEFAULT_FRAMEWORKS };
  /** framework id → catalog JSON */
  let catalogs = {};
  /** atom_id → answer object */
  let answers = {};
  /** atom_id → Set of rater_ids */
  let coverage = new Map();
  /** @type {any|null} */
  let current = null;
  let raterId = "";
  /** @type {"cmc"|"optional"} */
  let passMode = "cmc";
  let activeFw = "engineering";
  /** @type {Record<string, any>} */
  let draft = { confidence_1to3: "2", notes: "", frameworks: {} };

  // ---------------------------------------------------------------------
  // small utils
  // ---------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function catalogFor(id) {
    return catalogs[id] || {};
  }

  function requiredIds() {
    const cfg = GROUNDING_CONFIG.requiredFrameworks || [];
    if (cfg.length) return cfg;
    return bank.frameworks.filter((f) => f.required).map((f) => f.id);
  }

  function optionalIds() {
    const cfg = GROUNDING_CONFIG.optionalFrameworks || [];
    if (cfg.length) return cfg;
    return bank.frameworks.filter((f) => !f.required).map((f) => f.id);
  }

  function frameworksForPass() {
    const req = new Set(requiredIds());
    const opt = new Set(optionalIds());
    if (passMode === "optional") {
      return bank.frameworks.filter((f) => opt.has(f.id) || req.has(f.id));
    }
    return bank.frameworks.filter((f) => req.has(f.id));
  }

  function visibleFrameworkIds() {
    if (passMode === "optional") return optionalIds();
    return requiredIds();
  }

  function storageKey() {
    return `cmc-grounding:${GROUNDING_CONFIG.roundId}:${raterId}`;
  }

  function selectedPassFromSetup() {
    const el = document.querySelector('input[name="pass-mode"]:checked');
    return el && el.value === "optional" ? "optional" : "cmc";
  }

  function setPassMode(mode) {
    passMode = mode === "optional" ? "optional" : "cmc";
    const radio = document.querySelector(
      `input[name="pass-mode"][value="${passMode}"]`
    );
    if (radio) radio.checked = true;
    activeFw = passMode === "optional" ? optionalIds()[0] || "esco" : "engineering";
    updatePassBanner();
    applyPassVisibility();
    updateChecklist();
  }

  function updatePassBanner() {
    if (!els.passBanner) return;
    if (passMode === "optional") {
      els.passBanner.className = "pass-banner optional";
      els.passBanner.innerHTML =
        "<strong>Pass 2 — ESCO / O*NET</strong> · CMC answers are kept; fill optional frameworks, then Save.";
    } else {
      els.passBanner.className = "pass-banner cmc";
      els.passBanner.innerHTML =
        "<strong>Pass 1 — CMC</strong> · Engineering + Advanced Manufacturing only. ESCO / O*NET come later.";
    }
  }

  function applyPassVisibility() {
    const show = new Set(visibleFrameworkIds());
    const req = new Set(requiredIds());
    els.fwTabs.querySelectorAll(".fw-tab").forEach((tab) => {
      const id = tab.dataset.fw;
      const visible =
        passMode === "cmc" ? req.has(id) : show.has(id) || req.has(id);
      tab.hidden = passMode === "cmc" ? !req.has(id) : !show.has(id);
      tab.classList.toggle("readonly-tab", passMode === "optional" && req.has(id));
      // In optional pass, CMC tabs stay available as read-only summary
      if (passMode === "optional" && req.has(id)) {
        tab.hidden = false;
        tab.classList.add("secondary-tab");
      } else {
        tab.classList.remove("secondary-tab");
      }
    });
    els.fwPanels.querySelectorAll(".fw-panel").forEach((panel) => {
      const id = panel.dataset.fw;
      const isReq = req.has(id);
      const isOpt = show.has(id);
      panel.classList.toggle("cmc-readonly", passMode === "optional" && isReq);
      panel.querySelectorAll("input, select, textarea, button.match-btn").forEach((el) => {
        if (el.classList.contains("copy-prompt")) return;
        if (passMode === "optional" && isReq) {
          el.disabled = true;
        } else {
          el.disabled = false;
        }
      });
      // keep remove/accept buttons enabled only on optional panels
      panel.querySelectorAll(".remove-item, .accept-facet, [data-add-select]").forEach((el) => {
        el.disabled = passMode === "optional" && isReq;
      });
    });
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

  // ---------------------------------------------------------------------
  // draft state
  // ---------------------------------------------------------------------

  function recomputeOnetDerived(onet) {
    const present = {};
    const maxImp = {};
    for (const c of ONET_CATEGORIES) {
      present[c] = false;
      maxImp[c] = null;
    }
    for (const el of onet.elements || []) {
      const c = el.category;
      if (!ONET_CATEGORIES.includes(c)) continue;
      present[c] = true;
      if (typeof el.importance === "number" && !Number.isNaN(el.importance)) {
        maxImp[c] = maxImp[c] == null ? el.importance : Math.max(maxImp[c], el.importance);
      }
    }
    onet.categories_present = present;
    onet.max_importance_by_category = maxImp;
  }

  function normalizeOnetElement(src, extra) {
    extra = extra || {};
    const rawImportance = src.importance;
    let importance = null;
    if (typeof rawImportance === "number" && !Number.isNaN(rawImportance)) {
      importance = rawImportance;
    } else if (rawImportance != null && rawImportance !== "" && !Number.isNaN(Number(rawImportance))) {
      importance = Number(rawImportance);
    }
    return {
      category: src.category || src.facet || "",
      element_id: src.element_id || src.id || "",
      element_name: src.element_name || src.name || "",
      importance,
      match: src.match || "",
      url: src.url || extra.url || "",
      rationale: src.rationale || "",
    };
  }

  function emptyFwState(fw) {
    if (fw.id === "esco") {
      return { match: "", notes: "", items: [] };
    }
    if (fw.id === "onet") {
      const st = {
        match: "",
        notes: "",
        soc_code: "",
        occupation_title: "",
        url: "",
        elements: [],
      };
      recomputeOnetDerived(st);
      return st;
    }
    return { match: "", notes: "", items: [] };
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

  function itemsFor(fwId) {
    const st = draft.frameworks[fwId];
    if (!st) return [];
    return fwId === "onet" ? st.elements || [] : st.items || [];
  }

  function fwDone(fwId) {
    const st = draft.frameworks && draft.frameworks[fwId];
    if (!st || !st.match) return false;
    if (st.match === "none") return true;
    return itemsFor(fwId).length >= 1;
  }

  // ---------------------------------------------------------------------
  // coverage (JSONP)
  // ---------------------------------------------------------------------

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

  function optionalDone(fwId) {
    const st = draft.frameworks[fwId];
    if (!st) return false;
    // In pass 2, empty is allowed (skip this framework); marked done if match set
    return Boolean(st.match);
  }

  function atomHasCmcAnswer(atomId) {
    const a = answers[atomId];
    if (!a) return false;
    const fws = a.frameworks || {};
    return requiredIds().every((id) => {
      const st = fws[id];
      if (!st || !st.match) return false;
      if (st.match === "none") return true;
      const items = id === "onet" ? st.elements || [] : st.items || [];
      return items.length >= 1;
    });
  }

  function atomNeedsOptional(atomId) {
    if (!atomHasCmcAnswer(atomId)) return false;
    const a = answers[atomId];
    const fws = a.frameworks || {};
    return optionalIds().some((id) => {
      const st = fws[id];
      return !st || !st.match;
    });
  }

  function eligibleAtoms() {
    const t = TARGET();
    if (passMode === "optional") {
      // Atoms this rater already finished in CMC and still missing ESCO/O*NET match
      return bank.atoms.filter((a) => atomNeedsOptional(a.atom_id));
    }
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
    if (passMode === "optional") {
      const needOpt = bank.atoms.filter((a) => atomNeedsOptional(a.atom_id)).length;
      els.progressText.textContent = `Pass 2 · You (CMC): ${mine} · Optional left: ${needOpt}`;
      els.coverageText.textContent = `Queue: ${left} · Bank: ${total}`;
      els.progressFill.style.width = `${
        mine ? Math.round((100 * (mine - needOpt)) / mine) : 0
      }%`;
    } else {
      els.progressText.textContent = `Pass 1 · You: ${mine} · Queue left: ${left} · Bank: ${total}`;
      els.coverageText.textContent = `Fully covered (≥${TARGET()}): ${full}/${total}`;
      els.progressFill.style.width = `${total ? Math.round((100 * full) / total) : 0}%`;
    }
  }

  // ---------------------------------------------------------------------
  // checklist / tabs
  // ---------------------------------------------------------------------

  function stLabel(m) {
    return m || "—";
  }

  function updateChecklist() {
    if (!els.fwChecklist) return;
    if (!draft.frameworks) draft.frameworks = {};
    const req = new Set(requiredIds());
    const opt = new Set(optionalIds());
    els.fwChecklist.innerHTML = "";
    for (const fw of bank.frameworks || []) {
      const isReq = req.has(fw.id);
      const isOpt = opt.has(fw.id);
      if (passMode === "cmc" && !isReq) continue;
      if (passMode === "optional" && !(isOpt || isReq)) continue;
      const span = document.createElement("span");
      const done = fwDone(fw.id);
      span.className = done ? "ok" : isReq && passMode === "cmc" ? "miss" : "";
      let suffix;
      if (done) suffix = stLabel((draft.frameworks[fw.id] || {}).match);
      else if (passMode === "cmc" && isReq) suffix = "needed";
      else if (passMode === "optional" && isOpt) suffix = "optional";
      else if (passMode === "optional" && isReq) suffix = "locked";
      else suffix = "optional";
      span.textContent = `${fw.label.split("(")[0].trim()}: ${suffix}`;
      els.fwChecklist.appendChild(span);
      const tab = els.fwTabs.querySelector(`[data-fw="${fw.id}"]`);
      if (tab) tab.classList.toggle("done", done);
    }
  }

  function onDraftChanged(fwId) {
    updateChecklist();
    refreshPrompt(fwId);
    setStatus("");
  }

  function syncMatchButtons(panel, match) {
    panel.querySelectorAll(".match-btn").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.match === match ? "true" : "false");
    });
  }

  function matchOptions(selected) {
    const opts = ["", ...MATCHES];
    return opts
      .map(
        (m) =>
          `<option value="${m}"${m === (selected || "") ? " selected" : ""}>${
            m || "match…"
          }</option>`
      )
      .join("");
  }

  function commonHead(fw) {
    const openLink = fw.url
      ? `<a href="${fw.url}" target="_blank" rel="noopener">Open model ↗</a>`
      : "";
    return `<h3>${escapeHtml(fw.label)} <span class="muted">(${escapeHtml(
      fw.priority || ""
    )})</span></h3>
      <p class="fw-desc">${openLink}</p>
      <div class="match-row" data-match-group></div>`;
  }

  function promptBoxHtml() {
    return `<details class="llm-box">
      <summary>LLM assist prompt</summary>
      <pre class="llm-prompt"></pre>
      <button type="button" class="secondary copy-prompt">Copy prompt</button>
    </details>`;
  }

  function panelHtml(fw) {
    if (fw.id === "esco") {
      const notes = catalogFor("esco").notes;
      return `${commonHead(fw)}
        <p class="fw-desc-sub muted">Add up to ${MAX_ITEMS()} concepts. Prefer verified ESCO URIs; use <em>none</em> if the seed list is a poor fit.${
          notes ? " " + escapeHtml(notes) : ""
        }</p>
        <div class="item-list" data-item-list></div>
        <label class="field">Add from catalog
          <select data-add-select><option value="">+ Select a seed concept…</option></select>
        </label>
        <label class="field wide">Framework notes<textarea data-f="notes" rows="2" placeholder="Optional"></textarea></label>
        ${promptBoxHtml()}`;
    }
    if (fw.id === "onet") {
      return `${commonHead(fw)}
        <p class="fw-desc-sub muted">O*NET is multi-facet: accept Task / DWA / Work activity / Knowledge
          suggestions below, or add elements manually (Abilities optional). Overall match can be
          <em>none</em> if nothing fits.</p>
        <div class="grid-2">
          <label class="field">SOC / Occupation<select data-f="soc_code"></select></label>
          <label class="field">Page URL<input data-f="url" type="url" placeholder="https://www.onetonline.org/…" /></label>
        </div>
        <div class="onet-matrix" data-onet-matrix></div>
        <div id="onet-suggestions" class="onet-suggestions"></div>
        <label class="field">Add element from catalog
          <select data-add-select><option value="">+ Select an element…</option></select>
        </label>
        <div id="onet-accepted" class="onet-accepted" data-item-list></div>
        <label class="field wide">Framework notes<textarea data-f="notes" rows="2" placeholder="Optional"></textarea></label>
        ${promptBoxHtml()}`;
    }
    const tierHint =
      fw.id === "advanced_manufacturing"
        ? " Tier 4 industry-technical is especially useful."
        : "";
    return `${commonHead(fw)}
      <p class="fw-desc-sub muted">Prefer the <strong>most specific</strong> Knowledge or Skill
        leaf (e.g. <code>4.1.4.8 Materials properties</code>), not only the parent block
        (<code>4.1</code>). Add up to ${MAX_ITEMS()} items.${tierHint}</p>
      <div class="item-list" data-item-list></div>
      <label class="field">Filter catalog
        <input type="search" data-catalog-filter placeholder="Type to filter: materials, GD&amp;T, 4.1.4…" />
      </label>
      <label class="field">Add from catalog
        <select data-add-select size="8"><option value="">+ Select a block / knowledge / skill…</option></select>
      </label>
      <datalist id="datalist-${fw.id}"></datalist>
      <label class="field wide">Framework notes<textarea data-f="notes" rows="2" placeholder="Optional"></textarea></label>
      ${promptBoxHtml()}`;
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
        onDraftChanged(fw.id);
      });
      group.appendChild(btn);
    }

    panel.querySelectorAll("[data-f]").forEach((inp) => {
      const key = inp.getAttribute("data-f");
      const evt = inp.tagName === "SELECT" ? "change" : "input";
      inp.addEventListener(evt, () => {
        draft.frameworks[fw.id][key] = inp.value;
        if (fw.id === "onet" && key === "soc_code") {
          syncOnetOccupationTitle();
          renderOnetPanel(panel);
        }
        onDraftChanged(fw.id);
      });
    });

    if (fw.id === "onet") {
      wireOnetPanel(panel);
    } else {
      renderDatalist(panel, fw);
      renderCatalogAddSelect(panel, fw);
      const filter = panel.querySelector("[data-catalog-filter]");
      if (filter) {
        filter.addEventListener("input", () => {
          panel._catalogFilter = filter.value;
          renderCatalogAddSelect(panel, fw, filter.value);
        });
      }
      const addSel = panel.querySelector("[data-add-select]");
      addSel.addEventListener("change", () => {
        const idx = addSel.value;
        addSel.value = "";
        if (idx === "") return;
        const items = catalogFor(fw.id).items || [];
        const it = items[Number(idx)];
        if (!it) return;
        const list = draft.frameworks[fw.id].items;
        if (list.length >= MAX_ITEMS()) {
          setStatus(`Max ${MAX_ITEMS()} items reached for ${fw.label}.`, "err");
          return;
        }
        if (fw.id === "esco") {
          list.push({
            uri: it.uri || "",
            preferred_label: it.preferred_label || "",
            broader_label: it.broader_label || "",
            skill_type: it.skill_type || "skill",
            match: "",
          });
        } else {
          list.push({
            ref: it.ref || "",
            title: it.title || "",
            tier: it.tier != null ? String(it.tier) : "",
            kind: it.kind || "",
            parent_ref: it.parent_ref || "",
            url: it.url || "",
            match: "",
          });
        }
        renderItemList(panel, fw);
        onDraftChanged(fw.id);
      });
    }

    const copyBtn = panel.querySelector(".copy-prompt");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => copyPrompt(panel));
    }
  }

  function renderDatalist(panel, fw) {
    const dl = panel.querySelector(`#datalist-${fw.id}`);
    if (!dl) return;
    const items = catalogFor(fw.id).items || [];
    dl.innerHTML = items
      .map((it) => `<option value="${escapeHtml(it.ref)}">${escapeHtml(it.title)}</option>`)
      .join("");
  }

  function catalogOptionLabel(fwId, it) {
    if (fwId === "esco") {
      return `${it.preferred_label || ""}${it.broader_label ? " — " + it.broader_label : ""}`;
    }
    const kind = it.kind ? `[${it.kind}] ` : "";
    const tier = it.tier != null ? ` (T${it.tier})` : "";
    const depth = typeof it.ref === "string" ? it.ref.split(".").length - 1 : 0;
    const indent = depth > 0 ? `${"·".repeat(Math.min(3, depth))} ` : "";
    return `${indent}${kind}${it.ref || ""} — ${it.title || ""}${tier}`;
  }

  function itemMatchesFilter(it, q) {
    if (!q) return true;
    const hay = `${it.ref || ""} ${it.title || ""} ${it.kind || ""} ${
      it.parent_ref || ""
    }`.toLowerCase();
    return q.split(/\s+/).every((tok) => tok && hay.includes(tok));
  }

  function renderCatalogAddSelect(panel, fw, filterText) {
    const sel = panel.querySelector("[data-add-select]");
    if (!sel) return;
    const items = catalogFor(fw.id).items || [];
    const q = (filterText != null ? filterText : panel._catalogFilter || "")
      .trim()
      .toLowerCase();
    const list = items.filter((it) => itemMatchesFilter(it, q));
    // When filtering, prefer deeper (more specific) hits first
    const ordered = q
      ? [...list].sort(
          (a, b) =>
            String(b.ref || "").split(".").length -
              String(a.ref || "").split(".").length ||
            String(a.ref).localeCompare(String(b.ref), undefined, {
              numeric: true,
            })
        )
      : list;
    const maxShow = 400;
    const slice = ordered.slice(0, maxShow);
    const placeholder =
      fw.id === "esco"
        ? "+ Select a seed concept…"
        : "+ Select a block / knowledge / skill…";
    const countNote =
      ordered.length > maxShow
        ? ` (showing ${maxShow}/${ordered.length} — refine filter)`
        : ` (${ordered.length})`;
    sel.innerHTML =
      `<option value="">${placeholder}${countNote}</option>` +
      slice
        .map((it) => {
          const idx = items.indexOf(it);
          return `<option value="${idx}" data-kind="${escapeHtml(
            it.kind || ""
          )}">${escapeHtml(catalogOptionLabel(fw.id, it))}</option>`;
        })
        .join("");
  }

  // ---------------------------------------------------------------------
  // eng / am / esco item list rendering
  // ---------------------------------------------------------------------

  function renderItemList(panel, fw) {
    const box = panel.querySelector("[data-item-list]");
    if (!box || !draft.frameworks || !draft.frameworks[fw.id]) return;
    const list = draft.frameworks[fw.id].items || [];
    box.innerHTML = "";
    list.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.idx = String(idx);
      if (fw.id === "esco") {
        row.innerHTML = `
          <input type="url" data-item-f="uri" placeholder="ESCO URI" value="${escapeHtml(item.uri)}">
          <input type="text" data-item-f="preferred_label" placeholder="Preferred label" value="${escapeHtml(item.preferred_label)}">
          <input type="text" data-item-f="broader_label" placeholder="Broader label" value="${escapeHtml(item.broader_label)}">
          <select data-item-f="skill_type"><option value="skill">skill</option><option value="knowledge">knowledge</option></select>
          <select data-item-f="match">${matchOptions(item.match)}</select>
          <button type="button" class="secondary remove-item" title="Remove">✕</button>`;
      } else {
        row.innerHTML = `
          <div class="item-head">
            <span class="pill kind-${escapeHtml(item.kind || "block")}">${escapeHtml(
              item.kind || "block"
            )}</span>
            ${item.parent_ref ? `<span class="muted">under ${escapeHtml(item.parent_ref)}</span>` : ""}
          </div>
          <input list="datalist-${fw.id}" data-item-f="ref" placeholder="Ref (e.g. 4.1.4.8)" value="${escapeHtml(item.ref)}">
          <input type="text" data-item-f="title" placeholder="Title" value="${escapeHtml(item.title)}">
          <select data-item-f="kind">
            <option value="knowledge">knowledge</option>
            <option value="skill">skill</option>
            <option value="block">block</option>
            <option value="critical_work_function">critical_work_function</option>
          </select>
          <select data-item-f="match">${matchOptions(item.match)}</select>
          <input type="url" data-item-f="url" placeholder="Block URL" value="${escapeHtml(item.url)}">
          <button type="button" class="secondary remove-item" title="Remove">✕</button>`;
      }
      box.appendChild(row);

      row.querySelectorAll("[data-item-f]").forEach((inp) => {
        const key = inp.getAttribute("data-item-f");
        if (inp.tagName === "SELECT") {
          inp.value =
            item[key] ||
            (key === "skill_type" ? "skill" : key === "kind" ? "knowledge" : "");
        }
        const evt = inp.tagName === "SELECT" ? "change" : "input";
        inp.addEventListener(evt, () => {
          item[key] = inp.value;
          if (key === "ref" && fw.id !== "esco") {
            const hit = (catalogFor(fw.id).items || []).find(
              (c) => c.ref === inp.value
            );
            if (hit) {
              item.title = hit.title || item.title;
              item.kind = hit.kind || item.kind;
              item.tier = hit.tier != null ? String(hit.tier) : item.tier;
              item.parent_ref = hit.parent_ref || item.parent_ref;
              item.url = hit.url || item.url;
              const titleInp = row.querySelector('[data-item-f="title"]');
              const kindSel = row.querySelector('[data-item-f="kind"]');
              const urlInp = row.querySelector('[data-item-f="url"]');
              if (titleInp) titleInp.value = item.title || "";
              if (kindSel) kindSel.value = item.kind || "knowledge";
              if (urlInp) urlInp.value = item.url || "";
              const head = row.querySelector(".item-head .pill");
              if (head) {
                head.className = `pill kind-${item.kind || "block"}`;
                head.textContent = item.kind || "block";
              }
            }
          }
          onDraftChanged(fw.id);
        });
      });
      row.querySelector(".remove-item").addEventListener("click", () => {
        list.splice(idx, 1);
        renderItemList(panel, fw);
        onDraftChanged(fw.id);
      });
    });
    const addSel = panel.querySelector("[data-add-select]");
    if (addSel) addSel.disabled = list.length >= MAX_ITEMS();
  }

  // ---------------------------------------------------------------------
  // O*NET panel
  // ---------------------------------------------------------------------

  function findOnetOccupation(soc) {
    const occs = catalogFor("onet").occupations || [];
    return occs.find((o) => o.soc_code === soc);
  }

  function syncOnetOccupationTitle() {
    const onet = draft.frameworks.onet;
    const occ = findOnetOccupation(onet.soc_code);
    if (occ) {
      onet.occupation_title = occ.title || "";
      if (!onet.url) onet.url = occ.url || "";
    }
  }

  function wireOnetPanel(panel) {
    const socSel = panel.querySelector('[data-f="soc_code"]');
    const occs = catalogFor("onet").occupations || [];
    socSel.innerHTML = occs
      .map(
        (o) =>
          `<option value="${escapeHtml(o.soc_code)}">${escapeHtml(o.soc_code)} — ${escapeHtml(o.title)}</option>`
      )
      .join("");

    const addSel = panel.querySelector("[data-add-select]");
    addSel.addEventListener("change", () => {
      const idx = addSel.value;
      addSel.value = "";
      if (idx === "") return;
      const pool = panel._onetAddPool || [];
      const e = pool[Number(idx)];
      if (!e) return;
      const onet = draft.frameworks.onet;
      if (!onet.elements) onet.elements = [];
      if (onet.elements.length >= MAX_ITEMS()) {
        setStatus(`Max ${MAX_ITEMS()} elements reached for O*NET.`, "err");
        return;
      }
      const occ = findOnetOccupation(onet.soc_code);
      onet.elements.push(normalizeOnetElement(e, { url: (occ && occ.url) || "" }));
      recomputeOnetDerived(onet);
      renderOnetPanel(panel);
      onDraftChanged("onet");
    });
  }

  function renderOnetMatrix(panel) {
    const box = panel.querySelector("[data-onet-matrix]");
    if (!box) return;
    const onet = draft.frameworks.onet;
    box.innerHTML = ONET_CATEGORIES.map((c) => {
      const present = onet.categories_present && onet.categories_present[c];
      const maxImp = onet.max_importance_by_category ? onet.max_importance_by_category[c] : null;
      const suffix = present ? (maxImp != null ? ` · ${maxImp}` : " · ✓") : " · —";
      return `<span class="pill facet-${escapeHtml(c)}" ${present ? "" : 'style="opacity:.45"'}>${escapeHtml(
        c
      )}${suffix}</span>`;
    }).join(" ");
  }

  function onetAcceptedKeys() {
    const elements = draft.frameworks.onet.elements || [];
    return new Set(elements.map((e) => `${e.category}|${e.element_id}`));
  }

  function acceptFacet(panel, f) {
    const onet = draft.frameworks.onet;
    if (!onet.elements) onet.elements = [];
    const key = `${f.facet}|${f.element_id || ""}`;
    if (onetAcceptedKeys().has(key)) return;
    if (onet.elements.length >= MAX_ITEMS()) {
      setStatus(`Max ${MAX_ITEMS()} elements reached for O*NET.`, "err");
      return;
    }
    const norm = normalizeOnetElement(f, {});
    if (!norm.match) norm.match = "close";
    onet.elements.push(norm);
    if (!onet.match || onet.match === "none") {
      onet.match = norm.match || "close";
      syncMatchButtons(panel, onet.match);
    }
    recomputeOnetDerived(onet);
    renderOnetPanel(panel);
    onDraftChanged("onet");
    setStatus(`Accepted ${norm.category}: ${norm.element_name}`, "ok");
  }

  function renderOnetSuggestions(panel) {
    const box = document.getElementById("onet-suggestions");
    if (!box || !current) return;
    const sug = current.onet_suggestions || {};
    const facets = sug.facets || [];
    const have = onetAcceptedKeys();
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
        const key = `${f.facet}|${f.element_id || ""}`;
        const taken = have.has(key);
        const card = document.createElement("div");
        card.className = "onet-card";
        card.innerHTML = `
          <div class="onet-card-top">
            <span class="pill facet-${escapeHtml(f.facet || "")}">${escapeHtml(f.facet || "")}</span>
            ${f.element_id ? `<code>${escapeHtml(f.element_id)}</code>` : ""}
            ${f.importance != null ? `<span class="muted">imp. ${escapeHtml(String(f.importance))}</span>` : ""}
            <span class="muted">${escapeHtml(f.match || "")}</span>
          </div>
          <div class="onet-card-name">${escapeHtml(f.element_name || "")}</div>
          <p class="onet-card-why muted">${escapeHtml(f.rationale || "")}</p>
          <div class="onet-card-actions">
            <button type="button" class="secondary accept-facet" ${taken ? "disabled" : ""}>
              ${taken ? "Accepted" : "Accept"}
            </button>
            ${f.url ? `<a href="${f.url}" target="_blank" rel="noopener">Open ↗</a>` : ""}
          </div>`;
        card.querySelector(".accept-facet").addEventListener("click", () => acceptFacet(panel, f));
        box.appendChild(card);
      }
    }
    renderOnetAccepted(panel);
  }

  function renderOnetAccepted(panel) {
    const box = document.getElementById("onet-accepted");
    if (!box) return;
    const onet = draft.frameworks.onet;
    const list = onet.elements || [];
    box.innerHTML = "";
    const head = document.createElement("p");
    head.className = "onet-sug-head";
    head.textContent = list.length ? "Accepted elements" : "No elements accepted yet.";
    box.appendChild(head);
    list.forEach((e, idx) => {
      const row = document.createElement("div");
      row.className = "item-row onet-item-row";
      row.innerHTML = `
        <span class="pill facet-${escapeHtml(e.category)}">${escapeHtml(e.category)}</span>
        <span class="onet-item-name">${escapeHtml(e.element_name)}${
          e.importance != null ? ` <span class="muted">(imp ${escapeHtml(String(e.importance))})</span>` : ""
        }</span>
        <select data-item-f="match">${matchOptions(e.match)}</select>
        ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">Open ↗</a>` : ""}
        <button type="button" class="secondary remove-item" title="Remove">✕</button>`;
      box.appendChild(row);
      row.querySelector('[data-item-f="match"]').addEventListener("change", (ev) => {
        e.match = ev.target.value;
        onDraftChanged("onet");
      });
      row.querySelector(".remove-item").addEventListener("click", () => {
        list.splice(idx, 1);
        recomputeOnetDerived(onet);
        renderOnetPanel(panel);
        onDraftChanged("onet");
      });
    });
  }

  function renderOnetAddSelect(panel) {
    const sel = panel.querySelector("[data-add-select]");
    if (!sel) return;
    const onet = draft.frameworks.onet;
    const occ = findOnetOccupation(onet.soc_code);
    const elements = (occ && occ.elements) || [];
    const have = onetAcceptedKeys();
    const pool = elements.filter((e) => !have.has(`${e.category}|${e.id}`));
    panel._onetAddPool = pool;
    sel.innerHTML =
      '<option value="">+ Select an element…</option>' +
      pool
        .map(
          (e, i) =>
            `<option value="${i}">[${escapeHtml(e.category)}] ${escapeHtml(e.name)}${
              e.importance != null ? ` (imp ${escapeHtml(String(e.importance))})` : ""
            }</option>`
        )
        .join("");
    sel.disabled = (onet.elements || []).length >= MAX_ITEMS() || pool.length === 0;
  }

  function renderOnetPanel(panel) {
    if (!draft.frameworks || !draft.frameworks.onet) return;
    const onet = draft.frameworks.onet;
    const socSel = panel.querySelector('[data-f="soc_code"]');
    if (socSel) {
      if (!onet.soc_code) {
        const sugSoc =
          current &&
          current.onet_suggestions &&
          current.onet_suggestions.occupation &&
          current.onet_suggestions.occupation.soc_code;
        onet.soc_code =
          sugSoc ||
          GROUNDING_CONFIG.defaultOnetSoc ||
          catalogFor("onet").default_soc ||
          (socSel.options[0] && socSel.options[0].value) ||
          "";
      }
      socSel.value = onet.soc_code;
      if (socSel.value !== onet.soc_code && socSel.options.length) {
        onet.soc_code = socSel.value;
      }
    }
    syncOnetOccupationTitle();
    const urlInp = panel.querySelector('[data-f="url"]');
    if (urlInp) urlInp.value = onet.url || "";
    renderOnetMatrix(panel);
    renderOnetSuggestions(panel);
    renderOnetAddSelect(panel);
  }

  // ---------------------------------------------------------------------
  // LLM prompt panel
  // ---------------------------------------------------------------------

  function refreshPrompt(fwId) {
    if (!current || !window.GROUNDING_PROMPTS) return;
    const panel = document.getElementById(`panel-${fwId}`);
    if (!panel) return;
    const pre = panel.querySelector(".llm-prompt");
    if (!pre) return;
    let catalogSlice = [];
    let cueSuggestions;
    if (fwId === "onet") {
      const occ = findOnetOccupation(draft.frameworks.onet.soc_code);
      catalogSlice = (occ && occ.elements) || [];
      cueSuggestions = current.onet_suggestions;
    } else {
      catalogSlice = catalogFor(fwId).items || [];
    }
    try {
      pre.textContent = window.GROUNDING_PROMPTS.build({
        frameworkId: fwId,
        atom: current,
        catalogSlice,
        cueSuggestions,
      });
    } catch (err) {
      pre.textContent = `Prompt build failed: ${err.message}`;
    }
  }

  function refreshAllPrompts() {
    for (const fw of bank.frameworks) refreshPrompt(fw.id);
  }

  function copyPrompt(panel) {
    const pre = panel.querySelector(".llm-prompt");
    if (!pre) return;
    const text = pre.textContent || "";
    const done = () => setStatus("Prompt copied to clipboard.", "ok");
    const fail = (err) =>
      setStatus(`Copy failed: ${err && err.message ? err.message : "unknown error"}`, "err");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done, fail));
    } else {
      fallbackCopy(text, done, fail);
    }
  }

  function fallbackCopy(text, done, fail) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) done();
      else fail(new Error("execCommand copy failed"));
    } catch (err) {
      fail(err);
    }
  }

  // ---------------------------------------------------------------------
  // atom navigation
  // ---------------------------------------------------------------------

  function showFw(id) {
    activeFw = id;
    els.fwTabs.querySelectorAll(".fw-tab").forEach((t) => {
      t.setAttribute("aria-selected", t.dataset.fw === id ? "true" : "false");
    });
    els.fwPanels.querySelectorAll(".fw-panel").forEach((p) => {
      p.hidden = p.dataset.fw !== id;
    });
    if (id === "onet") {
      const panel = document.getElementById("panel-onet");
      if (panel) renderOnetPanel(panel);
    }
    refreshPrompt(id);
  }

  function hydrateDraftFromAnswer(saved) {
    draft = blankDraft();
    if (!saved) return;
    draft.confidence_1to3 = String(saved.confidence_1to3 || "2");
    draft.notes = saved.notes || "";
    const fws = saved.frameworks || {};
    for (const fw of bank.frameworks) {
      if (fws[fw.id]) {
        draft.frameworks[fw.id] = JSON.parse(JSON.stringify(fws[fw.id]));
        if (fw.id === "onet") recomputeOnetDerived(draft.frameworks.onet);
      }
    }
  }

  function paintDraftToForm() {
    els.confidence.value = draft.confidence_1to3 || "2";
    els.globalNotes.value = draft.notes || "";
    for (const fw of bank.frameworks) {
      const panel = document.getElementById(`panel-${fw.id}`);
      if (!panel) continue;
      const st = draft.frameworks[fw.id] || emptyFwState(fw);
      syncMatchButtons(panel, st.match || "");
      const notes = panel.querySelector('[data-f="notes"]');
      if (notes) notes.value = st.notes || "";
      if (fw.id === "onet") {
        renderOnetPanel(panel);
      } else {
        renderItemList(panel, fw);
      }
    }
    applyPassVisibility();
    updateChecklist();
    refreshAllPrompts();
  }

  function showAtom(atom) {
    current = atom;
    if (passMode === "optional" && answers[atom.atom_id]) {
      hydrateDraftFromAnswer(answers[atom.atom_id]);
    } else {
      draft = blankDraft();
    }
    els.metaType.textContent = atom.atom_type || "?";
    els.metaType.className = `pill ${atom.atom_type || ""}`;
    els.metaComp.textContent = atom.source_competency_title
      ? `from: ${atom.source_competency_title}`
      : "";
    els.atomText.textContent = atom.atom_text || "";
    paintDraftToForm();
    const prefer =
      passMode === "optional"
        ? optionalIds().find((id) => !optionalDone(id)) || optionalIds()[0] || "esco"
        : "engineering";
    showFw(prefer);
    updateProgress();
    if (els.how) els.how.open = false;
  }

  function nextAtom() {
    const queue = eligibleAtoms();
    if (!queue.length) {
      els.main.hidden = true;
      els.done.hidden = false;
      if (passMode === "cmc") {
        els.doneMsg.textContent = `Pass 1 complete for you (${
          Object.keys(answers).length
        } atoms with CMC). Start Pass 2 when you want ESCO / O*NET, or download a CSV backup.`;
        if (els.startOptionalPass) els.startOptionalPass.hidden = false;
      } else {
        els.doneMsg.textContent = `Pass 2 queue is empty (${
          Object.keys(answers).length
        } local labels). You can still revisit atoms via Switch pass, or download the CSV.`;
        if (els.startOptionalPass) els.startOptionalPass.hidden = true;
      }
      updateProgress();
      return;
    }
    els.done.hidden = true;
    els.main.hidden = false;
    showAtom(queue[0]);
  }

  function validateRequired() {
    if (passMode === "optional") {
      // CMC already saved; optional frameworks may be left blank (skip atom)
      return true;
    }
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

  function returnToSetup() {
    els.main.hidden = true;
    els.done.hidden = true;
    els.setup.hidden = false;
    setStatus("");
  }

  function beginPass(mode) {
    setPassMode(mode);
    els.setup.hidden = true;
    els.done.hidden = true;
    nextAtom();
  }

  // ---------------------------------------------------------------------
  // save / CSV
  // ---------------------------------------------------------------------

  function packRow() {
    const eng = draft.frameworks.engineering || {};
    const am = draft.frameworks.advanced_manufacturing || {};
    const esco = draft.frameworks.esco || {};
    const onet = draft.frameworks.onet || {};
    const engFirst = (eng.items && eng.items[0]) || {};
    const amFirst = (am.items && am.items[0]) || {};
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
      eng_tier: engFirst.tier || "",
      eng_competency_name: engFirst.title || "",
      eng_block_url: engFirst.url || "",
      eng_notes: eng.notes || "",
      eng_items_json: JSON.stringify(eng.items || []),
      am_match: am.match || "",
      am_tier: amFirst.tier || "",
      am_competency_name: amFirst.title || "",
      am_block_url: amFirst.url || "",
      am_notes: am.notes || "",
      am_items_json: JSON.stringify(am.items || []),
      esco_match: esco.match || "",
      esco_notes: esco.notes || "",
      esco_items_json: JSON.stringify(esco.items || []),
      onet_match: onet.match || "",
      onet_soc_code: onet.soc_code || "",
      onet_occupation_title: onet.occupation_title || "",
      onet_url: onet.url || "",
      onet_notes: onet.notes || "",
      onet_elements_json: JSON.stringify(onet.elements || []),
      onet_categories_json: JSON.stringify(onet.categories_present || {}),
      onet_max_importance_json: JSON.stringify(onet.max_importance_by_category || {}),
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
    if (passMode === "optional") {
      // Unset optional frameworks count as deliberate skip for this pass
      for (const id of optionalIds()) {
        const st = draft.frameworks[id];
        if (st && !st.match) {
          st.match = "none";
        }
      }
    }
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
      "eng_items_json",
      "am_match",
      "am_tier",
      "am_competency_name",
      "am_block_url",
      "am_notes",
      "am_items_json",
      "esco_match",
      "esco_notes",
      "esco_items_json",
      "onet_match",
      "onet_soc_code",
      "onet_occupation_title",
      "onet_url",
      "onet_notes",
      "onet_elements_json",
      "onet_categories_json",
      "onet_max_importance_json",
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

  // ---------------------------------------------------------------------
  // session / init
  // ---------------------------------------------------------------------

  function startSession() {
    raterId = (els.raterId.value || "").trim().toLowerCase();
    if (!raterId) {
      setStatus("Enter your initials first.", "err");
      return;
    }
    localStorage.setItem("cmc-grounding:last-rater", raterId);
    loadAnswers();
    setPassMode(selectedPassFromSetup());
    if (passMode === "optional" && Object.keys(answers).length === 0) {
      setStatus(
        "No local CMC labels yet for these initials. Finish Pass 1 first (or load a prior browser session).",
        "err"
      );
      return;
    }
    setStatus("Loading coverage…");
    fetchCoverageJsonp()
      .then((data) => {
        rebuildCoverage(data.labels || []);
        beginPass(passMode);
        setStatus("");
      })
      .catch((err) => {
        rebuildCoverage([]);
        beginPass(passMode);
        setStatus(`Coverage offline (${err.message}); using local only.`, "err");
      });
  }

  function loadAtomsBank() {
    return fetch(GROUNDING_CONFIG.atomsUrl)
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
      });
  }

  function loadCatalogs() {
    const entries = Object.entries(GROUNDING_CONFIG.catalogs || {});
    return Promise.all(
      entries.map(([id, url]) =>
        fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`${id} ${r.status}`);
            return r.json();
          })
          .then((data) => {
            catalogs[id] = data;
          })
          .catch((err) => {
            catalogs[id] = { items: [], occupations: [] };
            setStatus(`Catalog "${id}" failed to load: ${err.message}`, "err");
          })
      )
    );
  }

  function init() {
    els.roundBadge.textContent =
      GROUNDING_CONFIG.roundTitle || GROUNDING_CONFIG.roundId;
    if (!sheetUrl()) els.sheetWarn.hidden = false;
    const last = localStorage.getItem("cmc-grounding:last-rater");
    if (last) els.raterId.value = last;
    updatePassBanner();

    els.start.addEventListener("click", startSession);
    els.save.addEventListener("click", saveCurrent);
    els.skip.addEventListener("click", () => {
      if (!current) return;
      nextAtom();
    });
    if (els.switchPass) {
      els.switchPass.addEventListener("click", returnToSetup);
    }
    if (els.startOptionalPass) {
      els.startOptionalPass.addEventListener("click", () => {
        beginPass("optional");
      });
    }
    if (els.backToSetup) {
      els.backToSetup.addEventListener("click", returnToSetup);
    }
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

    Promise.all([loadAtomsBank(), loadCatalogs()])
      .then(() => {
        draft = blankDraft();
        buildTabs();
        setPassMode("cmc");
        showFw(activeFw || "engineering");
        setStatus(`Loaded ${bank.atoms.length} atoms.`, "ok");
      })
      .catch((err) => {
        setStatus(`Failed to load atom bank: ${err.message}`, "err");
      });
  }

  init();
})();
