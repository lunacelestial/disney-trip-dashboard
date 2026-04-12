// ============================================================
// DASHBOARD — Next Activity, Later Today, Budget & Wishlist cards
// Depends on: script.js (core)
// ============================================================

function getNextActivity(itinerary) {
  if (!Array.isArray(itinerary) || itinerary.length === 0) return null;

  const sorted = sortItineraryByTime(itinerary);
  const now = new Date();
  const todayString = getTodayString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const ACTIVITY_DURATIONS = {
    ride: 10, dining: 45, show: 30, merch: 20,
    shopping: 20, travel: 30, break: 30,
  };

  const upcoming = sorted.find((activity) => {
    if ((activity.date || "") > todayString) return true;

    if ((activity.date || "") === todayString) {
      const actMinutes = timeStringToMinutes(activity.time);
      if (actMinutes >= nowMinutes) return true;
      const type = (activity.type || "").toLowerCase();
      const durationMins = ACTIVITY_DURATIONS[type] || 15;
      if (actMinutes + durationMins >= nowMinutes) return true;
    }
    return false;
  });

  return upcoming || null;
}

async function renderNextActivityCard() {
  const titleEl = document.getElementById("next-activity-title");
  const detailsEl = document.getElementById("next-activity-details");
  const countdownEl = document.getElementById("next-activity-countdown");
  const iconEl = document.getElementById("next-activity-icon");
  const dateEl = document.getElementById("next-activity-date");
  const card = document.getElementById("next-activity-card");

  if (!titleEl || !detailsEl) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const itinerary = await filterToCurrentTrip(allSorted);

  if (itinerary.length === 0) {
    titleEl.textContent = "No activities planned";
    detailsEl.textContent = "Add activities on the itinerary page to get started.";
    if (countdownEl) countdownEl.textContent = "";
    if (iconEl) iconEl.textContent = "🗓️";
    if (dateEl) dateEl.textContent = "";
    return;
  }

  const nextActivity = getNextActivity(itinerary);

  if (!nextActivity) {
    const todayStr = getTodayString();
    const todayActivities = itinerary.filter(a => a.date === todayStr);
    if (todayActivities.length > 0) {
      titleEl.textContent = "All done for today!";
      detailsEl.textContent = "Relax and enjoy the rest of your evening. ✨";
      if (iconEl) iconEl.textContent = "🌙";
      if (dateEl) dateEl.textContent = "";
      if (countdownEl) countdownEl.innerHTML = "";
    } else {
      titleEl.textContent = "No activities planned";
      detailsEl.textContent = "Add activities on the itinerary page to get started.";
      if (iconEl) iconEl.textContent = "🗓️";
      if (dateEl) dateEl.textContent = "";
      if (countdownEl) countdownEl.textContent = "";
    }
    return;
  }

  titleEl.textContent = nextActivity.title;
  detailsEl.textContent = `${formatTimeForDisplay(nextActivity.time)} • ${nextActivity.location}`;

  const typeIcons = { ride: "🎢", dining: "🍽️", show: "🎭", merch: "🛍️", shopping: "🛍️", break: "☀️" };
  const type = (nextActivity.type || "").toLowerCase();
  if (iconEl) {
    if (type === "travel") {
      const cfg = getETicketConfig("travel", nextActivity.title);
      iconEl.textContent = cfg.icon;
    } else {
      iconEl.textContent = typeIcons[type] || "🏰";
    }
  }

  if (card) {
    card.className = card.className.replace(/next-act-theme-\w+/g, "").trim();
    card.classList.add(`next-act-theme-${type || "default"}`);
  }

  if (dateEl && nextActivity.date) {
    const [y, m, d] = nextActivity.date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dateEl.textContent = dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  if (countdownEl) {
    updateNextActivityCountdown(nextActivity, countdownEl);
    if (window._nextActCountdownInterval) clearInterval(window._nextActCountdownInterval);
    window._nextActCountdownInterval = setInterval(() => {
      updateNextActivityCountdown(nextActivity, countdownEl);
    }, 30000);
  }
}

function updateNextActivityCountdown(activity, el) {
  if (!activity || !activity.date || !activity.time) {
    el.textContent = "";
    return;
  }

  const [h, m] = activity.time.split(":").map(Number);
  const [y, mo, d] = activity.date.split("-").map(Number);
  const activityTime = new Date(y, mo - 1, d, h, m, 0);
  const now = new Date();
  const diffMs = activityTime - now;

  const ACTIVITY_DURATIONS = {
    ride: 10, dining: 45, show: 30, merch: 20,
    shopping: 20, travel: 30, break: 30,
  };

  const type = (activity.type || "").toLowerCase();
  const durationMins = ACTIVITY_DURATIONS[type] || 15;
  const endTimeMs = activityTime.getTime() + (durationMins * 60 * 1000);

  if (diffMs <= 0 && now.getTime() < endTimeMs) {
    const minsElapsed = Math.floor((now.getTime() - activityTime.getTime()) / 60000);
    const minsLeft = durationMins - minsElapsed;

    if (minsLeft > 0) {
      el.innerHTML = `<span class="countdown-now">Happening now! ~${minsLeft}m left</span>`;
    } else {
      el.innerHTML = `<span class="countdown-now">Wrapping up...</span>`;
    }
    return;
  }

  if (diffMs <= 0 && now.getTime() >= endTimeMs) {
    if (!window._nextActAutoAdvanced) {
      window._nextActAutoAdvanced = true;

      if (type === "dining" && !window._diningFeedbackShown?.[activity.id]) {
        if (!window._diningFeedbackShown) window._diningFeedbackShown = {};
        window._diningFeedbackShown[activity.id] = true;
        setTimeout(() => {
          showDiningFeedbackModal(activity);
          window._nextActAutoAdvanced = false;
          renderNextActivityCard();
          renderDashboardItinerary();
        }, 1000);
      } else {
        setTimeout(() => {
          window._nextActAutoAdvanced = false;
          renderNextActivityCard();
          renderDashboardItinerary();
        }, 500);
      }
    }
    el.innerHTML = `<span class="countdown-now">Wrapping up...</span>`;
    return;
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const remainHours = diffHours % 24;
  const remainMins = diffMins % 60;

  let text = "";
  if (diffDays > 0) {
    text = `${diffDays}d ${remainHours}h`;
  } else if (diffHours > 0) {
    text = `${diffHours}h ${remainMins}m`;
  } else {
    text = `${remainMins}m`;
  }

  el.innerHTML = `
    <span class="urgency-phrase" id="urgency-phrase-el"></span> 
    <span class="countdown-label">in</span> 
    <span class="countdown-value">${text}</span>
  `;

  if (navigator.geolocation && resolveDisneyLocation(activity.location)) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const destination = resolveDisneyLocation(activity.location);
        if (!destination) return;

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const distance = haversineDistance(userLat, userLng, destination.lat, destination.lng);
        const walkSeconds = Math.round(distance / 1.2);
        const arrivalTimeMs = now.getTime() + (walkSeconds * 1000);
        const bufferMs = activityTime.getTime() - arrivalTimeMs;
        const bufferMins = Math.floor(bufferMs / 60000);

        let phrase = "";
        if (bufferMins >= 30) {
          phrase = "You've got plenty of time, it's";
        } else if (bufferMins >= 15 && bufferMins < 30) {
          phrase = "Start wrappin' up, it's";
        } else if (bufferMins >= 5 && bufferMins < 15) {
          if ((activity.type || "").toLowerCase() === "dining") {
            phrase = "You should really be on your way, it's";
          } else {
            phrase = "Get ready!!! It's";
          }
        } else {
          phrase = "You should really be on your way, it's";
        }

        const phraseEl = document.getElementById("urgency-phrase-el");
        if (phraseEl) phraseEl.textContent = phrase;
      },
      () => {},
      { maximumAge: 60000, timeout: 5000 }
    );
  }
}

// Dashboard E-TICKET Style Schedule Cards ("Later Today" row)
async function renderDashboardItinerary() {
  const listEl = document.getElementById("dashboard-itinerary-list");
  if (!listEl) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const itinerary = await filterToCurrentTrip(allSorted);
  if (itinerary.length === 0) {
    listEl.innerHTML = '<p style="color: #64748b;">No activities planned yet.</p>';
    return;
  }

  const now = new Date();
  const todayString = getTodayString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayUpcoming = itinerary.filter((activity) => {
    if ((activity.date || "") !== todayString) return false;
    return timeStringToMinutes(activity.time) >= nowMinutes;
  });

  const laterActivities = todayUpcoming.slice(1, 6);

  if (laterActivities.length === 0) {
     listEl.innerHTML = '<p style="color: #64748b; font-size: 1.1rem;">No more activities planned today. Time to relax!</p>';
     return;
  }

  listEl.innerHTML = laterActivities.map((activity, idx) => {
    const cfg = getETicketConfig(activity.type, activity.title);
    const displayNotes = getDisplayNotes(activity);

    return `
      <article class="eticket clickable-card" data-id="${activity.id}" role="button" tabindex="0"
               aria-label="View details for ${escapeHtml(activity.title)}"
               style="background: ${cfg.bg}; border-color: ${cfg.border}; --et-text: ${cfg.text}; --et-accent: ${cfg.accent}; --et-stripe: ${cfg.stripe}; --et-label-bg: ${cfg.labelBg}; animation-delay: ${idx * 0.08}s;">

        <div class="et-header">
          <span class="et-letter">${cfg.letter}</span>
          <div class="et-branding">
            <span class="et-disney-mark">${getTicketParkBranding(activity.location).mark}</span>
            ${getTicketParkBranding(activity.location).coupon ? `<span class="et-coupon-label">${getTicketParkBranding(activity.location).coupon}</span>` : ""}
          </div>
        </div>

        <div class="et-body">
          <span class="et-icon">${cfg.icon}</span>
          <div class="et-info">
            <h3 class="et-name">${escapeHtml(activity.title)}</h3>
            <p class="et-location">${escapeHtml(activity.location)}</p>
          </div>
        </div>

        <div class="et-time-strip">
          <span class="et-time">${formatTimeForDisplay(activity.time)}</span>
          ${displayNotes ? `<span class="et-note">${escapeHtml(displayNotes)}</span>` : ""}
        </div>

        <div class="et-footer">
          <span class="et-admit">ADMIT ONE</span>
          <span class="et-serial">${String(activity.id || "").slice(-5).toUpperCase()}</span>
        </div>
      </article>
    `;
  }).join('');
}

// ── Dashboard Budget & Wishlist Cards ────────────────────────

async function renderDashboardBudgetCard() {
  const h3 = document.getElementById("dashboard-budget-h3");
  const p = document.getElementById("dashboard-budget-p");
  if (!h3) return;

  try {
    const allTrips = await apiFetch("/trip-budgets");
    const today = new Date().toISOString().split("T")[0];
    const trip = allTrips.find(t => today >= t.start_date && today <= t.end_date)
      || allTrips.find(t => t.start_date > today)
      || allTrips[0];

    if (!trip) {
      h3.textContent = "No budget set";
      if (p) p.textContent = "Configure on the Budget page.";
    } else {
      const remaining = trip.total - trip.spent;
      h3.textContent = `$${trip.spent.toFixed(2)} Spent`;
      if (p) p.textContent = `$${remaining.toFixed(2)} Remaining`;
    }
  } catch (e) {
    h3.textContent = "No budget set";
    if (p) p.textContent = "Configure on the Budget page.";
  }
}

async function renderDashboardWishlistCard() {
  const h3 = document.getElementById("dashboard-wishlist-h3");
  const p = document.getElementById("dashboard-wishlist-p");
  if (!h3) return;

  const items = await WishlistDB.getAll();

  if (items.length === 0) {
    h3.textContent = "Wishlist is empty";
    if (p) p.textContent = "Add items on the Wishlist page.";
  } else {
    const top2 = items.slice(0, 2).map(i => i.title).join(" + ");
    h3.textContent = top2;
    if (p) p.textContent = `${items.length} item${items.length === 1 ? "" : "s"} on your wishlist`;

    const carouselEl = document.getElementById("wishlist-spotlight-carousel");
    if (carouselEl) {
      const imageItems = items.filter(i => {
        if (!i.image) return false;
        return i.image.startsWith("data:") || i.image.length > 0;
      });
      if (imageItems.length > 0) {
        let imgIdx = 0;
        const showImage = () => {
          const item = imageItems[imgIdx % imageItems.length];
          const src = item.image.startsWith("data:") ? item.image : `/api/wishlist/image/${item.image}`;
          carouselEl.style.backgroundImage = `url('${src}')`;
          imgIdx++;
        };
        showImage();
        if (imageItems.length > 1) {
          setInterval(showImage, 5000);
        }
      }
    }
  }
}

// ── Trip Switcher ────────────────────────────────────────────

async function renderTripSwitcher() {
  const switcher = document.getElementById("trip-switcher");
  if (!switcher) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const tripBudgets = await loadTripBudgets();
  const tripGroups = buildTripsFromBudgets(allSorted, tripBudgets);

  if (tripGroups.length <= 1 && tripGroups.every(tg => tg.activities.length === 0 && !tg.label)) {
    switcher.classList.add("hidden");
    return;
  }

  const autoIdx = detectCurrentTripGroupIndex(tripGroups);
  const activeIdx = selectedTripIndex >= 0 ? Math.min(selectedTripIndex, tripGroups.length - 1) : autoIdx;
  const selectedGroup = tripGroups[activeIdx];

  let countdownHtml = "";
  if (selectedGroup) {
    const status = getTripGroupStatus(selectedGroup);
    if (status === "upcoming") {
      const [fy, fm, fd] = selectedGroup.start.split("-").map(Number);
      const tripStart = new Date(fy, fm - 1, fd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((tripStart - today) / (1000 * 60 * 60 * 24));
      if (daysUntil === 1) countdownHtml = `<span style="font-size:0.85rem; font-weight:800; color:var(--sky-blue); margin-left:0.5rem;">Tomorrow!</span>`;
      else if (daysUntil > 0) countdownHtml = `<span style="font-size:0.85rem; font-weight:800; color:var(--sky-blue); margin-left:0.5rem;">${daysUntil} days away</span>`;
    } else if (status === "active") {
      countdownHtml = `<span style="font-size:0.85rem; font-weight:800; color:var(--pixie-gold-dark); margin-left:0.5rem;">🌟 Current Trip</span>`;
    }
  }

  const tripOptions = tripGroups.map((tg, i) => {
    const label = getTripGroupLabel(tg);
    const s = getTripGroupStatus(tg);
    const tag = s === "active" ? " 🌟 Now" : s === "past" ? " ✅ Past" : " 🗓️ Upcoming";
    const actCount = tg.activities.length;
    return `<option value="${i}" ${i === activeIdx ? "selected" : ""}>${label}${tag} (${actCount} activities)</option>`;
  }).join("");

  switcher.classList.remove("hidden");
  switcher.innerHTML = `
    <div class="budget-trip-pill">
      <label class="card-label">Viewing Itinerary For</label>
      <select id="trip-switcher-select">${tripOptions}</select>
      ${countdownHtml}
    </div>
  `;

  document.getElementById("trip-switcher-select")?.addEventListener("change", async (e) => {
    selectedTripIndex = parseInt(e.target.value);
    await renderTripSwitcher();
    await renderItinerary();
    await renderParkDayBanner();
  });
}

// ── Dashboard click handlers ─────────────────────────────────

async function handleDashboardListClick(event) {
  const card = event.target.closest(".clickable-card");
  if (card && card.dataset.id) {
    const itinerary = await getStoredItinerary();
    const activity = itinerary.find(a => a.id === card.dataset.id);
    if (activity) openActivityModal(activity);
  }
}

async function initializeDashboardPage() {
  // Only run on the dashboard page
  const titleEl = document.querySelector(".page-dashboard .entrance-title");
  if (!titleEl) return;

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "Pal";

  // Determine user's trip state
  const todayStr = getTodayString();
  let allTrips = [];
  try { allTrips = await apiFetch("/trip-budgets"); } catch (e) { }

  // Filter to trips the user is a member of (or all trips for admin)
  let myTrips = allTrips;
  if (user && user.role !== "admin") {
    try {
      const memberTrips = await apiFetch(`/users/${user.id}/trips`);
      const memberTripIds = new Set(memberTrips.map(t => t.trip_id));
      // Show trips user is assigned to, plus any without members (unassigned trips)
      myTrips = allTrips.filter(t => {
        return memberTripIds.has(t.trip_id);
      });
    } catch (e) {
      // On error, fall through to normal dashboard
    }
  }

  const activeTrip = myTrips.find(t => todayStr >= t.start_date && todayStr <= t.end_date);
  const upcomingTrip = myTrips.find(t => t.start_date > todayStr);
  const pastTrips = myTrips.filter(t => t.end_date < todayStr);

  // ── State 1: Active trip → show normal dashboard ──
  if (activeTrip) {
    titleEl.innerHTML = `Hi!<br><span class="entrance-title-name">${escapeHtml(firstName)}</span>`;
    renderNormalDashboard();
    return;
  }

  // ── State 2: Upcoming trip → redirect to pretrip ──
  if (upcomingTrip) {
    // Don't redirect if they explicitly navigated to index.html with a hash
    if (!window.location.hash.includes("stay")) {
      window.location.href = "pretrip.html";
      return;
    }
  }

  // ── State 3: No future trips → show memories view ──
  if (!activeTrip && !upcomingTrip) {
    titleEl.innerHTML = `Welcome back,<br><span class="entrance-title-name">${escapeHtml(firstName)}</span>`;
    renderMemoriesDashboard(pastTrips, firstName);
    return;
  }

  // Fallback — normal dashboard
  titleEl.innerHTML = `Hi!<br><span class="entrance-title-name">${escapeHtml(firstName)}</span>`;
  renderNormalDashboard();
}

function renderNormalDashboard() {
  renderNextActivityCard();
  renderDashboardItinerary();
  renderRecommendationStrip();
  renderDashboardBudgetCard();
  renderDashboardWishlistCard();
  renderWaitTimesCard();
  renderChaserSpotlight();
  startDashboardAutoRefresh();

  const dashList = document.getElementById("dashboard-itinerary-list");
  if (dashList) {
    dashList.addEventListener("click", handleDashboardListClick);
    dashList.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleDashboardListClick(e);
      }
    });
  }
}

// ── Auto-refresh: re-render activity cards when the current one passes ──
function startDashboardAutoRefresh() {
  if (window._dashRefreshInterval) clearInterval(window._dashRefreshInterval);

  // Track what the "next activity" is so we can detect when it changes
  let lastNextId = null;

  window._dashRefreshInterval = setInterval(async () => {
    try {
      const allSorted = sortItineraryByTime(await getStoredItinerary());
      const itinerary = await filterToCurrentTrip(allSorted);
      const next = getNextActivity(itinerary);
      const nextId = next ? next.id : null;

      // If the next activity changed (previous one ended or was removed), refresh
      if (nextId !== lastNextId) {
        lastNextId = nextId;
        renderNextActivityCard();
        renderDashboardItinerary();
      }
    } catch (e) {
      // Silently ignore — will retry next interval
    }
  }, 60000); // Check every 60 seconds
}

// ── Live Wait Times Card ──────────────────────────────────────
// Shown during an active trip when today is a park day.
// Fetches live wait times from ThemeParks.wiki.

const WAIT_TIMES_PARK_IDS = {
  "magic-kingdom":     "75ea578a-adc8-4116-a54d-dccb60765ef9",
  "epcot":             "47f90d2c-e191-4239-a466-5892ef59a88b",
  "hollywood-studios": "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
  "animal-kingdom":    "1c84a229-8862-4648-9c71-378ddd2c7693",
};

const WAIT_PARK_LABELS = {
  "magic-kingdom":     "🏰 Magic Kingdom",
  "epcot":             "🌍 EPCOT",
  "hollywood-studios": "🎬 Hollywood Studios",
  "animal-kingdom":    "🌿 Animal Kingdom",
};

async function renderWaitTimesCard() {
  const section = document.getElementById("wait-times-section");
  if (!section) return;

  // Only show during active trip
  const todayStr = new Date().toISOString().split("T")[0];
  let allTrips = [];
  try { allTrips = await apiFetch("/trip-budgets"); } catch (e) { return; }
  const activeTrip = allTrips.find(t => todayStr >= t.start_date && todayStr <= t.end_date);
  if (!activeTrip) return;

  // Only show if today is a assigned park day
  const allParkDays = await ParkDaysDB.getAll();
  const todayPark = allParkDays.find(pd => pd.date === todayStr);
  if (!todayPark) return;

  const parkId = WAIT_TIMES_PARK_IDS[todayPark.park];
  const parkLabel = WAIT_PARK_LABELS[todayPark.park] || todayPark.park;
  if (!parkId) return;

  // Show skeleton while loading
  section.style.display = "";
  section.innerHTML = `
    <div class="info-card" style="margin-bottom:0;">
      <p class="card-label">⏱️ Live Wait Times · ${parkLabel}</p>
      <p style="color:var(--muted); font-size:0.9rem;">Fetching live data...</p>
    </div>
  `;

  try {
    const data = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/live`)
      .then(r => { if (!r.ok) throw new Error("API error"); return r.json(); });

    // Filter to operating rides with wait times, sort by wait ascending
    const rides = (data.liveData || [])
      .filter(r => r.entityType === "ATTRACTION" && r.status === "OPERATING" && r.queue?.STANDBY?.waitTime != null)
      .sort((a, b) => a.queue.STANDBY.waitTime - b.queue.STANDBY.waitTime);

    if (rides.length === 0) {
      section.style.display = "none";
      return;
    }

    // Show top 12 rides (shortest waits first — useful for planning)
    const shown = rides.slice(0, 12);
    const maxWait = Math.max(...shown.map(r => r.queue.STANDBY.waitTime), 1);

    const rideRows = shown.map(r => {
      const wait = r.queue.STANDBY.waitTime;
      const pct = Math.round((wait / maxWait) * 100);
      const color = wait <= 20 ? "#22c55e" : wait <= 45 ? "#f59e0b" : "#ef4444";
      return `
        <div style="display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0; border-bottom:1px solid rgba(0,0,0,0.04);">
          <div style="flex:1; min-width:0;">
            <p style="margin:0; font-size:0.88rem; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.name)}</p>
            <div style="height:4px; background:#f1f5f9; border-radius:999px; margin-top:3px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${color}; border-radius:999px; transition:width 0.4s ease;"></div>
            </div>
          </div>
          <span style="font-family:'Mouse Memoirs',sans-serif; font-size:1.05rem; color:${color}; min-width:44px; text-align:right; flex-shrink:0;">${wait}m</span>
        </div>
      `;
    }).join("");

    const updatedAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    section.innerHTML = `
      <div class="info-card" style="margin-bottom:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <p class="card-label" style="margin:0;">⏱️ Live Wait Times · ${parkLabel}</p>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="font-size:0.72rem; color:var(--muted); font-weight:600;">Updated ${updatedAt}</span>
            <button id="wait-times-refresh-btn" style="background:none; border:1.5px solid #e2e8f0; border-radius:8px; padding:0.2rem 0.6rem; cursor:pointer; font-size:0.75rem; font-weight:700; color:var(--castle-blue); font-family:'Nunito',sans-serif;">↻ Refresh</button>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 1.5rem;">
          <div>${rideRows.slice(0, Math.ceil(rideRows.length / 2)).join("")}</div>
          <div>${rideRows.slice(Math.ceil(rideRows.length / 2)).join("")}</div>
        </div>
        <p style="font-size:0.7rem; color:var(--muted); margin:0.75rem 0 0; text-align:right;">
          Shortest waits shown first · <a href="https://queue-times.com" target="_blank" rel="noopener" style="color:var(--muted);">Data: ThemeParks.wiki</a>
        </p>
      </div>
    `;

    document.getElementById("wait-times-refresh-btn")?.addEventListener("click", () => {
      renderWaitTimesCard();
    });

  } catch (err) {
    console.warn("[WaitTimes] Failed to fetch:", err);
    section.style.display = "none";
  }
}

async function renderMemoriesDashboard(pastTrips, firstName) {
  // Hide normal dashboard sections
  const nextActCard = document.getElementById("next-activity-card");
  const scheduleSection = nextActCard?.closest("main");

  if (!scheduleSection) return;

  // Fetch photo counts for past trips
  const tripPhotoCounts = {};
  for (const trip of pastTrips.slice(0, 10)) { // Limit to 10 most recent
    try {
      const photos = await apiFetch(`/trips/${trip.trip_id}/photos`);
      tripPhotoCounts[trip.trip_id] = photos.length;
    } catch (e) {
      tripPhotoCounts[trip.trip_id] = 0;
    }
  }

  let tripsHtml = "";
  if (pastTrips.length === 0) {
    tripsHtml = `
      <div style="text-align:center; padding:2.5rem 1.5rem; background:rgba(255,253,244,0.92); border-radius:20px; box-shadow:var(--card-shadow);">
        <div style="font-size:3rem; margin-bottom:0.75rem;">🏰</div>
        <h3 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.5rem; color:var(--castle-blue); margin:0 0 0.5rem;">No Trips Yet</h3>
        <p style="color:var(--slate); margin:0 0 1.25rem;">Your Disney adventure is waiting to be planned!</p>
        <a href="planner.html" class="primary-button" style="display:inline-block; text-decoration:none;">Plan a Trip ✨</a>
      </div>
    `;
  } else {
    tripsHtml = pastTrips.slice(0, 10).map(trip => {
      const [sy, sm, sd] = trip.start_date.split("-").map(Number);
      const [ey, em, ed] = trip.end_date.split("-").map(Number);
      const startFmt = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endFmt = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const days = Math.round((new Date(ey, em - 1, ed) - new Date(sy, sm - 1, sd)) / (1000 * 60 * 60 * 24)) + 1;
      const photoCount = tripPhotoCounts[trip.trip_id] || 0;

      return `
        <div style="background:rgba(255,253,244,0.92); border-radius:16px; box-shadow:var(--card-shadow); border:1.5px solid rgba(255,255,255,0.85); padding:1.25rem; display:flex; align-items:center; gap:1rem;">
          <div style="font-size:2.2rem; flex-shrink:0;">🏰</div>
          <div style="flex:1; min-width:0;">
            <h3 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.2rem; color:var(--castle-blue); margin:0 0 0.15rem; letter-spacing:0.02em;">${startFmt} – ${endFmt}</h3>
            <p style="font-family:'Nunito',sans-serif; font-size:0.8rem; font-weight:600; color:var(--muted); margin:0;">${days} day${days !== 1 ? "s" : ""}${trip.label ? " · " + escapeHtml(trip.label) : ""}</p>
          </div>
          <div style="display:flex; gap:0.5rem; flex-shrink:0;">
            ${photoCount > 0 ? `
              <a href="photos.html?trip=${encodeURIComponent(trip.trip_id)}" style="display:flex; align-items:center; gap:0.3rem; padding:0.4rem 0.75rem; border-radius:999px; background:var(--castle-blue); color:white; font-family:'Nunito',sans-serif; font-size:0.78rem; font-weight:700; text-decoration:none;">
                📸 ${photoCount}
              </a>
            ` : ''}
            <a href="tripcalendar.html?trip=${encodeURIComponent(trip.trip_id)}" style="display:flex; align-items:center; padding:0.4rem 0.75rem; border-radius:999px; background:rgba(0,48,135,0.08); color:var(--castle-blue); font-family:'Nunito',sans-serif; font-size:0.78rem; font-weight:700; text-decoration:none;">
              🗓️ View
            </a>
          </div>
        </div>
      `;
    }).join("");
  }

  scheduleSection.innerHTML = `
    <section style="margin-bottom:2rem;">
      <div style="text-align:center; margin-bottom:1.5rem;">
        <p style="font-family:'Nunito',sans-serif; font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted);">✨ Looking Back ✨</p>
        <h2 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.8rem; color:var(--castle-blue); margin:0.25rem 0;">Your Disney Memories</h2>
      </div>

      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        ${tripsHtml}
      </div>

      <div style="text-align:center; margin-top:2rem;">
        <a href="history.html" class="secondary-button" style="display:inline-block; text-decoration:none; margin-bottom:0.75rem;">
          View Full Trip History →
        </a>
        <br>
        <a href="planner.html" class="primary-button" style="display:inline-block; text-decoration:none;">
          Plan Your Next Trip ✨
        </a>
      </div>
    </section>
  `;
}
// ── Ride Recommendation Strip ────────────────────────────────
// Shown during an active trip on a park day.
// Sits between the "Later Today" E-ticket row and existing cards.

async function renderRecommendationStrip() {
  const stripEl = document.getElementById("rec-strip-section");
  if (!stripEl) return;

  // Only show during active trip + park day
  const todayStr = new Date().toISOString().split("T")[0];
  let allTrips = [];
  try { allTrips = await apiFetch("/trip-budgets"); } catch (e) { return; }
  const activeTrip = allTrips.find(t => todayStr >= t.start_date && todayStr <= t.end_date);
  if (!activeTrip) { stripEl.style.display = "none"; return; }

  const allParkDays = await ParkDaysDB.getAll();
  const todayPark   = allParkDays.find(pd => pd.date === todayStr);
  if (!todayPark) { stripEl.style.display = "none"; return; }

  const PARK_ID_MAP = {
    "magic-kingdom":     "75ea578a-adc8-4116-a54d-dccb60765ef9",
    "epcot":             "47f90d2c-e191-4239-a466-5892ef59a88b",
    "hollywood-studios": "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
    "animal-kingdom":    "1c84a229-8862-4648-9c71-378ddd2c7693",
  };
  const parkId = PARK_ID_MAP[todayPark.park];
  if (!parkId) { stripEl.style.display = "none"; return; }

  const PARK_LABELS = {
    "magic-kingdom": "Magic Kingdom", "epcot": "EPCOT",
    "hollywood-studios": "Hollywood Studios", "animal-kingdom": "Animal Kingdom",
  };
  const parkLabel = PARK_LABELS[todayPark.park] || todayPark.park;

  // Show skeleton
  stripEl.style.display = "";
  stripEl.innerHTML = `
    <div style="margin-bottom:0.65rem;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.65rem;">
        <span style="font-family:'Nunito',sans-serif; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted);">🎢 Live Wait Times</span>
      </div>
      <div style="display:flex; gap:0.75rem; overflow:hidden;">
        ${[1,2,3].map(() => `<div style="flex:0 0 140px; height:100px; background:#f1f5f9; border-radius:14px; animation:recSkeleton 1.2s ease-in-out infinite;"></div>`).join("")}
      </div>
    </div>
  `;

  let data;
  try {
    data = await apiFetch(`/wait-times/rides/${parkId}`);
  } catch (err) {
    console.warn("[wait-strip] fetch failed:", err);
    stripEl.style.display = "none";
    return;
  }

  if (!data?.available || !data.rides?.length) {
    stripEl.style.display = "none";
    return;
  }

  // Hide when the data is stale (park likely closed) — 90 min threshold
  const STALE_THRESHOLD_MS = 90 * 60 * 1000;
  if (data.sampled_at) {
    const sampleAge = Date.now() - new Date(data.sampled_at).getTime();
    if (sampleAge > STALE_THRESHOLD_MS) {
      stripEl.style.display = "none";
      return;
    }
  }

  let rides = data.rides; // already sorted by wait time ASC from API
  const updatedStr = data.sampled_at
    ? new Date(data.sampled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  // ── Time-safety filter: exclude rides that won't fit before the next activity ──
  const WALK_TIME = 10;      // minutes to walk to/from a ride
  const RIDE_DURATION = 10;  // average ride duration in minutes
  const BUFFER = 5;          // extra buffer minutes

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Get today's remaining scheduled activities
  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const todayActs = allSorted
    .filter(a => a.date === todayStr && a.time)
    .sort((a, b) => a.time.localeCompare(b.time));
  const upcomingActs = todayActs.filter(a => timeStringToMinutes(a.time) > nowMins);
  const nextActTime = upcomingActs.length > 0 ? timeStringToMinutes(upcomingActs[0].time) : null;

  if (nextActTime !== null) {
    rides = rides.filter(ride => {
      const totalTime = WALK_TIME + ride.wait_minutes + RIDE_DURATION + WALK_TIME + BUFFER;
      return (nowMins + totalTime) <= nextActTime;
    });
  }

  // Cap to top 5 recommendations
  rides = rides.slice(0, 5);

  if (!rides.length) {
    stripEl.style.display = "none";
    return;
  }

  // Build ride cards — sorted lowest wait first (left) to highest (right)
  // Color gradient: bright/warm at rank 1 → dark/cool at the end
  const total = rides.length;
  const cardsHtml = rides.map((ride, idx) => {
    const wait = ride.wait_minutes;
    const waitColor = wait <= 20 ? "#22c55e" : wait <= 45 ? "#f59e0b" : "#ef4444";
    const intensityEmoji = { low:"🌤️", moderate:"🎢", high:"⚡", extreme:"🔥" }[ride.intensity] || "🎠";

    const llBadge = ride.lightning_lane === "individual"
      ? `<span style="font-size:0.58rem; font-weight:800; padding:0.1rem 0.3rem; border-radius:4px; background:#fef3c7; color:#92400e; border:1px solid #fde68a; letter-spacing:0.04em;">ILL</span>`
      : ride.lightning_lane === "standard"
      ? `<span style="font-size:0.58rem; font-weight:800; padding:0.1rem 0.3rem; border-radius:4px; background:#e0f2fe; color:#075985; border:1px solid #bae6fd; letter-spacing:0.04em;">LL</span>`
      : "";
    const indoorBadge = ride.indoor === 1 ? `<span style="font-size:0.75rem;" title="Indoors">❄️</span>` : "";

    // Gradient: rank 0 (best) = bright gold/cream → rank N-1 (worst) = deep blue-grey
    const t = total > 1 ? idx / (total - 1) : 0;
    // Background: interpolate from warm cream to cool slate
    const bgR = Math.round(255 - t * 50);
    const bgG = Math.round(253 - t * 60);
    const bgB = Math.round(244 - t * 40);
    const bgA = (0.95 - t * 0.1).toFixed(2);
    const cardBg = `rgba(${bgR},${bgG},${bgB},${bgA})`;
    // Border dims with rank
    const borderA = (0.85 - t * 0.35).toFixed(2);
    const cardBorder = `rgba(255,255,255,${borderA})`;
    // Left accent stripe: gold → slate
    const accentR = Math.round(255 - t * 130);
    const accentG = Math.round(193 - t * 110);
    const accentB = Math.round(37 + t * 120);
    const accent = `rgb(${accentR},${accentG},${accentB})`;
    // Title color darkens
    const titleA = (1 - t * 0.35).toFixed(2);

    // Encode ride data for click-to-add
    const rideData = encodeURIComponent(JSON.stringify({
      name: ride.attraction_name,
      wait: ride.wait_minutes,
      type: ride.type,
      location: parkLabel,
    }));

    return `
      <article class="wait-card" data-ride="${rideData}" style="flex:0 0 140px; background:${cardBg}; border-radius:14px; border:1.5px solid ${cardBorder}; border-left:3px solid ${accent}; box-shadow:0 2px 10px rgba(0,0,0,${(0.07 + t * 0.06).toFixed(2)}); padding:0.7rem 0.8rem; display:flex; flex-direction:column; gap:0.25rem; cursor:pointer;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:1rem;">${intensityEmoji}</span>
          <div style="display:flex; align-items:center; gap:0.2rem;">${indoorBadge}${llBadge}</div>
        </div>
        <h3 style="font-family:'Mouse Memoirs',sans-serif; font-size:0.88rem; color:var(--castle-blue); margin:0; line-height:1.2; letter-spacing:0.02em; flex:1; opacity:${titleA};">${escapeHtml(ride.attraction_name)}</h3>
        <div style="display:flex; align-items:baseline; justify-content:space-between;">
          <span style="font-family:'Mouse Memoirs',sans-serif; font-size:1.4rem; letter-spacing:0.02em; line-height:1; color:${waitColor};">${wait}m</span>
          ${ride.height_req ? `<span style="font-family:'Nunito',sans-serif; font-size:0.62rem; font-weight:700; color:var(--muted);">↑ ${ride.height_req}"</span>` : ""}
        </div>
      </article>
    `;
  }).join("");

  stripEl.innerHTML = `
    <style>
      @keyframes recSkeleton { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
      .wait-marquee-wrapper {
        overflow: hidden;
        -webkit-mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
        mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
      }
      .wait-marquee-track {
        display: flex;
        gap: 0.75rem;
        width: max-content;
        will-change: transform;
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
      }
      .wait-marquee-track.is-dragging { cursor: grabbing; }
    </style>
    <div style="margin-bottom:1.5rem;">
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:0.65rem; flex-wrap:wrap; gap:0.25rem;">
        <span style="font-family:'Nunito',sans-serif; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted);">🎢 Live Wait Times · ${escapeHtml(parkLabel)}</span>
        <span style="font-size:0.7rem; font-weight:600; color:var(--muted);">${updatedStr ? `Updated ${updatedStr}` : ""}</span>
      </div>

      <div class="wait-marquee-wrapper">
        <div class="wait-marquee-track" id="wait-marquee-track">
          ${cardsHtml}${cardsHtml}${cardsHtml}
        </div>
      </div>

      <p style="font-family:'Nunito',sans-serif; font-size:0.68rem; color:var(--muted); text-align:right; margin:0.4rem 0 0;">Sorted by wait time · updates every 15 min</p>
    </div>
  `;

  // ── JS-driven infinite marquee with drag support ──
  const track = document.getElementById("wait-marquee-track");
  if (!track) return;

  const cardEls = track.querySelectorAll(".wait-card");
  const numOriginal = rides.length;
  // Measure exact loop width: offset of the first card in the second set
  const loopWidth = cardEls[numOriginal] ? cardEls[numOriginal].offsetLeft - cardEls[0].offsetLeft
                                         : track.scrollWidth / 2;
  const wrapperWidth = track.parentElement.offsetWidth;
  const firstCardWidth = cardEls[0] ? cardEls[0].offsetWidth : 140;

  // Start offset so only the first card is visible at the right edge
  let offset = -(wrapperWidth - firstCardWidth);
  let speed = 0.5; // px per frame (~30px/s at 60fps)
  let paused = false;
  let dragActive = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let lastDragX = 0;
  let dragVelocity = 0;

  function applyOffset() {
    // Seamless wrap: when scrolled past one full set, jump back
    while (offset <= -loopWidth) offset += loopWidth;
    while (offset > 0) offset -= loopWidth;
    track.style.transform = `translateX(${offset}px)`;
  }

  applyOffset();

  let rafId;
  function tick() {
    if (!dragActive) {
      if (!paused) {
        offset -= speed;
      }
      // Apply momentum from drag release
      if (paused && Math.abs(dragVelocity) > 0.2) {
        offset += dragVelocity;
        dragVelocity *= 0.95;
        if (Math.abs(dragVelocity) <= 0.2) dragVelocity = 0;
      }
    }
    applyOffset();
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // Pause on hover (desktop)
  track.addEventListener("mouseenter", () => { if (!dragActive) paused = true; });
  track.addEventListener("mouseleave", () => { if (!dragActive) { paused = false; dragVelocity = 0; } });

  // ── Drag to scrub (mouse + touch) ──
  function startDrag(x) {
    dragActive = true;
    paused = true;
    dragStartX = x;
    dragStartOffset = offset;
    lastDragX = x;
    dragVelocity = 0;
    track.classList.add("is-dragging");
  }
  function moveDrag(x) {
    if (!dragActive) return;
    const delta = x - dragStartX;
    offset = dragStartOffset + delta;
    dragVelocity = x - lastDragX;
    lastDragX = x;
  }
  function endDrag() {
    if (!dragActive) return;
    dragActive = false;
    track.classList.remove("is-dragging");
    // Let momentum coast, then resume auto-scroll
    setTimeout(() => { if (!dragActive) { paused = false; dragVelocity = 0; } }, 3000);
  }

  // Mouse events
  track.addEventListener("mousedown", (e) => { e.preventDefault(); startDrag(e.clientX); });
  window.addEventListener("mousemove", (e) => moveDrag(e.clientX));
  window.addEventListener("mouseup", endDrag);

  // Touch events
  track.addEventListener("touchstart", (e) => startDrag(e.touches[0].clientX), { passive: true });
  window.addEventListener("touchmove", (e) => { if (dragActive) moveDrag(e.touches[0].clientX); }, { passive: true });
  window.addEventListener("touchend", endDrag);

  // ── Click-to-add: detect taps (not drags) on ride cards ──
  let dragDistance = 0;
  const origStartDrag = startDrag;
  startDrag = function(x) { dragDistance = 0; origStartDrag(x); };
  const origMoveDrag = moveDrag;
  moveDrag = function(x) { if (dragActive) dragDistance += Math.abs(x - lastDragX); origMoveDrag(x); };

  track.addEventListener("click", (e) => {
    // Ignore if this was a drag gesture (moved more than 5px)
    if (dragDistance > 5) return;
    const card = e.target.closest(".wait-card[data-ride]");
    if (!card) return;
    try {
      const ride = JSON.parse(decodeURIComponent(card.dataset.ride));
      openAddRideModal(ride, todayStr);
    } catch (err) { console.warn("[rec] click parse error:", err); }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => cancelAnimationFrame(rafId));
}

// ── "Add to Itinerary?" modal for ride recommendations ──
function openAddRideModal(ride, dateStr) {
  document.getElementById("rec-add-modal")?.remove();

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  // Suggest a start time: now + 10min walk, rounded to next 5 min
  const suggestMins = nowMins + 10;
  const rounded = Math.ceil(suggestMins / 5) * 5;
  const suggestH = String(Math.floor(rounded / 60) % 24).padStart(2, "0");
  const suggestM = String(rounded % 60).padStart(2, "0");
  const suggestTime = `${suggestH}:${suggestM}`;

  const waitColor = ride.wait <= 20 ? "#22c55e" : ride.wait <= 45 ? "#f59e0b" : "#ef4444";

  const overlay = document.createElement("div");
  overlay.id = "rec-add-modal";
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:400px; width:92vw;">
      <button class="modal-close-btn" id="rec-add-close" aria-label="Close">✕</button>
      <div class="modal-header" style="padding-bottom:0.5rem;">
        <p class="card-label">🎢 Ride Recommendation</p>
        <h2 style="font-size:1.4rem;">${escapeHtml(ride.name)}</h2>
        <p class="modal-meta">${escapeHtml(ride.location)}</p>
      </div>

      <div style="padding:0 1.75rem; margin-bottom:1rem;">
        <div style="display:flex; gap:1rem; justify-content:center;">
          <div style="text-align:center; padding:0.6rem 1rem; background:rgba(0,0,0,0.03); border-radius:10px;">
            <div style="font-family:'Mouse Memoirs',sans-serif; font-size:1.6rem; color:${waitColor};">${ride.wait}m</div>
            <div style="font-size:0.7rem; font-weight:700; color:var(--muted); text-transform:uppercase;">Current Wait</div>
          </div>
        </div>
      </div>

      <div style="padding:0 1.75rem 1.25rem;">
        <p style="font-size:0.85rem; font-weight:700; color:var(--ink); margin:0 0 0.75rem; text-align:center;">Add to today's itinerary?</p>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem;">
          <div style="flex:1;">
            <label style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Time</label>
            <input type="time" id="rec-add-time" value="${suggestTime}" style="width:100%; padding:0.5rem 0.6rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.88rem;" />
          </div>
          <div style="flex:1;">
            <label style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Type</label>
            <select id="rec-add-type" style="width:100%; padding:0.5rem 0.6rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.88rem;">
              <option value="Ride" selected>Ride</option>
              <option value="Lightning Lane">Lightning Lane</option>
            </select>
          </div>
        </div>
        <div style="display:flex; gap:0.75rem;">
          <button type="button" id="rec-add-cancel" class="secondary-button" style="flex:1; font-size:0.88rem;">Not Now</button>
          <button type="button" id="rec-add-confirm" class="primary-button" style="flex:1; font-size:0.88rem;">Add to Itinerary</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();

  document.getElementById("rec-add-close").addEventListener("click", closeModal);
  document.getElementById("rec-add-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  document.getElementById("rec-add-confirm").addEventListener("click", async () => {
    const time = document.getElementById("rec-add-time").value;
    const type = document.getElementById("rec-add-type").value;
    if (!time) return;

    const activity = {
      id: "act-" + Date.now(),
      date: dateStr,
      time: time,
      type: type,
      title: ride.name,
      location: ride.location,
      notes: `Added from recommendation — ${ride.wait}m wait at time of booking`,
      image: "",
      url: "",
    };

    await ItineraryDB.add(activity);
    closeModal();
    showToast(`Added ${ride.name} to your itinerary!`);

    // Refresh the dashboard itinerary section
    if (typeof renderDashboardItinerary === "function") renderDashboardItinerary();
  });
}

// ── Chaser Pin Spotlight ──────────────────────────────────────
// Rotates through current-year Chaser and Super Chaser pins.

async function renderChaserSpotlight() {
  const section = document.getElementById("chaser-spotlight-section");
  if (!section) return;

  let chasers = [];
  let favorites = [];
  try {
    chasers = await apiFetch("/pins/chasers");
  } catch (e) {
    return; // silently hide if API unavailable
  }
  try {
    favorites = await apiFetch("/my/pins/favorites");
  } catch (e) {
    favorites = []; // not logged in or none — fine
  }

  // Merge: favorites first, then chasers, deduped by id
  const seen = new Set();
  const pins = [];
  for (const p of (favorites || [])) {
    if (!seen.has(p.id)) { seen.add(p.id); pins.push({ ...p, favorite: true }); }
  }
  for (const p of (chasers || [])) {
    if (!seen.has(p.id)) { seen.add(p.id); pins.push(p); }
  }

  if (pins.length === 0) return;

  section.style.display = "";

  const year = new Date().getFullYear();
  const hasFavorites = favorites && favorites.length > 0;
  const label = hasFavorites ? "Pin Spotlight" : "Chaser Spotlight";
  const title = hasFavorites ? "Your Pins" : `${year} Chaser Pins`;

  // Build tile markup for a pin
  const tileHtml = (pin) => {
    const badge = pin.favorite
      ? `<span class="pin-marquee-badge favorite"><i class="ph-fill ph-star"></i></span>`
      : pin.chaser === 2
        ? `<span class="pin-marquee-badge super">Super</span>`
        : pin.chaser === 1
          ? `<span class="pin-marquee-badge">Chaser</span>`
          : "";
    const img = pin.image
      ? `<img src="/api/pins/thumbnail/${pin.image}" alt="${escapeHtml(pin.name)}" class="pin-marquee-img" loading="lazy" />`
      : `<div class="pin-marquee-placeholder">📌</div>`;
    return `
      <a class="pin-marquee-tile ${pin.collected ? "collected" : ""}" href="pins.html">
        <div class="pin-marquee-img-wrap">
          ${img}
          ${badge}
          ${pin.collected ? '<span class="pin-marquee-check"><i class="ph-bold ph-check"></i></span>' : ""}
        </div>
        <p class="pin-marquee-name" title="${escapeHtml(pin.name)}">${escapeHtml(pin.name)}</p>
      </a>
    `;
  };

  // Duplicate the list so the animation can loop seamlessly
  const tilesHtml = pins.map(tileHtml).join("");

  section.innerHTML = `
    <div class="chaser-spotlight-card">
      <div class="chaser-spotlight-header">
        <div>
          <p class="card-label"><i class="ph-bold ph-push-pin"></i> ${label}</p>
          <h2 class="section-title">${title}</h2>
        </div>
        <a href="pins.html" class="secondary-button small-button" style="text-decoration:none;">View All Pins</a>
      </div>
      <div class="pin-marquee" id="pin-marquee" data-count="${pins.length}">
        <div class="pin-marquee-track">
          ${tilesHtml}
          ${pins.length > 1 ? tilesHtml : ""}
        </div>
      </div>
    </div>
  `;

  if (pins.length > 1) initPinMarquee(section.querySelector(".pin-marquee"));
}

// Auto-scroll + drag-to-scroll for the dashboard pin marquee
function initPinMarquee(marquee) {
  if (!marquee) return;

  const SPEED_PX_PER_SEC = 30; // gentle left-to-right drift
  const RESUME_DELAY_MS = 1500;

  let rafId = null;
  let lastTs = 0;
  let paused = false;
  let resumeTimer = null;

  // Half of scrollWidth is where the duplicated content starts — looping point
  const halfWidth = () => marquee.scrollWidth / 2;

  function step(ts) {
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (!paused) {
      marquee.scrollLeft += SPEED_PX_PER_SEC * dt;
      const hw = halfWidth();
      if (marquee.scrollLeft >= hw) marquee.scrollLeft -= hw;
    }
    rafId = requestAnimationFrame(step);
  }

  function pause() {
    paused = true;
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  }
  function resumeSoon() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { paused = false; lastTs = 0; }, RESUME_DELAY_MS);
  }

  marquee.addEventListener("mouseenter", pause);
  marquee.addEventListener("mouseleave", () => { resumeSoon(); });

  // Normalize scrollLeft on any manual scroll so the loop never exposes empty space
  marquee.addEventListener("scroll", () => {
    const hw = halfWidth();
    if (marquee.scrollLeft >= hw) marquee.scrollLeft -= hw;
    else if (marquee.scrollLeft < 0) marquee.scrollLeft += hw;
  }, { passive: true });

  // ── Mouse drag-to-scroll ────────────────────────────────
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let dragMoved = false;

  marquee.addEventListener("mousedown", (e) => {
    isDown = true;
    dragMoved = false;
    startX = e.pageX;
    startScroll = marquee.scrollLeft;
    pause();
    marquee.classList.add("is-dragging");
  });
  window.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 3) dragMoved = true;
    marquee.scrollLeft = startScroll - dx;
  });
  const endDrag = () => {
    if (!isDown) return;
    isDown = false;
    marquee.classList.remove("is-dragging");
    resumeSoon();
  };
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("mouseleave", endDrag);

  // Swallow tile click right after a drag so users don't accidentally navigate
  marquee.addEventListener("click", (e) => {
    if (dragMoved) {
      e.preventDefault();
      e.stopPropagation();
      dragMoved = false;
    }
  }, true);

  // ── Touch: native pan-x scroll handles the motion ───────
  marquee.addEventListener("touchstart", () => { pause(); }, { passive: true });
  marquee.addEventListener("touchend",   () => { resumeSoon(); }, { passive: true });
  marquee.addEventListener("touchcancel",() => { resumeSoon(); }, { passive: true });

  rafId = requestAnimationFrame(step);
}