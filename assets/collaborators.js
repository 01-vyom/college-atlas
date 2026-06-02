(function () {
  "use strict";

  const collaborators = Array.isArray(window.COLLABORATORS) ? window.COLLABORATORS : [];
  const meta = window.COLLABORATOR_META || {};
  const state = {
    search: "",
    sort: "relevance",
    radius: "all",
    track: "all",
    quick: "all"
  };

  const els = {
    count: document.getElementById("collabCount"),
    localCount: document.getElementById("localCount"),
    topScore: document.getElementById("topScore"),
    search: document.getElementById("collabSearch"),
    sort: document.getElementById("collabSort"),
    radius: document.getElementById("radiusFilter"),
    track: document.getElementById("trackFilter"),
    chips: Array.from(document.querySelectorAll("[data-quick]")),
    summary: document.getElementById("collabSummary"),
    grid: document.getElementById("collabGrid")
  };

  function init() {
    populateTrackFilter();
    bindControls();
    render();
  }

  function populateTrackFilter() {
    if (!els.track) return;
    const tracks = Array.from(
      new Set(collaborators.flatMap((item) => item.tracks || []))
    ).sort((a, b) => labelize(a).localeCompare(labelize(b)));

    tracks.forEach((track) => {
      const option = document.createElement("option");
      option.value = track;
      option.textContent = labelize(track);
      els.track.appendChild(option);
    });
  }

  function bindControls() {
    if (els.search) {
      const updateSearch = (event) => {
        state.search = event.target.value.trim().toLowerCase();
        render();
      };
      els.search.addEventListener("input", updateSearch);
      els.search.addEventListener("change", updateSearch);
      els.search.addEventListener("search", updateSearch);
    }

    [
      [els.sort, "sort"],
      [els.radius, "radius"],
      [els.track, "track"]
    ].forEach(([element, key]) => {
      if (!element) return;
      element.addEventListener("change", (event) => {
        state[key] = event.target.value;
        render();
      });
    });

    els.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.quick = chip.dataset.quick || "all";
        els.chips.forEach((item) => {
          const isActive = item === chip;
          item.classList.toggle("active", isActive);
          item.setAttribute("aria-pressed", String(isActive));
        });
        render();
      });
    });
  }

  function render() {
    const rows = collaborators.filter(matchesFilters).sort(compareCollaborators);
    const visibleTop = rows.length ? Math.max(...rows.map((item) => item.relevanceScore || 0)) : 0;
    const localCount = collaborators.filter((item) =>
      ["Bay Area", "Northern CA"].includes(item.radiusBand)
    ).length;

    if (els.count) els.count.textContent = String(rows.length);
    if (els.localCount) els.localCount.textContent = String(localCount);
    if (els.topScore) els.topScore.textContent = String(visibleTop);
    if (els.summary) {
      els.summary.textContent = buildSummary(rows.length);
    }
    if (els.grid) {
      els.grid.innerHTML = rows.length
        ? rows.map(renderCard).join("")
        : '<p class="collab-empty">No collaborators match these filters. Widen the radius or clear the search.</p>';
    }
  }

  function matchesFilters(item) {
    if (state.radius !== "all" && !matchesRadius(item, state.radius)) return false;
    if (state.track !== "all" && !(item.tracks || []).includes(state.track)) return false;
    if (!matchesQuickFilter(item)) return false;
    if (!state.search) return true;

    const haystack = [
      item.name,
      item.institution,
      item.title,
      item.city,
      item.state,
      item.region,
      item.radiusBand,
      item.fit,
      item.outreach,
      ...(item.tracks || []),
      ...(item.methods || [])
    ].join(" ").toLowerCase();

    return haystack.includes(state.search);
  }

  function matchesRadius(item, radius) {
    if (radius === "California") return item.state === "CA";
    return item.radiusBand === radius;
  }

  function matchesQuickFilter(item) {
    const tracks = item.tracks || [];
    const methods = (item.methods || []).join(" ").toLowerCase();

    if (state.quick === "local") {
      return item.accessFit >= 60 || ["Bay Area", "Northern CA"].includes(item.radiusBand);
    }
    if (state.quick === "neuro") {
      return item.neuroClinicalFit >= 88 || tracks.some((track) =>
        ["neural-interface", "neurosurgery-adjacent", "brain-repair", "spinal-cord", "neuroimaging", "neurodevices"].includes(track)
      );
    }
    if (state.quick === "vesicles") {
      return tracks.some((track) =>
        ["vesicles", "lipid-membranes", "drug-delivery", "controlled-delivery", "nanomedicine"].includes(track)
      ) || /vesicle|lipid|lnp|delivery|nanoparticle/.test(methods);
    }
    if (state.quick === "national") {
      return item.distanceMiles >= 500 && item.relevanceScore >= 90;
    }
    return true;
  }

  function compareCollaborators(a, b) {
    const comparators = {
      relevance: [
        (x, y) => y.relevanceScore - x.relevanceScore,
        (x, y) => y.accessFit - x.accessFit,
        (x, y) => x.distanceMiles - y.distanceMiles
      ],
      distance: [
        (x, y) => x.distanceMiles - y.distanceMiles,
        (x, y) => y.relevanceScore - x.relevanceScore
      ],
      access: [
        (x, y) => y.accessFit - x.accessFit,
        (x, y) => x.distanceMiles - y.distanceMiles
      ],
      materials: [
        (x, y) => y.materialsFit - x.materialsFit,
        (x, y) => y.relevanceScore - x.relevanceScore
      ],
      bioMed: [
        (x, y) => y.bioMedFit - x.bioMedFit,
        (x, y) => y.relevanceScore - x.relevanceScore
      ],
      neuro: [
        (x, y) => y.neuroClinicalFit - x.neuroClinicalFit,
        (x, y) => y.relevanceScore - x.relevanceScore
      ],
      institution: [
        (x, y) => x.institution.localeCompare(y.institution),
        (x, y) => x.name.localeCompare(y.name)
      ]
    };

    const chain = comparators[state.sort] || comparators.relevance;
    for (const comparator of chain) {
      const result = comparator(a, b);
      if (result !== 0) return result;
    }
    return a.name.localeCompare(b.name);
  }

  function buildSummary(count) {
    const parts = [`${count} ${count === 1 ? "collaborator" : "collaborators"}`];
    parts.push(`sorted by ${sortLabel(state.sort)}`);
    if (state.radius !== "all") parts.push(`radius: ${state.radius}`);
    if (state.track !== "all") parts.push(`track: ${labelize(state.track)}`);
    if (state.quick !== "all") parts.push(`view: ${quickLabel(state.quick)}`);
    if (meta.homeBase) parts.push(`home base: ${meta.homeBase}`);
    return parts.join(" | ");
  }

  function renderCard(item) {
    const tracks = (item.tracks || []).map((track) =>
      `<span>${escapeHtml(labelize(track))}</span>`
    ).join("");
    const methods = (item.methods || []).map((method) =>
      `<li>${escapeHtml(method)}</li>`
    ).join("");

    return `
      <article class="collab-card">
        <header>
          <div>
            <p class="collab-kicker">${escapeHtml(item.radiusBand)} / ${formatMiles(item.distanceMiles)}</p>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.institution)}</p>
          </div>
          <span class="score-pill">${Number(item.relevanceScore) || 0}</span>
        </header>
        <p class="collab-title">${escapeHtml(item.title)}</p>
        <p class="collab-location">${escapeHtml(item.city)}, ${escapeHtml(item.state)} - ${escapeHtml(item.region)}</p>
        <p class="collab-fit">${escapeHtml(item.fit)}</p>
        <div class="collab-bars" aria-label="Fit scores">
          ${renderBar("Materials", item.materialsFit, "materials")}
          ${renderBar("Bio/medicine", item.bioMedFit, "biomed")}
          ${renderBar("Neuro/clinical", item.neuroClinicalFit, "neuro")}
          ${renderBar("First contact", item.accessFit, "access")}
        </div>
        <div class="collab-tags">${tracks}</div>
        <ul class="collab-methods">${methods}</ul>
        <p class="collab-outreach"><strong>Outreach:</strong> ${escapeHtml(item.outreach)}</p>
        <a class="collab-source" href="${escapeAttribute(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceLabel || "Source")}</a>
      </article>
    `;
  }

  function renderBar(label, value, kind) {
    const score = Math.max(0, Math.min(100, Number(value) || 0));
    return `
      <div class="collab-score-row ${kind}">
        <span>${escapeHtml(label)}</span>
        <div class="collab-meter" aria-hidden="true"><span style="width: ${score}%"></span></div>
        <strong>${score}</strong>
      </div>
    `;
  }

  function formatMiles(value) {
    const miles = Number(value);
    if (!Number.isFinite(miles)) return "distance TBD";
    return miles < 100 ? `${miles} mi` : `${miles.toLocaleString()} mi`;
  }

  function labelize(value) {
    return String(value || "")
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function sortLabel(value) {
    const labels = {
      relevance: "relevance",
      distance: "distance",
      access: "first-contact fit",
      materials: "materials fit",
      bioMed: "bio/medicine fit",
      neuro: "neuro/clinical fit",
      institution: "institution"
    };
    return labels[value] || labels.relevance;
  }

  function quickLabel(value) {
    const labels = {
      local: "first outreach",
      neuro: "neuro/clinical",
      vesicles: "vesicles/delivery",
      national: "far but relevant"
    };
    return labels[value] || "all";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    const text = String(value == null ? "" : value);
    if (!/^https?:\/\//i.test(text)) return "#";
    return escapeHtml(text);
  }

  init();
})();
