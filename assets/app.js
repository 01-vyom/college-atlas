(function () {
  "use strict";

  const curatedInsights = window.CURATED_INSIGHTS || {};
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const schools = (window.COLLEGE_DATA || []).map((school) => {
    const curated = curatedInsights[school.name] || {};
    const enriched = {
      ...school,
      tags: curated.tags || [],
      materialsPath: curated.materialsPath || "",
      clinicalPath: curated.clinicalPath || "",
      nuance: curated.nuance || "",
      warning: curated.warning || "",
      slug: slugify(school.name),
    };
    return {
      ...enriched,
      clinicalSignal: clinicalSignal(enriched),
    };
  });

  const state = {
    track: "biomaterials",
    query: "",
    minScore: 45,
    bands: new Set([
      "Far reach by admit rate",
      "Reach by admit rate",
      "Competitive/possible by admit rate",
      "More accessible by admit rate",
    ]),
    publicOnly: false,
    californiaOnly: false,
    clinicalOnly: false,
    sort: "lens",
    analysis: "surgeon",
    selected: null,
    compare: [],
  };

  const tracks = {
    biomaterials: {
      title: "Biomaterials bridge",
      copy: "Balances materials, biology, neuro, research fit, outcomes, and some access.",
      weights: { materials: 0.28, biology: 0.28, profile: 0.25, outcomes: 0.14, access: 0.05, ca: 0 },
    },
    surgeon: {
      title: "Surgeon optionality",
      copy: "Prioritizes bio/neuro, clinical signals, outcomes, pre-med access, and still keeps materials visible.",
      weights: { materials: 0.08, biology: 0.34, profile: 0.17, outcomes: 0.24, access: 0.09, ca: 0.02, clinical: 0.06 },
    },
    materials: {
      title: "Materials-first research",
      copy: "Pushes engineering, materials science, polymer, and biomaterials depth higher in the ranking.",
      weights: { materials: 0.48, biology: 0.16, profile: 0.16, outcomes: 0.14, access: 0.06, ca: 0 },
    },
    california: {
      title: "California value",
      copy: "Emphasizes in-state public options while keeping research fit and medicine-facing biology in view.",
      weights: { materials: 0.21, biology: 0.25, profile: 0.18, outcomes: 0.17, access: 0.06, ca: 0.13 },
    },
  };

  const bandOrder = [
    "Far reach by admit rate",
    "Reach by admit rate",
    "Competitive/possible by admit rate",
    "More accessible by admit rate",
  ];

  const analysisModes = {
    surgeon: {
      title: "Surgery is a pre-med strategy, not an undergraduate major.",
      text: "For neurosurgery or any surgical specialty, the undergrad decision should optimize GPA protection, chemistry and biology access, clinical exposure, advising, research, and a college environment where the student can still stand out.",
      checks: [
        "Confirm pre-health advising quality and committee-letter process.",
        "Look for nearby hospitals, medical centers, EMT/shadowing routes, or clinical volunteering.",
        "Check whether engineering-heavy majors can be balanced with GPA-sensitive pre-med courses.",
        "Prefer neuroscience, biology, bioengineering, or computational biology options that leave time for clinical work.",
      ],
    },
    physicianScientist: {
      title: "The strongest story is medicine-facing research.",
      text: "The current profile already has a research story: scaffolded giant vesicles, lipophilic localization, cell culture, and fluorescence microscopy. Colleges with labs at the edge of biomaterials, stem-cell systems, neurodevelopment, and medicine should rise.",
      checks: [
        "Find 3-5 labs per school before applying, not after admission.",
        "Check undergraduate research programs, thesis options, summer fellowships, and hospital-linked labs.",
        "Look for MD/PhD culture even if the student eventually chooses MD-only.",
        "Preserve computational biology as a differentiator, not just a backup major.",
      ],
    },
    biomaterials: {
      title: "Biomaterials is the cleanest bridge from the current resume.",
      text: "This path connects materials science, scaffold mechanics, hydrogels, organoids, drug localization, and cell culture. It is credible for outreach emails and college essays because it explains why materials and biology belong together.",
      checks: [
        "Prioritize materials departments with bioengineering, polymer, tissue engineering, or hydrogel labs.",
        "Check if undergrads can join engineering labs without being locked into an engineering major.",
        "Look for microscopy/image-analysis facilities and cell-culture training routes.",
        "Use the ASDRP work as a theme: engineered boundaries that guide fragile biological systems.",
      ],
    },
    materials: {
      title: "Materials-first keeps engineering depth high.",
      text: "If the student later pivots away from medicine, materials science gives a rigorous engineering identity. The risk is losing clinical/neuro access unless the school has strong biomedical adjacency.",
      checks: [
        "Check ABET-style engineering rigidity versus flexibility for pre-med courses.",
        "Prioritize MSE plus bioengineering overlap, not metallurgy-only departments.",
        "Look for polymer, soft materials, biomaterials, microscopy, and nanomedicine groups.",
        "For pure engineering schools, verify hospitals and life-science research are actually accessible.",
      ],
    },
  };

  const els = {
    search: document.getElementById("searchInput"),
    scoreRange: document.getElementById("scoreRange"),
    scoreValue: document.getElementById("scoreValue"),
    bandFilters: document.getElementById("bandFilters"),
    publicOnly: document.getElementById("publicOnly"),
    californiaOnly: document.getElementById("californiaOnly"),
    clinicalOnly: document.getElementById("clinicalOnly"),
    sort: document.getElementById("sortSelect"),
    reset: document.getElementById("resetFilters"),
    trackTitle: document.getElementById("trackTitle"),
    trackCopy: document.getElementById("trackCopy"),
    countMetric: document.getElementById("countMetric"),
    topMetric: document.getElementById("topMetric"),
    caMetric: document.getElementById("caMetric"),
    clinicalMetric: document.getElementById("clinicalMetric"),
    analysisModeTitle: document.getElementById("analysisModeTitle"),
    analysisModeText: document.getElementById("analysisModeText"),
    analysisChecklist: document.getElementById("analysisChecklist"),
    portfolioCount: document.getElementById("portfolioCount"),
    portfolioGrid: document.getElementById("portfolioGrid"),
    researchPrompts: document.getElementById("researchPrompts"),
    plot: document.getElementById("plot"),
    bandBoard: document.getElementById("bandBoard"),
    cards: document.getElementById("cards"),
    resultSummary: document.getElementById("resultSummary"),
    tooltip: document.getElementById("tooltip"),
    compareTray: document.querySelector(".compare-tray"),
    detailPanel: document.querySelector(".detail-panel"),
    detailEmpty: document.getElementById("detailEmpty"),
    detailContent: document.getElementById("detailContent"),
    detailBand: document.getElementById("detailBand"),
    detailName: document.getElementById("detailName"),
    detailMeta: document.getElementById("detailMeta"),
    detailScore: document.getElementById("detailScore"),
    detailBars: document.getElementById("detailBars"),
    detailWhy: document.getElementById("detailWhy"),
    detailCaution: document.getElementById("detailCaution"),
    detailTags: document.getElementById("detailTags"),
    detailNuance: document.getElementById("detailNuance"),
    detailMaterialsPath: document.getElementById("detailMaterialsPath"),
    detailClinicalPath: document.getElementById("detailClinicalPath"),
    detailVerification: document.getElementById("detailVerification"),
    detailPrograms: document.getElementById("detailPrograms"),
    compareDetail: document.getElementById("compareDetail"),
    closeDetail: document.getElementById("closeDetail"),
    compareGrid: document.getElementById("compareGrid"),
    clearCompare: document.getElementById("clearCompare"),
    canvas: document.getElementById("pathwayCanvas"),
  };

  initControls();
  initCanvas();
  render();

  function initControls() {
    els.search.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      render();
    });

    els.scoreRange.addEventListener("input", (event) => {
      state.minScore = Number(event.target.value);
      els.scoreValue.textContent = String(state.minScore);
      render();
    });

    document.querySelectorAll(".seg-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.track = button.dataset.track;
        document.querySelectorAll(".seg-button").forEach((item) => item.classList.toggle("active", item === button));
        render();
      });
    });

    document.querySelectorAll(".analysis-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.analysis = button.dataset.analysis;
        document.querySelectorAll(".analysis-tab").forEach((item) => item.classList.toggle("active", item === button));
        renderAnalysis(currentRows());
      });
    });

    els.bandFilters.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.bands.add(input.value);
        } else {
          state.bands.delete(input.value);
        }
        render();
      });
    });

    els.publicOnly.addEventListener("change", () => {
      state.publicOnly = els.publicOnly.checked;
      render();
    });

    els.californiaOnly.addEventListener("change", () => {
      state.californiaOnly = els.californiaOnly.checked;
      render();
    });

    els.clinicalOnly.addEventListener("change", () => {
      state.clinicalOnly = els.clinicalOnly.checked;
      render();
    });

    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      render();
    });

    els.reset.addEventListener("click", () => {
      state.query = "";
      state.minScore = 45;
      state.bands = new Set(bandOrder);
      state.publicOnly = false;
      state.californiaOnly = false;
      state.clinicalOnly = false;
      state.sort = "lens";
      els.search.value = "";
      els.scoreRange.value = "45";
      els.scoreValue.textContent = "45";
      els.publicOnly.checked = false;
      els.californiaOnly.checked = false;
      els.clinicalOnly.checked = false;
      els.sort.value = "lens";
      els.bandFilters.querySelectorAll("input").forEach((input) => {
        input.checked = true;
      });
      render();
    });

    els.closeDetail.addEventListener("click", () => {
      state.selected = null;
      renderDetail(null);
    });

    els.compareDetail.addEventListener("click", () => {
      const selected = schools.find((school) => school.slug === state.selected);
      if (selected) toggleCompare(selected);
    });

    els.clearCompare.addEventListener("click", () => {
      state.compare = [];
      renderCompare();
      renderCards(currentRows());
    });

    window.addEventListener("resize", debounce(render, 120));
  }

  function currentRows() {
    return filtered().sort(compareSchools);
  }

  function filtered() {
    return schools
      .map((school) => ({ ...school, lensScore: lensScore(school) }))
      .filter((school) => school.lensScore >= state.minScore)
      .filter((school) => state.bands.has(school.band))
      .filter((school) => !state.publicOnly || school.control === "Public")
      .filter((school) => !state.californiaOnly || school.state === "CA")
      .filter((school) => !state.clinicalOnly || school.clinicalSignal > 0)
      .filter((school) => {
        if (!state.query) return true;
        const text = [
          school.name,
          school.city,
          school.state,
          school.programs,
          school.why_apply,
          school.tags.join(" "),
          school.materialsPath,
          school.clinicalPath,
          school.nuance,
          school.warning,
        ].join(" ").toLowerCase();
        return text.includes(state.query);
      });
  }

  function compareSchools(a, b) {
    if (state.sort === "admit") return safe(b.admit_rate) - safe(a.admit_rate);
    if (state.sort === "materials") return safe(b.materials_score) - safe(a.materials_score);
    if (state.sort === "biology") return safe(b.biology_score) - safe(a.biology_score);
    if (state.sort === "outcomes") return safe(b.outcomes_score) - safe(a.outcomes_score);
    if (state.sort === "netprice") return safe(a.net_price, 999999) - safe(b.net_price, 999999);
    return b.lensScore - a.lensScore;
  }

  function render() {
    const rows = currentRows();
    els.trackTitle.textContent = tracks[state.track].title;
    els.trackCopy.textContent = tracks[state.track].copy;
    renderStats(rows);
    renderAnalysis(rows);
    renderPlot(rows);
    renderBoard(rows);
    renderCards(rows);
    renderCompare();
    renderDetail(schools.find((school) => school.slug === state.selected) || null);
  }

  function renderAnalysis(rows) {
    const mode = analysisModes[state.analysis];
    els.analysisModeTitle.textContent = mode.title;
    els.analysisModeText.textContent = mode.text;
    replaceChildren(els.analysisChecklist);
    mode.checks.forEach((text) => {
      const item = document.createElement("div");
      item.className = "check-item";
      item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
      const span = document.createElement("span");
      span.textContent = text;
      item.appendChild(span);
      els.analysisChecklist.appendChild(item);
    });

    const buckets = [
      ["Far reach", "Far reach by admit rate", 4],
      ["Reach", "Reach by admit rate", 4],
      ["Competitive", "Competitive/possible by admit rate", 5],
      ["Likely-ish", "More accessible by admit rate", 5],
    ];
    const picks = buckets.map(([label, band, limit]) => ({
      label,
      schools: rows.filter((school) => school.band === band).slice(0, limit),
    }));
    const total = picks.reduce((sum, bucket) => sum + bucket.schools.length, 0);
    els.portfolioCount.textContent = `${total} picks`;
    replaceChildren(els.portfolioGrid);
    picks.forEach((bucket) => {
      const section = document.createElement("div");
      section.className = "portfolio-bucket";
      const heading = document.createElement("h4");
      heading.textContent = bucket.label;
      section.appendChild(heading);
      if (!bucket.schools.length) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.disabled = true;
        empty.textContent = "No visible schools";
        section.appendChild(empty);
      }
      bucket.schools.forEach((school) => {
        const button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => selectSchool(school));
        button.innerHTML = `${escapeHtml(school.name)} <span>${school.state} | ${school.lensScore.toFixed(1)}</span>`;
        section.appendChild(button);
      });
      els.portfolioGrid.appendChild(section);
    });

    const prompts = researchPromptsForMode();
    replaceChildren(els.researchPrompts);
    prompts.forEach(([title, body]) => {
      const card = document.createElement("div");
      card.className = "prompt-card";
      const strong = document.createElement("strong");
      strong.textContent = title;
      const p = document.createElement("p");
      p.textContent = body;
      card.append(strong, p);
      els.researchPrompts.appendChild(card);
    });
  }

  function renderStats(rows) {
    const top = rows[0];
    const limit = visibleCardLimit();
    els.countMetric.textContent = String(rows.length);
    els.topMetric.textContent = top ? top.lensScore.toFixed(1) : "0.0";
    els.caMetric.textContent = String(rows.filter((school) => school.state === "CA").length);
    els.clinicalMetric.textContent = String(rows.filter((school) => school.clinicalSignal > 0).length);
    els.resultSummary.textContent = `${rows.length} schools visible. Showing up to ${limit} cards, sorted by ${sortLabel()}.`;
  }

  function renderPlot(rows) {
    const width = els.plot.clientWidth || 780;
    const height = els.plot.clientHeight || 430;
    const pad = { left: 54, right: 24, top: 24, bottom: 48 };
    const xMax = 0.95;
    const yMin = Math.max(35, Math.floor(Math.min(...rows.map((s) => s.lensScore), 55) / 10) * 10);
    const yMax = 100;
    const svg = createSvg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "list",
      "aria-label": "Schools plotted by admit rate and current fit score",
    });

    for (let i = 0; i <= 5; i += 1) {
      const x = pad.left + ((width - pad.left - pad.right) * i) / 5;
      svg.appendChild(createSvg("line", { x1: x, y1: pad.top, x2: x, y2: height - pad.bottom, stroke: "#dce3ee" }));
      const label = createSvg("text", { x, y: height - 18, "text-anchor": "middle", class: "axis-label" });
      label.textContent = `${Math.round((xMax * i * 100) / 5)}%`;
      svg.appendChild(label);
    }

    for (let i = 0; i <= 4; i += 1) {
      const score = yMin + ((yMax - yMin) * i) / 4;
      const y = scale(score, yMin, yMax, height - pad.bottom, pad.top);
      svg.appendChild(createSvg("line", { x1: pad.left, y1: y, x2: width - pad.right, y2: y, stroke: "#dce3ee" }));
      const label = createSvg("text", { x: 16, y: y + 4, class: "axis-label" });
      label.textContent = Math.round(score);
      svg.appendChild(label);
    }

    const xAxis = createSvg("text", { x: width / 2, y: height - 4, "text-anchor": "middle", class: "axis-label" });
    xAxis.textContent = "admit rate";
    svg.appendChild(xAxis);

    const yAxis = createSvg("text", {
      x: 14,
      y: height / 2,
      transform: `rotate(-90 14 ${height / 2})`,
      "text-anchor": "middle",
      class: "axis-label",
    });
    yAxis.textContent = "fit score";
    svg.appendChild(yAxis);

    rows.slice(0, 120).forEach((school) => {
      const x = scale(clamp(safe(school.admit_rate, 0.02), 0.02, xMax), 0.02, xMax, pad.left, width - pad.right);
      const y = scale(school.lensScore, yMin, yMax, height - pad.bottom, pad.top);
      const point = createSvg("circle", {
        cx: x,
        cy: y,
        r: selectedOrCompared(school) ? 8 : 6,
        fill: colorForBand(school.band),
        class: `point ${state.selected === school.slug ? "active" : ""}`,
        tabindex: "0",
        role: "button",
        "aria-label": `Select ${school.name}, ${school.lensScore.toFixed(1)} fit score, ${formatPct(school.admit_rate)} admit rate`,
        "data-slug": school.slug,
      });
      point.addEventListener("mouseenter", (event) => showTooltip(event, school));
      point.addEventListener("mousemove", (event) => moveTooltip(event));
      point.addEventListener("mouseleave", hideTooltip);
      point.addEventListener("click", () => selectSchool(school));
      point.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSchool(school);
        }
      });
      svg.appendChild(point);
    });

    replaceChildren(els.plot, svg);
  }

  function renderBoard(rows) {
    replaceChildren(els.bandBoard);
    bandOrder.forEach((band) => {
      const column = document.createElement("div");
      column.className = "band-column";
      const title = document.createElement("h3");
      title.textContent = shortBand(band);
      column.appendChild(title);
      rows
        .filter((school) => school.band === band)
        .slice(0, 5)
        .forEach((school) => {
          const button = document.createElement("button");
          button.className = "mini-card";
          button.type = "button";
          button.addEventListener("click", () => selectSchool(school));
          const strong = document.createElement("strong");
          strong.textContent = school.name;
          const span = document.createElement("span");
          span.textContent = `${school.state} | ${school.lensScore.toFixed(1)} fit | ${formatPct(school.admit_rate)} admit`;
          button.append(strong, span);
          column.appendChild(button);
        });
      els.bandBoard.appendChild(column);
    });
  }

  function renderCards(rows) {
    replaceChildren(els.cards);
    rows.slice(0, visibleCardLimit()).forEach((school) => {
      const card = document.createElement("article");
      card.className = "school-card";

      const header = document.createElement("header");
      const text = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = school.name;
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${school.city}, ${school.state} | ${school.control} | ${formatPct(school.admit_rate)} admit`;
      text.append(title, meta);
      const rank = document.createElement("span");
      rank.className = "rank-badge";
      rank.textContent = String(Math.round(school.lensScore));
      header.append(text, rank);

      const pills = document.createElement("div");
      pills.className = "pill-row";
      [
        shortBand(school.band),
        ...school.tags.slice(0, 2),
        school.state === "CA" ? "CA option" : null,
        school.clinicalSignal ? "clinical signal" : null,
      ]
        .filter(Boolean)
        .forEach((label) => pills.appendChild(pill(label)));

      const bars = barsElement([
        ["Materials", school.materials_score],
        ["Bio/neuro", school.biology_score],
        ["Profile", school.profile_score],
      ]);

      const why = document.createElement("p");
      why.className = "detail-meta";
      why.textContent = school.nuance || school.why_apply;

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.textContent = "Inspect";
      inspect.addEventListener("click", () => selectSchool(school));
      const compare = document.createElement("button");
      compare.type = "button";
      compare.className = "compare";
      compare.textContent = state.compare.includes(school.slug) ? "Compared" : "Compare";
      compare.addEventListener("click", () => toggleCompare(school));
      actions.append(inspect, compare);

      card.append(header, pills, bars, why, actions);
      els.cards.appendChild(card);
    });
  }

  function renderDetail(school) {
    if (!school) {
      els.detailEmpty.classList.remove("hidden");
      els.detailContent.classList.add("hidden");
      els.detailPanel.classList.remove("open");
      return;
    }

    const enriched = { ...school, lensScore: lensScore(school) };
    els.detailEmpty.classList.add("hidden");
    els.detailContent.classList.remove("hidden");
    els.detailPanel.classList.add("open");
    els.detailBand.textContent = shortBand(enriched.band);
    els.detailName.textContent = enriched.name;
    els.detailMeta.textContent = `${enriched.city}, ${enriched.state} | ${enriched.control} | ${formatPct(enriched.admit_rate)} admit | ${formatMoney(enriched.net_price)} net price`;
    els.detailScore.textContent = enriched.lensScore.toFixed(0);
    els.detailWhy.textContent = enriched.why_apply;
    els.detailCaution.textContent = enriched.caution;
    els.detailNuance.textContent = enriched.nuance || "No curated school-specific note yet; use the component scores and program signals as a first-pass screen.";
    els.detailMaterialsPath.textContent = enriched.materialsPath || "Needs department-level verification before treating this as a materials or biomaterials fit.";
    els.detailClinicalPath.textContent = enriched.clinicalPath || "Needs manual checking for hospitals, clinical volunteering, shadowing, EMS, scribing, or clinical research access.";
    els.detailVerification.textContent =
      enriched.warning || "Needs department, cost, admissions, major-level selectivity, advising, and undergraduate research verification.";
    els.compareDetail.textContent = state.compare.includes(enriched.slug) ? "Remove from compare" : "Add to compare";
    replaceChildren(
      els.detailBars,
      barsElement([
        ["Materials", enriched.materials_score],
        ["Bio/neuro", enriched.biology_score],
        ["Research", enriched.profile_score],
        ["Outcomes", enriched.outcomes_score],
        ["Access", enriched.access_score],
      ])
    );
    replaceChildren(els.detailTags);
    (enriched.tags.length ? enriched.tags : ["manual check needed"]).forEach((label) => els.detailTags.appendChild(pill(label)));
    replaceChildren(els.detailPrograms);
    programLabels(enriched).forEach((label) => els.detailPrograms.appendChild(pill(label)));
  }

  function renderCompare() {
    replaceChildren(els.compareGrid);
    const compared = state.compare.map((slug) => schools.find((school) => school.slug === slug)).filter(Boolean);
    document.body.classList.toggle("has-compare", compared.length > 0);
    els.compareTray.classList.toggle("empty", compared.length === 0);
    for (let i = 0; i < 3; i += 1) {
      const school = compared[i];
      const card = document.createElement("button");
      card.type = "button";
      card.className = school ? "compare-card" : "compare-card empty";
      if (!school) {
        card.textContent = "Add a school";
        card.disabled = true;
      } else {
        const enriched = { ...school, lensScore: lensScore(school) };
        card.setAttribute("aria-label", `Inspect compared school ${enriched.name}`);
        const strong = document.createElement("strong");
        strong.textContent = enriched.name;
        const meta = document.createElement("p");
        meta.textContent = `${enriched.lensScore.toFixed(1)} fit | ${formatPct(enriched.admit_rate)} admit | ${formatMoney(enriched.net_price)}`;
        const focus = document.createElement("p");
        focus.textContent = `Materials ${percent(enriched.materials_score)} | Bio ${percent(enriched.biology_score)}`;
        card.append(strong, meta, focus);
        card.addEventListener("click", () => selectSchool(enriched));
      }
      els.compareGrid.appendChild(card);
    }
  }

  function selectSchool(school) {
    state.selected = school.slug;
    renderDetail(school);
    els.detailPanel.scrollTop = 0;
    renderPlot(currentRows());
  }

  function toggleCompare(school) {
    if (state.compare.includes(school.slug)) {
      state.compare = state.compare.filter((slug) => slug !== school.slug);
    } else {
      state.compare = [...state.compare.slice(-2), school.slug];
    }
    renderCompare();
    renderCards(currentRows());
    renderDetail(schools.find((item) => item.slug === state.selected) || null);
  }

  function lensScore(school) {
    const w = tracks[state.track].weights;
    const value =
      safe(school.materials_score) * safe(w.materials) +
      safe(school.biology_score) * safe(w.biology) +
      safe(school.profile_score) * safe(w.profile) +
      safe(school.outcomes_score) * safe(w.outcomes) +
      safe(school.access_score) * safe(w.access) +
      safe(school.ca_value_score) * safe(w.ca) +
      safe(school.clinicalSignal) * safe(w.clinical);
    return value * 100;
  }

  function clinicalSignal(school) {
    const text = [
      school.why_apply,
      school.programs,
      school.tags.join(" "),
      school.clinicalPath,
      school.nuance,
    ].join(" ").toLowerCase();
    const terms = ["medical", "medicine", "clinical", "pre-med", "hospital", "neuro", "neuroscience", "physician"];
    return terms.some((term) => text.includes(term)) ? 1 : 0;
  }

  function barsElement(items) {
    const wrapper = document.createElement("div");
    wrapper.className = "bar-stack";
    items.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const left = document.createElement("span");
      left.textContent = label;
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${Math.round(safe(value) * 100)}%`;
      track.appendChild(fill);
      const right = document.createElement("span");
      right.textContent = percent(value);
      row.append(left, track, right);
      wrapper.appendChild(row);
    });
    return wrapper;
  }

  function programLabels(school) {
    if (!school.programs) return ["No relevant Scorecard CIP listed"];
    return school.programs
      .split("|")
      .flatMap((group) => group.split(";").slice(0, 3))
      .map((label) => label.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  function pill(label) {
    const span = document.createElement("span");
    span.className = "pill";
    span.textContent = label;
    return span;
  }

  function showTooltip(event, school) {
    els.tooltip.classList.remove("hidden");
    els.tooltip.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = school.name;
    const line = document.createElement("div");
    line.textContent = `${school.state} | ${lensScore(school).toFixed(1)} fit | ${formatPct(school.admit_rate)} admit`;
    els.tooltip.append(strong, line);
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const x = Math.min(window.innerWidth - 300, event.clientX + 16);
    const y = Math.min(window.innerHeight - 90, event.clientY + 16);
    els.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  function hideTooltip() {
    els.tooltip.classList.add("hidden");
  }

  function initCanvas() {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    const points = Array.from({ length: 54 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      type: index % 3,
    }));

    function draw(time) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, width, height);

      const motionTime = motionQuery.matches ? 0 : time;
      const coords = points.map((point) => {
        const drift = Math.sin(motionTime / 1600 + point.phase) * 0.018;
        return {
          x: (point.x + drift) * width,
          y: (point.y + Math.cos(motionTime / 1900 + point.phase) * 0.018) * height,
          type: point.type,
        };
      });

      coords.forEach((a, i) => {
        coords.slice(i + 1).forEach((b) => {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < width * 0.14) {
            ctx.strokeStyle = `rgba(255,255,255,${0.18 - dist / (width * 0.95)})`;
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        });
      });

      coords.forEach((point) => {
        const colors = ["#0f9f9a", "#e6573f", "#c9971a"];
        ctx.fillStyle = colors[point.type];
        ctx.beginPath();
        ctx.arc(point.x, point.y, (point.type === 1 ? 5 : 4) * dpr, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!motionQuery.matches) requestAnimationFrame(draw);
    }
    draw(0);
    motionQuery.addEventListener("change", () => draw(0));
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function safe(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function scale(value, min, max, outMin, outMax) {
    if (max === min) return outMin;
    return outMin + ((value - min) / (max - min)) * (outMax - outMin);
  }

  function formatPct(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 1000) / 10}%` : "n/a";
  }

  function percent(value) {
    return `${Math.round(safe(value) * 100)}%`;
  }

  function formatMoney(value) {
    return Number.isFinite(Number(value)) ? `$${Math.round(Number(value)).toLocaleString()}` : "n/a";
  }

  function shortBand(band) {
    return {
      "Far reach by admit rate": "Far reach",
      "Reach by admit rate": "Reach",
      "Competitive/possible by admit rate": "Competitive",
      "More accessible by admit rate": "Accessible",
    }[band] || band;
  }

  function colorForBand(band) {
    return {
      "Far reach by admit rate": "#e6573f",
      "Reach by admit rate": "#c9971a",
      "Competitive/possible by admit rate": "#2774d9",
      "More accessible by admit rate": "#2a9d55",
    }[band] || "#627086";
  }

  function selectedOrCompared(school) {
    return school.slug === state.selected || state.compare.includes(school.slug);
  }

  function sortLabel() {
    return {
      lens: "current lens score",
      admit: "admit rate",
      materials: "materials strength",
      biology: "bio/neuro strength",
      outcomes: "outcomes",
      netprice: "net price",
    }[state.sort];
  }

  function visibleCardLimit() {
    if (window.matchMedia("(max-width: 640px)").matches) return 18;
    if (window.matchMedia("(max-width: 980px)").matches) return 30;
    return 48;
  }

  function debounce(fn, wait) {
    let timeout = null;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }

  function researchPromptsForMode() {
    const shared = [
      ["Labs", "Name two labs and one recent paper that connect to scaffolded vesicles, hydrogels, organoids, microscopy, or drug delivery."],
      ["Access", "Confirm whether first-year students can join labs, volunteer clinically, or take research-for-credit without special barriers."],
      ["Major fit", "Check whether pre-med prerequisites fit inside the likely major without crushing GPA or blocking research time."],
    ];
    if (state.analysis === "surgeon") {
      return [
        ["Clinical route", "Find the closest hospital, volunteer office, EMS program, or shadowing pathway and whether freshmen can participate."],
        ["Advising", "Check committee letters, med-school acceptance reporting, and how the school supports applicants who are not biology majors."],
        ["GPA risk", "Look for grade deflation warnings, engineering workload constraints, and whether the student can choose a flexible biology/neuro major."],
        ...shared,
      ];
    }
    if (state.analysis === "physicianScientist") {
      return [
        ["Research depth", "Prioritize schools with undergrad thesis culture, summer research funding, and hospital-linked biomedical labs."],
        ["Narrative", "Look for places where the student's scaffolded-vesicle work naturally becomes biomaterials, tissue engineering, or neural development."],
        ["Computation", "Check computational biology, bioinformatics, and image-analysis routes as a differentiating skill set."],
        ...shared,
      ];
    }
    if (state.analysis === "materials") {
      return [
        ["MSE depth", "Check whether the school has a real undergraduate materials major, not only graduate labs or a course cluster."],
        ["Soft materials", "Prioritize polymers, hydrogels, biomaterials, microscopy, nanomedicine, and tissue-engineering groups."],
        ["Pre-med compatibility", "If surgery remains plausible, verify the engineering plan can still cover chemistry, biology, MCAT prep, and clinical time."],
        ...shared,
      ];
    }
    return [
      ["Bridge labs", "Search for biomaterials, tissue engineering, organoids, hydrogels, drug delivery, and microscopy groups."],
      ["Essay angle", "Test whether the school lets the student explain materials as a tool for controlling fragile biological systems."],
      ["Mentor targets", "Find faculty who sit between MSE, bioengineering, neuroscience, and medicine, then save one question per lab."],
      ...shared,
    ];
  }

  function createSvg(tag, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function replaceChildren(node, ...children) {
    node.replaceChildren(...children);
  }
})();
