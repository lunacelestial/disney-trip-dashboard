// ============================================================
// Park Pulse — Wait Time Intelligence
// Renders a "Park Pulse" card on the dashboard showing live
// wait time summaries, crowd trends, and park hop rankings.
//
// Depends on: script.js (apiFetch)
// ============================================================

const PARK_PULSE = (() => {

  // Park display config (matches existing PARK_CONFIG in script.js)
  const PARK_META = {
    "75ea578a-adc8-4116-a54d-dccb60765ef9": {
      name: "Magic Kingdom",
      emoji: "🏰",
      color: "#0030A0",
      bg: "#EEF2FF",
    },
    "47f90d2c-e191-4239-a466-5892ef59a88b": {
      name: "EPCOT",
      emoji: "🌍",
      color: "#007A5E",
      bg: "#ECFDF5",
    },
    "288747d1-8b4f-4a64-867e-ea7c9b27bad8": {
      name: "Hollywood Studios",
      emoji: "🎬",
      color: "#7C2D12",
      bg: "#FFF7ED",
    },
    "1c84a229-8862-4648-9c71-378ddd2c7693": {
      name: "Animal Kingdom",
      emoji: "🦁",
      color: "#166534",
      bg: "#F0FDF4",
    },
  };

  // ── Crowd level helpers ───────────────────────────────────

  function crowdLabel(score) {
    if (score === null) return { label: "No data", dot: "⚪", cls: "crowd-unknown" };
    if (score < 0.70)   return { label: "Very light", dot: "🟢", cls: "crowd-low" };
    if (score < 0.85)   return { label: "Light",      dot: "🟢", cls: "crowd-low" };
    if (score < 1.15)   return { label: "Normal",     dot: "🟡", cls: "crowd-normal" };
    if (score < 1.35)   return { label: "Busy",       dot: "🟠", cls: "crowd-high" };
    return              { label: "Very busy",          dot: "🔴", cls: "crowd-max" };
  }

  function trendArrow(trend) {
    if (trend === "rising")  return '<span class="pulse-trend rising" title="Wait times rising">↑</span>';
    if (trend === "falling") return '<span class="pulse-trend falling" title="Wait times falling">↓</span>';
    return                          '<span class="pulse-trend stable" title="Stable">→</span>';
  }

  function waitStr(val) {
    return val !== null ? `${val} min` : "—";
  }

  function rankMedal(rank) {
    return ["🥇","🥈","🥉","4️⃣"][rank - 1] ?? rank;
  }

  // ── Time-since helper ─────────────────────────────────────

  function timeSince(isoStr) {
    if (!isoStr) return "";
    const diff = Math.round((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (diff < 1)  return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff/60)}h ${diff % 60}m ago`;
  }

  // ── Render ────────────────────────────────────────────────

  async function render(containerId = "park-pulse-container") {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="park-pulse-card">
        <div class="pulse-header">
          <div>
            <p class="site-eyebrow">Live Intelligence</p>
            <h2 class="section-title">Park Pulse</h2>
          </div>
          <button class="pulse-refresh-btn" id="pulse-refresh" title="Refresh">↻</button>
        </div>
        <div class="pulse-loading">
          <div class="pulse-spinner"></div>
          <p>Checking wait times…</p>
        </div>
      </div>
    `;

    document.getElementById("pulse-refresh")?.addEventListener("click", () => render(containerId));

    try {
      const [compareData, rankData] = await Promise.all([
        apiFetch("/wait-times/compare"),
        apiFetch("/wait-times/hop-ranking"),
      ]);

      if (!compareData.available) {
        renderUnavailable(container);
        return;
      }

      renderContent(container, compareData, rankData);
    } catch (err) {
      console.error("[ParkPulse] fetch error:", err);
      renderUnavailable(container);
    }
  }

  function renderUnavailable(container) {
    container.innerHTML = `
      <div class="park-pulse-card">
        <div class="pulse-header">
          <div>
            <p class="site-eyebrow">Live Intelligence</p>
            <h2 class="section-title">Park Pulse</h2>
          </div>
        </div>
        <div class="pulse-unavailable">
          <span style="font-size:2.5rem;">⏳</span>
          <p>Wait time data is being collected.<br>Check back after the first 15-minute sample.</p>
        </div>
      </div>
    `;
  }

  function renderContent(container, compareData, rankData) {
    const asOf = timeSince(compareData.as_of);

    // Build park rows keyed by park_id
    const compareMap = {};
    for (const p of (compareData.parks || [])) compareMap[p.park_id] = p;

    const rankMap = {};
    for (const p of (rankData.ranking || [])) rankMap[p.park_id] = p;

    // ── Summary rows ──────────────────────────────────────
    const summaryRows = (rankData.ranking || []).map(park => {
      const cmp  = compareMap[park.park_id] || {};
      const meta = PARK_META[park.park_id]  || {};
      const cl   = crowdLabel(park.crowd_score);

      return `
        <div class="pulse-park-row ${cl.cls}" data-park-id="${park.park_id}">
          <div class="pulse-park-left">
            <span class="pulse-rank">${rankMedal(park.rank)}</span>
            <div class="pulse-park-info">
              <span class="pulse-park-name">${meta.emoji || ""} ${park.park_name}</span>
              <span class="pulse-park-verdict">${park.verdict}</span>
            </div>
          </div>
          <div class="pulse-park-right">
            <div class="pulse-stat-group">
              <span class="pulse-stat-label">Now</span>
              <span class="pulse-stat-value">${waitStr(park.current_avg)}</span>
            </div>
            <div class="pulse-stat-group">
              <span class="pulse-stat-label">Morning</span>
              <span class="pulse-stat-value">${waitStr(cmp.morning_avg)}</span>
            </div>
            <div class="pulse-stat-group">
              <span class="pulse-stat-label">Typical</span>
              <span class="pulse-stat-value">${waitStr(park.hist_avg)}</span>
            </div>
            <div class="pulse-trend-wrap">
              ${trendArrow(park.trend)}
            </div>
          </div>
        </div>
      `;
    }).join("");

    // ── Hop recommendation ────────────────────────────────
    const best = (rankData.ranking || [])[0];
    const bestMeta = best ? PARK_META[best.park_id] : null;

    const hopHtml = best ? `
      <div class="pulse-hop-banner">
        <div class="pulse-hop-icon">🎯</div>
        <div class="pulse-hop-text">
          <strong>Best park hop right now:</strong>
          ${bestMeta?.emoji ?? ""} ${best.park_name}
          <span class="pulse-hop-avg">avg ${waitStr(best.current_avg)}</span>
          ${best.crowd_score !== null ? `— <em>${crowdLabel(best.crowd_score).label.toLowerCase()} crowds</em>` : ""}
        </div>
      </div>
    ` : "";

    container.innerHTML = `
      <div class="park-pulse-card">
        <div class="pulse-header">
          <div>
            <p class="site-eyebrow">Live Intelligence</p>
            <h2 class="section-title">Park Pulse</h2>
          </div>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <span class="pulse-as-of">Updated ${asOf}</span>
            <button class="pulse-refresh-btn" id="pulse-refresh" title="Refresh">↻</button>
          </div>
        </div>

        ${hopHtml}

        <div class="pulse-legend">
          <span>Ranked quietest → busiest</span>
          <span class="pulse-legend-cols">Now · Morning · Typical</span>
        </div>

        <div class="pulse-park-list">
          ${summaryRows}
        </div>

        <p class="pulse-footnote">
          Sampled every 15 min · Trend vs same day-of-week over last 30 days
        </p>
      </div>
    `;

    // Wire refresh button
    document.getElementById("pulse-refresh")?.addEventListener("click", () => {
      const el = document.getElementById("pulse-refresh");
      if (el) el.classList.add("spinning");
      render(container.id || "park-pulse-container").finally(() => {
        document.getElementById("pulse-refresh")?.classList.remove("spinning");
      });
    });

    // Wire park rows → drill-down modal
    container.querySelectorAll(".pulse-park-row").forEach(row => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        openParkDrilldown(row.dataset.parkId);
      });
    });
  }

  // ── Drill-down modal: all attractions for one park ────────

  async function openParkDrilldown(parkId) {
    const meta = PARK_META[parkId];
    if (!meta) return;

    const overlay = document.getElementById("pulse-modal-overlay");
    const body    = document.getElementById("pulse-modal-body");
    if (!overlay || !body) return;

    body.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <div class="pulse-spinner"></div>
        <p style="margin-top:1rem; color:var(--muted);">Loading ${meta.name}…</p>
      </div>
    `;
    overlay.classList.remove("hidden");

    try {
      const data = await apiFetch(`/wait-times/live/${parkId}`);
      const trends = await apiFetch(`/wait-times/trends/${parkId}`);

      if (!data.available) {
        body.innerHTML = `<p style="text-align:center; color:var(--muted); padding:2rem;">No data yet for ${meta.name}.</p>`;
        return;
      }

      const rows = (data.attractions || []).map(a => {
        const statusDot = a.status === "OPERATING" ? "🟢"
                        : a.status === "DOWN"      ? "🔴"
                        : "⚫";
        const waitDisplay = a.status !== "OPERATING" ? `<span style="color:var(--muted); font-size:0.85rem;">${a.status.toLowerCase()}</span>`
                          : a.wait_minutes !== null   ? `<strong>${a.wait_minutes} min</strong>`
                          : `<span style="color:var(--muted);">—</span>`;

        return `
          <div class="pulse-attraction-row">
            <span class="pulse-attraction-status">${statusDot}</span>
            <span class="pulse-attraction-name">${a.attraction_name}</span>
            <span class="pulse-attraction-wait">${waitDisplay}</span>
          </div>
        `;
      }).join("");

      // Simple trend chart (text sparkline)
      let trendHtml = "";
      if (trends.trend?.length > 1) {
        const maxWait = Math.max(...trends.trend.map(t => t.avg_wait || 0));
        const bars = trends.trend.map(t => {
          const pct = maxWait > 0 ? Math.round((t.avg_wait / maxWait) * 8) : 0;
          const bar = "▁▂▃▄▅▆▇█"[Math.min(pct, 7)];
          const h   = `${parseInt(t.hour, 10) % 12 || 12}${parseInt(t.hour, 10) < 12 ? "am" : "pm"}`;
          return `<span title="${h}: avg ${t.avg_wait} min">${bar}</span>`;
        }).join("");

        trendHtml = `
          <div class="pulse-trend-chart">
            <p class="pulse-trend-label">Today's wait trend</p>
            <div class="pulse-sparkline">${bars}</div>
          </div>
        `;
      }

      body.innerHTML = `
        <div class="pulse-modal-park-header" style="background:${meta.bg}; color:${meta.color};">
          <span style="font-size:1.8rem;">${meta.emoji}</span>
          <div>
            <h3 style="margin:0; font-family:'Mouse Memoirs',sans-serif; letter-spacing:0.04em;">${meta.name}</h3>
            <p style="margin:0; font-size:0.78rem; opacity:0.75;">Sampled ${timeSince(data.sampled_at)}</p>
          </div>
        </div>

        ${trendHtml}

        <div class="pulse-attraction-list">
          ${rows}
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<p style="text-align:center; color:var(--muted); padding:2rem;">Could not load data.</p>`;
    }
  }

  // ── Public API ────────────────────────────────────────────
  return { render, openParkDrilldown };

})();

// ── Modal wiring (add once to any page that includes this) ──
document.addEventListener("DOMContentLoaded", () => {
  // Inject modal markup if not already present
  if (!document.getElementById("pulse-modal-overlay")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div id="pulse-modal-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true">
        <div class="modal-box pulse-modal-box">
          <button class="modal-close-btn" id="pulse-modal-close" aria-label="Close">✕</button>
          <div id="pulse-modal-body"></div>
        </div>
      </div>
    `);

    document.getElementById("pulse-modal-close")?.addEventListener("click", () => {
      document.getElementById("pulse-modal-overlay")?.classList.add("hidden");
    });
    document.getElementById("pulse-modal-overlay")?.addEventListener("click", e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
    });
  }
});
