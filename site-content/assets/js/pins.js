// ============================================================
// PIN COLLECTOR — Grid display, pagination, filters, collection
// Depends on: script.js (apiFetch)
// ============================================================

(function () {
  let currentPage = 1;
  let totalPages = 1;
  let filters = { year: "", series: "", search: "", collected: "", chaser: "" };
  let allPins = []; // current page's pins

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    await loadFilters();
    await loadStats();
    await loadPins();
    bindFilterEvents();
    bindModalEvents();
    buildMobileFilters();
  }

  // ── Mobile Filter Bar ───────────────────────────────────
  function buildMobileFilters() {
    const desktop = document.getElementById("pin-filters");
    if (!desktop || document.getElementById("pin-filters-mobile")) return;

    const yearSel = document.getElementById("filter-year");
    const seriesSel = document.getElementById("filter-series");

    const optionsHtml = (sel) =>
      Array.from(sel.options).map(o =>
        `<option value="${escapeHtml(o.value)}">${escapeHtml(o.textContent)}</option>`
      ).join("");

    const wrap = document.createElement("div");
    wrap.className = "pin-filters-mobile";
    wrap.id = "pin-filters-mobile";
    wrap.innerHTML = `
      <div class="pin-filters-mobile-bar">
        <div class="pin-filters-mobile-search">
          <i class="ph ph-magnifying-glass"></i>
          <input type="text" id="m-filter-search" placeholder="Search pins..." />
        </div>
        <button type="button" class="pin-filters-mobile-toggle" id="m-filter-toggle" aria-expanded="false">
          <i class="ph ph-sliders-horizontal"></i>
          <span>Filters</span>
          <span class="pin-filters-mobile-count" id="m-filter-count">0</span>
        </button>
      </div>
      <div class="pin-filters-mobile-panel" id="m-filter-panel">
        <div class="pin-filters-mobile-grid">
          <div class="pin-filter-group">
            <label for="m-filter-year">Year</label>
            <select id="m-filter-year">${optionsHtml(yearSel)}</select>
          </div>
          <div class="pin-filter-group">
            <label for="m-filter-series">Series</label>
            <select id="m-filter-series">${optionsHtml(seriesSel)}</select>
          </div>
          <div class="pin-filter-group">
            <label for="m-filter-collected">Status</label>
            <select id="m-filter-collected">
              <option value="">All Pins</option>
              <option value="collected">Collected</option>
              <option value="uncollected">Not Collected</option>
            </select>
          </div>
          <div class="pin-filter-group">
            <label for="m-filter-chaser">Priority</label>
            <select id="m-filter-chaser">
              <option value="">All</option>
              <option value="1">Chasers & Super</option>
              <option value="2">Super Only</option>
            </select>
          </div>
        </div>
        <button type="button" class="pin-filters-mobile-clear" id="m-filter-clear">Clear All</button>
      </div>
    `;
    desktop.parentNode.insertBefore(wrap, desktop);

    // Pairs: [mobileId, desktopId, event]
    const pairs = [
      ["m-filter-search", "filter-search", "input"],
      ["m-filter-year", "filter-year", "change"],
      ["m-filter-series", "filter-series", "change"],
      ["m-filter-collected", "filter-collected", "change"],
      ["m-filter-chaser", "filter-chaser", "change"],
    ];

    pairs.forEach(([mId, dId, evt]) => {
      const m = document.getElementById(mId);
      const d = document.getElementById(dId);
      m.addEventListener(evt, () => {
        d.value = m.value;
        d.dispatchEvent(new Event(evt, { bubbles: true }));
        updateMobileFilterCount();
      });
    });

    // Toggle panel
    const toggleBtn = document.getElementById("m-filter-toggle");
    const panel = document.getElementById("m-filter-panel");
    toggleBtn.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Clear all
    document.getElementById("m-filter-clear").addEventListener("click", () => {
      ["m-filter-search", "m-filter-year", "m-filter-series", "m-filter-collected", "m-filter-chaser"]
        .forEach(id => {
          const el = document.getElementById(id);
          el.value = "";
          const evt = el.tagName === "INPUT" ? "input" : "change";
          el.dispatchEvent(new Event(evt, { bubbles: true }));
        });
      updateMobileFilterCount();
    });

    updateMobileFilterCount();
  }

  function updateMobileFilterCount() {
    const ids = ["m-filter-year", "m-filter-series", "m-filter-collected", "m-filter-chaser", "m-filter-search"];
    let count = 0;
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value && el.value.trim() !== "") count++;
    });
    const btn = document.getElementById("m-filter-toggle");
    const badge = document.getElementById("m-filter-count");
    if (!btn || !badge) return;
    badge.textContent = count;
    btn.classList.toggle("has-active", count > 0);
  }

  // ── Load filter options from API ────────────────────────
  async function loadFilters() {
    try {
      const data = await apiFetch("/pins/filters");
      const yearSelect = document.getElementById("filter-year");
      const seriesSelect = document.getElementById("filter-series");

      for (const year of data.years) {
        const opt = document.createElement("option");
        opt.value = year;
        opt.textContent = year;
        yearSelect.appendChild(opt);
      }

      for (const series of data.series) {
        const opt = document.createElement("option");
        opt.value = series;
        opt.textContent = series;
        seriesSelect.appendChild(opt);
      }
    } catch (e) {
      console.error("[Pins] Failed to load filters:", e);
    }
  }

  // ── Load collection stats ───────────────────────────────
  async function loadStats() {
    try {
      const stats = await apiFetch("/my/pins/stats");
      document.getElementById("stat-total").textContent = stats.totalPins;
      document.getElementById("stat-collected").textContent = stats.collected;
      document.getElementById("stat-remaining").textContent = stats.remaining;
    } catch (e) {
      // Not logged in — show totals only
      try {
        const data = await apiFetch("/pins?limit=1");
        document.getElementById("stat-total").textContent = data.total;
        document.getElementById("stat-collected").textContent = "—";
        document.getElementById("stat-remaining").textContent = "—";
      } catch (_) {}
    }
  }

  // ── Load pins with pagination & filters ─────────────────
  async function loadPins() {
    const grid = document.getElementById("pin-grid");
    grid.innerHTML = '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">Loading pins...</p>';

    try {
      let query = `/pins?page=${currentPage}&limit=25`;
      if (filters.year) query += `&year=${encodeURIComponent(filters.year)}`;
      if (filters.series) query += `&series=${encodeURIComponent(filters.series)}`;
      if (filters.search) query += `&search=${encodeURIComponent(filters.search)}`;
      if (filters.chaser) query += `&chaser=${filters.chaser}`;

      const data = await apiFetch(query);
      totalPages = data.totalPages;
      allPins = data.pins;

      // Client-side filter for collected/uncollected
      let displayPins = allPins;
      if (filters.collected === "collected") {
        displayPins = allPins.filter(p => p.collected);
      } else if (filters.collected === "uncollected") {
        displayPins = allPins.filter(p => !p.collected);
      }

      renderGrid(displayPins);
      renderPagination();
    } catch (e) {
      console.error("[Pins] Failed to load:", e);
      grid.innerHTML = `
        <div class="pin-empty">
          <span class="pin-empty-icon">&#x1F4CC;</span>
          <h3>Could not load pins</h3>
          <p>Make sure the API is running.</p>
        </div>
      `;
    }
  }

  // ── Render the 5x5 grid ─────────────────────────────────
  function renderGrid(pins) {
    const grid = document.getElementById("pin-grid");

    if (pins.length === 0) {
      grid.innerHTML = `
        <div class="pin-empty">
          <span class="pin-empty-icon">&#x1F4CC;</span>
          <h3>No Pins Found</h3>
          <p>Try adjusting your filters or check back later.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = pins.map(pin => {
      const imageHtml = pin.image
        ? `<img class="pin-card-image" src="/api/pins/thumbnail/${pin.image}" alt="${escapeHtml(pin.name)}" loading="lazy" />`
        : `<div class="pin-card-image-placeholder">&#x1F4CC;</div>`;

      const meta = [pin.year, pin.series].filter(Boolean).join(" · ");
      const collectedClass = pin.collected ? " collected" : "";
      const favoriteClass = pin.favorite ? " favorite" : "";
      const chaserClass = pin.chaser === 2 ? " super-chaser" : pin.chaser === 1 ? " chaser" : "";
      const btnLabel = pin.collected ? "Collected" : "Collect";
      const chaserBadge = pin.chaser === 2
        ? `<span class="pin-chaser-badge super-chaser">Super Chaser</span>`
        : pin.chaser === 1
        ? `<span class="pin-chaser-badge chaser">Chaser</span>`
        : "";
      const starIcon = pin.favorite ? "ph-fill ph-star" : "ph ph-star";
      const favTitle = pin.favorite ? "Remove favorite" : "Mark as favorite";

      return `
        <div class="pin-card${collectedClass}${favoriteClass}${chaserClass}" data-pin-id="${pin.id}">
          <div class="pin-card-image-wrap" data-action="detail">
            ${chaserBadge}
            <button class="pin-favorite-btn" data-action="favorite" data-pin-id="${pin.id}" title="${favTitle}" aria-label="${favTitle}">
              <i class="${starIcon}"></i>
            </button>
            <div class="pin-card-image-inner">${imageHtml}</div>
          </div>
          <div class="pin-card-info" data-action="detail">
            <p class="pin-card-name" title="${escapeHtml(pin.name)}">${escapeHtml(pin.name)}</p>
            ${meta ? `<p class="pin-card-meta">${escapeHtml(meta)}</p>` : ""}
          </div>
          <button class="pin-collect-btn" data-action="collect" data-pin-id="${pin.id}">${btnLabel}</button>
        </div>
      `;
    }).join("");

    // Bind collect buttons
    grid.querySelectorAll('[data-action="collect"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleCollect(btn.dataset.pinId);
      });
    });

    // Bind favorite buttons
    grid.querySelectorAll('[data-action="favorite"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.pinId);
      });
    });

    // Bind detail clicks
    grid.querySelectorAll('[data-action="detail"]').forEach(el => {
      el.addEventListener("click", () => {
        const card = el.closest(".pin-card");
        const pin = allPins.find(p => p.id === card.dataset.pinId);
        if (pin) openPinModal(pin);
      });
    });
  }

  // ── Toggle collected state ──────────────────────────────
  async function toggleCollect(pinId) {
    const pin = allPins.find(p => p.id === pinId);
    if (!pin) return;

    try {
      if (pin.collected) {
        await apiFetch(`/pins/${pinId}/collect`, { method: "DELETE" });
        pin.collected = false;
      } else {
        await apiFetch(`/pins/${pinId}/collect`, { method: "POST" });
        pin.collected = true;
      }

      // Update the card in place
      const card = document.querySelector(`.pin-card[data-pin-id="${pinId}"]`);
      if (card) {
        card.classList.toggle("collected", pin.collected);
        const btn = card.querySelector(".pin-collect-btn");
        btn.textContent = pin.collected ? "Collected" : "Collect";
      }

      // Update the modal if open
      const modalBtn = document.querySelector(".pin-detail-collect-btn");
      if (modalBtn && modalBtn.dataset.pinId === pinId) {
        updateModalCollectBtn(modalBtn, pin.collected);
      }

      loadStats();
    } catch (e) {
      console.error("[Pins] Toggle collect failed:", e);
    }
  }

  // ── Toggle favorite state ───────────────────────────────
  async function toggleFavorite(pinId) {
    const pin = allPins.find(p => p.id === pinId);
    if (!pin) return;

    try {
      if (pin.favorite) {
        await apiFetch(`/pins/${pinId}/favorite`, { method: "DELETE" });
        pin.favorite = false;
      } else {
        await apiFetch(`/pins/${pinId}/favorite`, { method: "POST" });
        pin.favorite = true;
      }

      // Update card in place
      const card = document.querySelector(`.pin-card[data-pin-id="${pinId}"]`);
      if (card) {
        card.classList.toggle("favorite", pin.favorite);
        const icon = card.querySelector('.pin-favorite-btn i');
        if (icon) icon.className = pin.favorite ? "ph-fill ph-star" : "ph ph-star";
        const btn = card.querySelector('.pin-favorite-btn');
        if (btn) {
          const label = pin.favorite ? "Remove favorite" : "Mark as favorite";
          btn.title = label;
          btn.setAttribute("aria-label", label);
        }
      }

      // Update modal if open
      const modalFavBtn = document.querySelector(".pin-detail-favorite-btn");
      if (modalFavBtn && modalFavBtn.dataset.pinId === pinId) {
        updateModalFavoriteBtn(modalFavBtn, pin.favorite);
      }
    } catch (e) {
      console.error("[Pins] Toggle favorite failed:", e);
    }
  }

  // ── Pagination ──────────────────────────────────────────
  function renderPagination() {
    const container = document.getElementById("pin-pagination");
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = "";

    // Previous button
    html += `<button class="pin-page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>&laquo;</button>`;

    // Page numbers with ellipsis
    const pages = getPageNumbers(currentPage, totalPages);
    for (const p of pages) {
      if (p === "...") {
        html += `<span class="pin-page-ellipsis">...</span>`;
      } else {
        html += `<button class="pin-page-btn${p === currentPage ? " active" : ""}" data-page="${p}">${p}</button>`;
      }
    }

    // Next button
    html += `<button class="pin-page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>&raquo;</button>`;

    container.innerHTML = html;

    container.querySelectorAll(".pin-page-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const page = parseInt(btn.dataset.page);
        if (page >= 1 && page <= totalPages && page !== currentPage) {
          currentPage = page;
          loadPins();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
  }

  function getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    pages.push(1);

    if (current > 3) pages.push("...");

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) pages.push(i);

    if (current < total - 2) pages.push("...");

    pages.push(total);
    return pages;
  }

  // ── Filter Events ──────────────────────────────────────
  function bindFilterEvents() {
    document.getElementById("filter-year").addEventListener("change", (e) => {
      filters.year = e.target.value;
      currentPage = 1;
      loadPins();
    });

    document.getElementById("filter-series").addEventListener("change", (e) => {
      filters.series = e.target.value;
      currentPage = 1;
      loadPins();
    });

    document.getElementById("filter-collected").addEventListener("change", (e) => {
      filters.collected = e.target.value;
      currentPage = 1;
      loadPins();
    });

    document.getElementById("filter-chaser").addEventListener("change", (e) => {
      filters.chaser = e.target.value;
      currentPage = 1;
      loadPins();
    });

    let searchTimeout;
    document.getElementById("filter-search").addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filters.search = e.target.value.trim();
        currentPage = 1;
        loadPins();
      }, 300);
    });
  }

  // ── Obtain source catalog ──────────────────────────────
  const OBTAIN_SOURCES = {
    park:            { label: "Parks (Open Edition)", icon: "ph-castle-turret" },
    cast_trading:    { label: "Cast Member Trading",  icon: "ph-users-three" },
    hot_topic:       { label: "Hot Topic",            icon: "ph-storefront" },
    box_lunch:       { label: "BoxLunch",             icon: "ph-shopping-bag" },
    disney_pin_blog: { label: "Disney Pin Blog",      icon: "ph-globe" },
    shop_disney:     { label: "shopDisney",           icon: "ph-shopping-cart" },
    other:           { label: "Other",                icon: "ph-info" },
  };

  function renderObtainSection(pin) {
    const slugs = (pin.obtain_source || "").split(",").map(s => s.trim()).filter(Boolean);
    const notes = (pin.obtain_notes || "").trim();
    if (!slugs.length && !notes) return "";

    const badges = slugs.map(slug => {
      const src = OBTAIN_SOURCES[slug];
      if (!src) return "";
      return `<span class="pin-obtain-badge"><i class="ph ${src.icon}"></i>${escapeHtml(src.label)}</span>`;
    }).join("");

    return `
      <div class="pin-obtain-section">
        <h4 class="pin-obtain-title"><i class="ph-bold ph-map-pin"></i> How to Obtain</h4>
        ${badges ? `<div class="pin-obtain-badges">${badges}</div>` : ""}
        ${notes ? `<p class="pin-obtain-notes">${escapeHtml(notes)}</p>` : ""}
      </div>
    `;
  }

  // ── Pin Detail Modal ───────────────────────────────────
  function openPinModal(pin) {
    const overlay = document.getElementById("pin-modal-overlay");
    const content = document.getElementById("pin-modal-content");

    const imageHtml = pin.image
      ? `<img class="pin-detail-image" src="/api/pins/image/${pin.image}" alt="${escapeHtml(pin.name)}" />`
      : "";

    const tagsHtml = [];
    if (pin.chaser === 2) tagsHtml.push(`<span class="pin-detail-tag super-chaser">Super Chaser</span>`);
    else if (pin.chaser === 1) tagsHtml.push(`<span class="pin-detail-tag chaser">Chaser</span>`);
    if (pin.year) tagsHtml.push(`<span class="pin-detail-tag year">${escapeHtml(pin.year)}</span>`);
    if (pin.series) tagsHtml.push(`<span class="pin-detail-tag series">${escapeHtml(pin.series)}</span>`);
    if (pin.tags) {
      pin.tags.split(",").map(t => t.trim()).filter(Boolean).forEach(tag => {
        tagsHtml.push(`<span class="pin-detail-tag custom">${escapeHtml(tag)}</span>`);
      });
    }

    const isCollected = pin.collected;
    const btnClass = isCollected ? "is-collected" : "uncollected";
    const btnLabel = isCollected ? "Collected" : "Add to Collection";
    const favClass = pin.favorite ? "is-favorite" : "";
    const favIcon = pin.favorite ? "ph-fill ph-star" : "ph ph-star";
    const favLabel = pin.favorite ? "Favorited" : "Favorite";

    content.innerHTML = `
      ${imageHtml}
      <div class="pin-detail-body">
        <h2 class="pin-detail-name">${escapeHtml(pin.name)}</h2>
        ${tagsHtml.length ? `<div class="pin-detail-tags">${tagsHtml.join("")}</div>` : ""}
        ${renderObtainSection(pin)}
        <div class="pin-detail-actions">
          <button class="pin-detail-collect-btn ${btnClass}" data-pin-id="${pin.id}">${btnLabel}</button>
          <button class="pin-detail-favorite-btn ${favClass}" data-pin-id="${pin.id}">
            <i class="${favIcon}"></i><span>${favLabel}</span>
          </button>
        </div>
      </div>
    `;

    const collectBtn = content.querySelector(".pin-detail-collect-btn");
    collectBtn.addEventListener("click", () => toggleCollect(pin.id));

    const favBtn = content.querySelector(".pin-detail-favorite-btn");
    favBtn.addEventListener("click", () => toggleFavorite(pin.id));

    overlay.classList.remove("hidden");
  }

  function updateModalCollectBtn(btn, isCollected) {
    btn.className = `pin-detail-collect-btn ${isCollected ? "is-collected" : "uncollected"}`;
    btn.textContent = isCollected ? "Collected" : "Add to Collection";
  }

  function updateModalFavoriteBtn(btn, isFavorite) {
    btn.className = `pin-detail-favorite-btn ${isFavorite ? "is-favorite" : ""}`;
    btn.innerHTML = `<i class="${isFavorite ? "ph-fill ph-star" : "ph ph-star"}"></i><span>${isFavorite ? "Favorited" : "Favorite"}</span>`;
  }

  function bindModalEvents() {
    const overlay = document.getElementById("pin-modal-overlay");
    const closeBtn = document.getElementById("pin-modal-close");

    closeBtn.addEventListener("click", () => overlay.classList.add("hidden"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.add("hidden");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
        overlay.classList.add("hidden");
      }
    });
  }

  // ── Helpers ─────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Boot ────────────────────────────────────────────────
  // Expose so script.js's initApp() can call us after the auth gate passes.
  // This avoids racing Auth.verify() and hitting /my/pins/stats with a
  // token that hasn't been validated yet.
  window.initializePinsPage = init;
})();
